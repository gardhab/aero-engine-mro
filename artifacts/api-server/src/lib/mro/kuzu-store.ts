import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import type {
  GraphData,
  GraphEdge,
  GraphFilter,
  GraphNode,
  GraphStore,
} from "@workspace/mro-core";
import {
  filterGraph,
  CORRECTED_FLAG,
  stripInternalProps,
} from "@workspace/mro-core";
import { logger } from "../logger";

// kuzu ships a native addon; load it via require so esbuild leaves it external.
const require = createRequire(import.meta.url);

interface KuzuModule {
  Database: new (path: string) => unknown;
  Connection: new (db: unknown) => KuzuConnection;
}
interface KuzuConnection {
  query(cypher: string): Promise<KuzuQueryResult>;
  prepare(cypher: string): Promise<unknown>;
  execute(
    prepared: unknown,
    params: Record<string, unknown>,
  ): Promise<KuzuQueryResult>;
}
interface KuzuQueryResult {
  getAll(): Promise<Record<string, unknown>[]>;
}

/**
 * Embedded-Kùzu implementation of the swappable GraphStore. Uses a generic
 * property-graph schema (Entity nodes + Rel edges) with JSON-encoded properties,
 * so the ontology's instance graph maps cleanly without per-class DDL churn.
 */
export class KuzuGraphStore implements GraphStore {
  private conn: KuzuConnection | null = null;

  constructor(private readonly dbPath: string) {}

  async init(): Promise<void> {
    const kuzu = require("kuzu") as KuzuModule;
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    const db = new kuzu.Database(this.dbPath);
    this.conn = new kuzu.Connection(db);
    await this.conn.query(
      "CREATE NODE TABLE IF NOT EXISTS Entity(id STRING, type STRING, label STRING, props STRING, PRIMARY KEY(id))",
    );
    await this.conn.query(
      "CREATE REL TABLE IF NOT EXISTS Rel(FROM Entity TO Entity, id STRING, label STRING)",
    );
  }

  private c(): KuzuConnection {
    if (!this.conn) throw new Error("KuzuGraphStore not initialized");
    return this.conn;
  }

  async replaceAll(data: GraphData): Promise<void> {
    const conn = this.c();
    await conn.query("MATCH ()-[r:Rel]->() DELETE r");
    await conn.query("MATCH (n:Entity) DELETE n");
    await this.insert(data);
  }

  async merge(data: GraphData): Promise<void> {
    const conn = this.c();
    // Map existing node id -> whether it was manually corrected.
    const existingCorrected = new Map<string, boolean>();
    const nodeRes = await conn.query(
      "MATCH (n:Entity) RETURN n.id AS id, n.props AS props",
    );
    for (const row of await nodeRes.getAll()) {
      const props = parseProps(row.props);
      existingCorrected.set(String(row.id), props[CORRECTED_FLAG] === true);
    }
    const existingEdges = new Set<string>();
    const edgeRes = await conn.query("MATCH ()-[r:Rel]->() RETURN r.id AS id");
    for (const row of await edgeRes.getAll()) existingEdges.add(String(row.id));

    const newNodes = data.nodes.filter((n) => !existingCorrected.has(n.id));
    // Refresh canonical fields for existing, non-corrected nodes.
    const refreshNodes = data.nodes.filter(
      (n) => existingCorrected.get(n.id) === false,
    );
    if (refreshNodes.length > 0) {
      const stmt = await conn.prepare(
        "MATCH (n:Entity {id: $id}) SET n.type = $type, n.label = $label, n.props = $props",
      );
      for (const n of refreshNodes) {
        await conn.execute(stmt, {
          id: n.id,
          type: n.type,
          label: n.label,
          props: JSON.stringify(n.properties ?? {}),
        });
      }
    }

    const newEdges = data.edges.filter((e) => !existingEdges.has(e.id));
    await this.insert({ nodes: newNodes, edges: newEdges });
  }

  private async insert(data: GraphData): Promise<void> {
    const conn = this.c();
    if (data.nodes.length > 0) {
      const stmt = await conn.prepare(
        "CREATE (n:Entity {id: $id, type: $type, label: $label, props: $props})",
      );
      for (const n of data.nodes) {
        await conn.execute(stmt, {
          id: n.id,
          type: n.type,
          label: n.label,
          props: JSON.stringify(n.properties ?? {}),
        });
      }
    }
    if (data.edges.length > 0) {
      const stmt = await conn.prepare(
        "MATCH (a:Entity {id: $src}), (b:Entity {id: $tgt}) CREATE (a)-[:Rel {id: $id, label: $label}]->(b)",
      );
      for (const e of data.edges) {
        await conn.execute(stmt, {
          src: e.source,
          tgt: e.target,
          id: e.id,
          label: e.label,
        });
      }
    }
  }

  async getGraph(filter?: GraphFilter): Promise<GraphData> {
    const conn = this.c();
    const nodeRows = await (
      await conn.query(
        "MATCH (n:Entity) RETURN n.id AS id, n.type AS type, n.label AS label, n.props AS props",
      )
    ).getAll();
    const edgeRows = await (
      await conn.query(
        "MATCH (a:Entity)-[r:Rel]->(b:Entity) RETURN r.id AS id, a.id AS source, b.id AS target, r.label AS label",
      )
    ).getAll();

    const nodes: GraphNode[] = nodeRows.map((r) => ({
      id: String(r.id),
      type: String(r.type),
      label: String(r.label),
      properties: stripInternalProps(parseProps(r.props)),
    }));
    const edges: GraphEdge[] = edgeRows.map((r) => ({
      id: String(r.id),
      source: String(r.source),
      target: String(r.target),
      label: String(r.label),
    }));
    return filterGraph({ nodes, edges }, filter);
  }

  async getNode(id: string): Promise<GraphNode | null> {
    const conn = this.c();
    const stmt = await conn.prepare(
      "MATCH (n:Entity {id: $id}) RETURN n.id AS id, n.type AS type, n.label AS label, n.props AS props",
    );
    const rows = await (await conn.execute(stmt, { id })).getAll();
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: String(r.id),
      type: String(r.type),
      label: String(r.label),
      properties: stripInternalProps(parseProps(r.props)),
    };
  }

  async updateNode(
    id: string,
    properties: Record<string, unknown>,
  ): Promise<GraphNode | null> {
    const conn = this.c();
    // Read raw (including internal flags) so we merge onto full stored props.
    const stmt0 = await conn.prepare(
      "MATCH (n:Entity {id: $id}) RETURN n.props AS props",
    );
    const rows = await (await conn.execute(stmt0, { id })).getAll();
    if (rows.length === 0) return null;
    const merged = {
      ...parseProps(rows[0].props),
      ...properties,
      [CORRECTED_FLAG]: true,
    };
    const stmt = await conn.prepare(
      "MATCH (n:Entity {id: $id}) SET n.props = $props",
    );
    await conn.execute(stmt, { id, props: JSON.stringify(merged) });
    return (await this.getNode(id)) as GraphNode;
  }

  async close(): Promise<void> {
    this.conn = null;
  }
}

function parseProps(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string" || raw.length === 0) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    logger.warn({ err }, "Failed to parse graph node props");
    return {};
  }
}
