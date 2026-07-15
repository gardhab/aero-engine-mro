import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  enginesTable,
  readingsTable,
  rulesTable,
  recommendationsTable,
  sapNotificationsTable,
  activityTable,
} from "@workspace/db";
import {
  buildGraph,
  buildRecommendation,
  computeEngineHealth,
  createSapAdapter,
  egtMarginOf,
  evaluateRules,
  nodeCountByClass,
  resolveSapConfig,
  type ActivityType,
  type OntologyClass,
  type PipelineResult,
  type Rule,
  type SapAdapter,
} from "@workspace/mro-core";
import { getGraphStore } from "./graph";
import { toEngine, toReading, toRecommendation, toRule } from "./mappers";
import { logger } from "../logger";

let sapAdapter: SapAdapter | null = null;
export function getSapAdapter(): SapAdapter {
  if (!sapAdapter) sapAdapter = createSapAdapter(resolveSapConfig(process.env));
  return sapAdapter;
}

const ACTIVE_STATUSES = ["pending", "approved", "pushed"] as const;

export async function logActivity(
  type: ActivityType,
  description: string,
  opts: { engineId?: string; recommendationId?: string } = {},
): Promise<void> {
  await db.insert(activityTable).values({
    id: randomUUID(),
    type,
    description,
    engineId: opts.engineId ?? null,
    recommendationId: opts.recommendationId ?? null,
  });
}

/** Recompute and persist an engine's health snapshot from its readings. */
export async function recomputeEngine(esn: string): Promise<void> {
  const [engineRow] = await db
    .select()
    .from(enginesTable)
    .where(eq(enginesTable.esn, esn));
  if (!engineRow) return;
  const readingRows = await db
    .select()
    .from(readingsTable)
    .where(eq(readingsTable.engineId, esn));
  const ruleRows = await db.select().from(rulesTable);
  const readings = readingRows.map(toReading);
  const rules = ruleRows.map(toRule);
  const engine = toEngine(engineRow, 0);
  const health = computeEngineHealth(engine, readings, rules);
  await db
    .update(enginesTable)
    .set({
      healthScore: health.healthScore,
      status: health.status,
      egtMargin: egtMarginOf(readings),
      lastUpdated: new Date(),
    })
    .where(eq(enginesTable.esn, esn));
}

/**
 * Run the decision pipeline across the fleet: evaluate rules per engine, create
 * new work recommendations (de-duplicated against active ones), recompute engine
 * health, and merge the new recommendation nodes into the knowledge graph.
 */
export async function runPipeline(now: Date = new Date()): Promise<PipelineResult> {
  const engineRows = await db.select().from(enginesTable);
  const ruleRows = await db.select().from(rulesTable);
  const rules = ruleRows.map(toRule);

  let rulesFired = 0;
  const newRecommendationIds: string[] = [];

  for (const engineRow of engineRows) {
    const readingRows = await db
      .select()
      .from(readingsTable)
      .where(eq(readingsTable.engineId, engineRow.esn));
    const readings = readingRows.map(toReading);
    const engine = toEngine(engineRow, 0);
    const matches = evaluateRules(rules, readings);
    rulesFired += matches.length;

    for (const match of matches) {
      const existing = await db
        .select({ id: recommendationsTable.id })
        .from(recommendationsTable)
        .where(
          and(
            eq(recommendationsTable.engineId, engine.esn),
            eq(recommendationsTable.ruleId, match.rule.id),
            inArray(recommendationsTable.status, [...ACTIVE_STATUSES]),
          ),
        );
      if (existing.length > 0) continue;

      const rec = buildRecommendation({
        engine,
        match,
        now,
        id: randomUUID(),
      });
      const autoApproved = match.rule.autoApprove && match.confidence >= 0.8;
      rec.status = autoApproved ? "approved" : "pending";
      if (autoApproved) rec.reviewedBy = "Auto-approval (rule policy)";

      await db.insert(recommendationsTable).values({
        ...rec,
        createdAt: now,
        updatedAt: now,
      });
      newRecommendationIds.push(rec.id);
      await logActivity(
        "recommendation",
        `New ${rec.priority.toUpperCase()} recommendation for ${engine.esn}: ${rec.failureMode}`,
        { engineId: engine.esn, recommendationId: rec.id },
      );
    }

    await recomputeEngine(engine.esn);
  }

  // Merge new recommendation nodes into the graph (corrections preserved).
  await rebuildGraphMerge();

  await logActivity(
    "pipeline",
    `Decision pipeline evaluated ${engineRows.length} engines and created ${newRecommendationIds.length} recommendation(s).`,
  );

  return {
    enginesEvaluated: engineRows.length,
    rulesFired,
    recommendationsCreated: newRecommendationIds.length,
    newRecommendationIds,
  };
}

