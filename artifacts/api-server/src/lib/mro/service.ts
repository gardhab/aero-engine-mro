import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  enginesTable,
  readingsTable,
  rulesTable,
  recommendationsTable,
  sapNotificationsTable,
  shopVisitExchangesTable,
  activityTable,
  llpsTable,
} from "@workspace/db";
import {
  LLP_CRITICAL_REMAINING,
  LLP_RULE_ID,
  LLP_WARNING_REMAINING,
  PARAMETER_BY_CODE,
  buildGraph,
  buildLlpRecommendation,
  buildRecommendation,
  computeEngineHealth,
  createSapAdapter,
  egtMarginOf,
  evaluateRules,
  limitingLlp,
  nodeCountByClass,
  relevantLlpsForModules,
  resolveSapConfig,
  supersededSensorEdgeIds,
  toLifeLimitedParts,
  type ActivityType,
  type OntologyClass,
  type PipelineResult,
  type Rule,
  type SapAdapter,
} from "@workspace/mro-core";
import { getGraphStore } from "./graph";
import {
  ensureWorkPackageForRecommendation,
  loadAllWorkPackageTasks,
} from "./work-packages";
import {
  toEngine,
  toEngineLlp,
  toReading,
  toRecommendation,
  toRule,
  toShopVisitExchange,
} from "./mappers";
import { logger } from "../logger";

let sapAdapter: SapAdapter | null = null;
export function getSapAdapter(): SapAdapter {
  if (!sapAdapter) sapAdapter = createSapAdapter(resolveSapConfig(process.env));
  return sapAdapter;
}

const ACTIVE_STATUSES = ["pending", "approved", "pushed"] as const;

