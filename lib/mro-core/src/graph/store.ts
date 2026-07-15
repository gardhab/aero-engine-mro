import type { GraphData, GraphNode } from "../types.js";
import { filterGraph, type GraphFilter } from "./projection.js";

/** Property key that marks a node as manually corrected by a human. Internal — stripped from API responses. */
export const CORRECTED_FLAG = "__corrected";

/** Remove internal (double-underscore) keys before exposing node properties. */
export function stripInternalProps(
  props: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (!k.startsWith("__")) out[k] = v;
  }
  return out;
}

function publicNode(node: GraphNode): GraphNode {
  return { ...node, properties: stripInternalProps(node.properties) };
}

/**
 * Swappable graph-access interface. The domain layer and routes depend only on
 * this contract; the concrete backend (embedded Kùzu today, Neo4j later) is an
 * implementation detail chosen at composition time.
 */
export interface GraphStore {
  init(): Promise<void>;
  /** Replace the entire materialized graph (used on seed / full rebuild). */
  replaceAll(data: GraphData): Promise<void>;
  /**
   * Additively merge nodes/edges. Existing nodes keep their (possibly corrected)
   * properties; only new nodes/edges are inserted. Used on pipeline runs.
   */
  merge(data: GraphData): Promise<void>;
  getGraph(filter?: GraphFilter): Promise<GraphData>;
  getNode(id: string): Promise<GraphNode | null>;
  /** Merge new properties into a node (human correction). Returns updated node. */
  updateNode(
    id: string,
    properties: Record<string, unknown>,
  ): Promise<GraphNode | null>;
  close(): Promise<void>;
}

/**
 * Reference in-memory implementation. Used as a safe fallback when the native
 * graph backend is unavailable; behaviour is identical from the caller's view.
 */
export class InMemoryGraphStore implements GraphStore {
  private data: GraphData = { nodes: [], edges: [] };

  async init(): Promise<void> {}

  async replaceAll(data: GraphData): Promise<void> {
    this.data = {
      nodes: data.nodes.map((n) => ({ ...n, properties: { ...n.properties } })),
      edges: [...data.edges],
    };
  }

  async merge(data: GraphData): Promise<void> {
    const byId = new Map(this.data.nodes.map((n) => [n.id, n]));
    for (const n of data.nodes) {
      const existing = byId.get(n.id);
      if (!existing) {
        const copy = { ...n, properties: { ...n.properties } };
        this.data.nodes.push(copy);
        byId.set(n.id, copy);
      } else if (!existing.properties[CORRECTED_FLAG]) {
        // Refresh canonical fields for non-corrected nodes so the graph stays
        // in sync with domain state; corrected nodes are preserved as-is.
        existing.type = n.type;
        existing.label = n.label;
        existing.properties = { ...n.properties };
      }
    }
    const edgeIds = new Set(this.data.edges.map((e) => e.id));
    for (const e of data.edges) {
      if (!edgeIds.has(e.id)) {
        this.data.edges.push(e);
        edgeIds.add(e.id);
      }
    }
  }

  async getGraph(filter?: GraphFilter): Promise<GraphData> {
    const filtered = filterGraph(this.data, filter);
    return { nodes: filtered.nodes.map(publicNode), edges: filtered.edges };
  }

  async getNode(id: string): Promise<GraphNode | null> {
    const node = this.data.nodes.find((n) => n.id === id);
    return node ? publicNode(node) : null;
  }

  async updateNode(
    id: string,
    properties: Record<string, unknown>,
  ): Promise<GraphNode | null> {
    const node = this.data.nodes.find((n) => n.id === id);
    if (!node) return null;
    node.properties = {
      ...node.properties,
      ...properties,
      [CORRECTED_FLAG]: true,
    };
    return publicNode(node);
  }

  async close(): Promise<void> {}
}