/** Rebuild the full projection and merge it (adds new nodes, keeps corrections). */
export async function rebuildGraphMerge(): Promise<void> {
  const store = await getGraphStore();
  const engineRows = await db.select().from(enginesTable);
  const ruleRows = await db.select().from(rulesTable);
  const recRows = await db.select().from(recommendationsTable);
  const engines = engineRows.map((e) => toEngine(e, 0));
  const rules = ruleRows.map(toRule);
  const recs = recRows.map(toRecommendation);
  const graph = buildGraph(engines, recs, rules);
  await store.merge(graph);
}

/** Full graph rebuild from scratch (used on seed). */
export async function rebuildGraphReplace(): Promise<void> {
  const store = await getGraphStore();
  const engineRows = await db.select().from(enginesTable);
  const ruleRows = await db.select().from(rulesTable);
  const recRows = await db.select().from(recommendationsTable);
  const engines = engineRows.map((e) => toEngine(e, 0));
  const rules = ruleRows.map(toRule);
  const recs = recRows.map(toRecommendation);
  await store.replaceAll(buildGraph(engines, recs, rules));
}

export interface SapPushOutcome {
  status: "success" | "failed";
  notificationNumber?: string;
  errorMessage?: string;
}

export type SapPushResult =
  | { kind: "not_found" }
  | { kind: "invalid_status"; message: string }
  | { kind: "pushed"; outcome: SapPushOutcome };

// Only these statuses may be pushed to SAP: a fresh approval, or a retry of a
// previously failed push. Pending/rejected/already-pushed are rejected.
const PUSHABLE_STATUSES = new Set(["approved", "failed"]);

/** Push a recommendation to SAP (mock or live), recording the attempt. */
export async function pushRecommendationToSap(
  recommendationId: string,
): Promise<SapPushResult> {
  const [row] = await db
    .select()
    .from(recommendationsTable)
    .where(eq(recommendationsTable.id, recommendationId));
  if (!row) return { kind: "not_found" };
  if (!PUSHABLE_STATUSES.has(row.status)) {
    return {
      kind: "invalid_status",
      message:
        row.status === "pushed"
          ? "Recommendation has already been pushed to SAP."
          : `Only approved recommendations can be pushed to SAP (current status: ${row.status}).`,
    };
  }
  const rec = toRecommendation(row);
  const adapter = getSapAdapter();
  const result = await adapter.push(rec);

  await db.insert(sapNotificationsTable).values({
    id: randomUUID(),
    recommendationId: rec.id,
    notificationNumber: result.notificationNumber ?? null,
    status: result.status,
    mode: result.mode,
    errorMessage: result.errorMessage ?? null,
    payload: result.payload as unknown as Record<string, unknown>,
  });

  const now = new Date();
  if (result.status === "success") {
    await db
      .update(recommendationsTable)
      .set({
        status: "pushed",
        sapNotificationNumber: result.notificationNumber ?? null,
        updatedAt: now,
      })
      .where(eq(recommendationsTable.id, rec.id));
    await logActivity(
      "sap_push",
      `Recommendation ${rec.id} pushed to SAP as notification ${result.notificationNumber}.`,
      { engineId: rec.engineId, recommendationId: rec.id },
    );
  } else {
    await db
      .update(recommendationsTable)
      .set({ status: "failed", updatedAt: now })
      .where(eq(recommendationsTable.id, rec.id));
    await logActivity(
      "sap_push",
      `SAP push failed for recommendation ${rec.id}: ${result.errorMessage}`,
      { engineId: rec.engineId, recommendationId: rec.id },
    );
    logger.warn(
      { recommendationId: rec.id, error: result.errorMessage },
      "SAP push failed",
    );
  }
  return {
    kind: "pushed",
    outcome: {
      status: result.status,
      notificationNumber: result.notificationNumber,
      errorMessage: result.errorMessage,
    },
  };
}

/** Count active (open) recommendations per engine. */
export async function openRecommendationCounts(): Promise<Map<string, number>> {
  const rows = await db
    .select({
      engineId: recommendationsTable.engineId,
      status: recommendationsTable.status,
    })
    .from(recommendationsTable);
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (r.status === "pending" || r.status === "approved") {
      counts.set(r.engineId, (counts.get(r.engineId) ?? 0) + 1);
    }
  }
  return counts;
}

/** Enrich ontology classes with live instance (graph) and rule reference counts. */
export function enrichOntologyClasses(
  classes: OntologyClass[],
  rules: Rule[],
  graphCounts: Record<string, number>,
): OntologyClass[] {
  const ruleCoreClasses = new Set([
    "Rule",
    "Sensor",
    "FailureMode",
    "Recommendation",
    "Component",
  ]);
  return classes.map((c) => ({
    ...c,
    instanceCount: graphCounts[c.id] ?? 0,
    ruleCount: ruleCoreClasses.has(c.id) ? rules.length : 0,
  }));
}

export { nodeCountByClass };