import { logActivity } from "./activity";
export { logActivity };

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
    const llpRows = await db
      .select()
      .from(llpsTable)
      .where(eq(llpsTable.engineId, engineRow.esn));
    const llps = llpRows.map(toEngineLlp);
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

      // Attach the real limiting parts in the module this workscope touches.
      const matchModule = PARAMETER_BY_CODE[match.rule.parameter]?.module;
      const rec = buildRecommendation({
        engine,
        match,
        now,
        id: randomUUID(),
        llps: toLifeLimitedParts(
          relevantLlpsForModules(llps, matchModule ? [matchModule] : []),
        ),
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
      // Auto-approved recommendations spawn their TCN work package immediately.
      if (autoApproved) {
        await ensureWorkPackageForRecommendation(rec);
      }
    }

    // LLP remaining-life policy: if the engine's limiting part falls below the
    // planning threshold, raise a dedicated shop-visit recommendation.
    const limiting = limitingLlp(llps);
    if (limiting && limiting.remainingCycles <= LLP_WARNING_REMAINING) {
      const existing = await db
        .select({
          id: recommendationsTable.id,
          priority: recommendationsTable.priority,
          status: recommendationsTable.status,
        })
        .from(recommendationsTable)
        .where(
          and(
            eq(recommendationsTable.engineId, engine.esn),
            eq(recommendationsTable.ruleId, LLP_RULE_ID),
            inArray(recommendationsTable.status, [...ACTIVE_STATUSES]),
          ),
        );
      const driving = llps
        .filter((p) => p.remainingCycles <= LLP_WARNING_REMAINING)
        .sort((a, b) => a.remainingCycles - b.remainingCycles);
      if (existing.length === 0) {
        const rec = buildLlpRecommendation(engine, driving, now, randomUUID());
        await db.insert(recommendationsTable).values({
          ...rec,
          createdAt: now,
          updatedAt: now,
        });
        newRecommendationIds.push(rec.id);
        await logActivity(
          "recommendation",
          `New ${rec.priority.toUpperCase()} recommendation for ${engine.esn}: ${rec.failureMode} (${limiting.partName} ${limiting.remainingCycles} cycles remaining)`,
          { engineId: engine.esn, recommendationId: rec.id },
        );
      } else {
        // Escalate an active, not-yet-dispatched LLP recommendation when the
        // limiting part has worsened into the critical band since it was raised.
        const active = existing[0];
        const fresh = buildLlpRecommendation(engine, driving, now, active.id);
        const escalated =
          fresh.priority === "urgent" &&
          active.priority !== "urgent" &&
          (active.status === "pending" || active.status === "approved");
        if (escalated) {
          await db
            .update(recommendationsTable)
            .set({
              priority: fresh.priority,
              severity: fresh.severity,
              faultDescription: fresh.faultDescription,
              component: fresh.component,
              tasks: fresh.tasks,
              lifeLimitedParts: fresh.lifeLimitedParts,
              affectedModules: fresh.affectedModules,
              estimatedDurationHours: fresh.estimatedDurationHours,
              turnaroundDays: fresh.turnaroundDays,
              recommendedInductionDate: fresh.recommendedInductionDate,
              recommendedCompletionDate: fresh.recommendedCompletionDate,
              updatedAt: now,
            })
            .where(eq(recommendationsTable.id, active.id));
          await logActivity(
            "recommendation",
            `Escalated recommendation for ${engine.esn} to URGENT: ${limiting.partName} now ${limiting.remainingCycles} cycles remaining (critical threshold ${LLP_CRITICAL_REMAINING})`,
            { engineId: engine.esn, recommendationId: active.id },
          );
        }
      }
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
  const graph = buildGraph(...(await loadGraphInputs()));
  await store.merge(graph);
  await pruneSupersededDiagnosticEdges();
}

/**
 * Projection-migration cleanup: the sensor/observation split moved the
 * diagnostic chain (`evaluates`, `indicates`) from the physical Sensor onto
 * MeasurementObservation nodes. Merge never deletes, so remove pre-split
 * sensor-level edges — but only those with an observation-level replacement
 * in the same rule/parameter context (see supersededSensorEdgeIds).
 */
async function pruneSupersededDiagnosticEdges(): Promise<void> {
  const store = await getGraphStore();
  const stale = supersededSensorEdgeIds(await store.getGraph());
  if (stale.length > 0) {
    await store.deleteEdges(stale);
    logger.info({ removed: stale.length }, "Pruned superseded sensor-level diagnostic edges");
  }
}

/** Full graph rebuild from scratch (used on seed). */
export async function rebuildGraphReplace(): Promise<void> {
  const store = await getGraphStore();
  await store.replaceAll(buildGraph(...(await loadGraphInputs())));
}

/** Load and map everything the graph projection consumes, in parallel. */
async function loadGraphInputs() {
  const [
    engineRows,
    ruleRows,
    recRows,
    exchangeRows,
    llpRows,
    wpTasks,
    latestReadingRows,
  ] = await Promise.all([
    db.select().from(enginesTable),
    db.select().from(rulesTable),
    db.select().from(recommendationsTable),
    db.select().from(shopVisitExchangesTable),
    db.select().from(llpsTable),
    loadAllWorkPackageTasks(),
    // Latest reading per engine+parameter → MeasurementObservation nodes.
    db
      .selectDistinctOn([readingsTable.engineId, readingsTable.parameter])
      .from(readingsTable)
      .orderBy(
        readingsTable.engineId,
        readingsTable.parameter,
        desc(readingsTable.cycle),
      ),
  ]);
  return [
    engineRows.map((e) => toEngine(e, 0)),
    recRows.map(toRecommendation),
    ruleRows.map(toRule),
    exchangeRows.map(toShopVisitExchange),
    llpRows.map(toEngineLlp),
    wpTasks,
    latestReadingRows.map(toReading),
  ] as const;
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
    "DiagnosticRuleDefinition",
    "Sensor",
    "MeasurementObservation",
    "FailureMode",
    "MaintenanceRecommendation",
    "Component",
  ]);
  return classes.map((c) => ({
    ...c,
    instanceCount: graphCounts[c.id] ?? 0,
    ruleCount: ruleCoreClasses.has(c.id) ? rules.length : 0,
  }));
}

export { nodeCountByClass };
