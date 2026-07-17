import { Router, type IRouter } from "express";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { db, recommendationsTable, sapNotificationsTable } from "@workspace/db";
import {
  ListRecommendationsResponse,
  GetRecommendationResponse,
  UpdateRecommendationResponse,
  ApproveRecommendationResponse,
  RejectRecommendationResponse,
  PushRecommendationToSapResponse,
  RunPipelineResponse,
} from "@workspace/api-zod";
import { toRecommendation, toSapNotification } from "../lib/mro/mappers";
import {
  logActivity,
  pushRecommendationToSap,
  rebuildGraphMerge,
  recomputeEngine,
  runPipeline,
} from "../lib/mro/service";
import { ensureWorkPackageForRecommendation } from "../lib/mro/work-packages";

const router: IRouter = Router();

router.get("/recommendations", async (req, res): Promise<void> => {
  const conditions: SQL[] = [];
  if (typeof req.query.status === "string") {
    conditions.push(eq(recommendationsTable.status, req.query.status));
  }
  if (typeof req.query.engineId === "string") {
    conditions.push(eq(recommendationsTable.engineId, req.query.engineId));
  }
  const rows = await db
    .select()
    .from(recommendationsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(recommendationsTable.createdAt));
  const data = ListRecommendationsResponse.parse(rows.map(toRecommendation));
  res.json(data);
});

router.get("/recommendations/:id", async (req, res): Promise<void> => {
  const row = await findRec(req.params.id);
  if (!row) {
    res.status(404).json({ error: "Recommendation not found" });
    return;
  }
  res.json(GetRecommendationResponse.parse(toRecommendation(row)));
});

router.patch("/recommendations/:id", async (req, res): Promise<void> => {
  const row = await findRec(req.params.id);
  if (!row) {
    res.status(404).json({ error: "Recommendation not found" });
    return;
  }
  const body = req.body as Record<string, unknown>;
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of [
    "priority",
    "reviewNotes",
    "estimatedDurationHours",
    "turnaroundDays",
    "recommendedInductionDate",
    "recommendedCompletionDate",
  ]) {
    if (body[key] !== undefined) patch[key] = body[key];
  }
  const [updated] = await db
    .update(recommendationsTable)
    .set(patch)
    .where(eq(recommendationsTable.id, req.params.id))
    .returning();
  res.json(UpdateRecommendationResponse.parse(toRecommendation(updated)));
});

router.post("/recommendations/:id/approve", async (req, res): Promise<void> => {
  const row = await findRec(req.params.id);
  if (!row) {
    res.status(404).json({ error: "Recommendation not found" });
    return;
  }
  const body = (req.body ?? {}) as { notes?: string; reviewedBy?: string };
  const [updated] = await db
    .update(recommendationsTable)
    .set({
      status: "approved",
      reviewedBy: body.reviewedBy ?? "Maintenance Planner",
      reviewNotes: body.notes ?? row.reviewNotes,
      updatedAt: new Date(),
    })
    .where(eq(recommendationsTable.id, req.params.id))
    .returning();
  await logActivity(
    "approval",
    `Recommendation ${updated.id} approved for ${updated.engineId}.`,
    { engineId: updated.engineId, recommendationId: updated.id },
  );
  // Approval spawns the TCN-tracked shop-visit work package; refresh the
  // knowledge graph so its MaintenanceTask nodes appear immediately.
  if (await ensureWorkPackageForRecommendation(updated)) {
    await rebuildGraphMerge();
  }
  res.json(ApproveRecommendationResponse.parse(toRecommendation(updated)));
});

router.post("/recommendations/:id/reject", async (req, res): Promise<void> => {
  const row = await findRec(req.params.id);
  if (!row) {
    res.status(404).json({ error: "Recommendation not found" });
    return;
  }
  const body = (req.body ?? {}) as { notes?: string; reviewedBy?: string };
  const [updated] = await db
    .update(recommendationsTable)
    .set({
      status: "rejected",
      reviewedBy: body.reviewedBy ?? "Maintenance Planner",
      reviewNotes: body.notes ?? row.reviewNotes,
      updatedAt: new Date(),
    })
    .where(eq(recommendationsTable.id, req.params.id))
    .returning();
  await recomputeEngine(updated.engineId);
  await logActivity(
    "rejection",
    `Recommendation ${updated.id} rejected for ${updated.engineId}.`,
    { engineId: updated.engineId, recommendationId: updated.id },
  );
  res.json(RejectRecommendationResponse.parse(toRecommendation(updated)));
});

router.post(
  "/recommendations/:id/push-to-sap",
  async (req, res): Promise<void> => {
    const result = await pushRecommendationToSap(req.params.id);
    if (result.kind === "not_found") {
      res.status(404).json({ error: "Recommendation not found" });
      return;
    }
    if (result.kind === "invalid_status") {
      res.status(400).json({ error: result.message });
      return;
    }
    const [note] = await db
      .select()
      .from(sapNotificationsTable)
      .where(eq(sapNotificationsTable.recommendationId, req.params.id))
      .orderBy(desc(sapNotificationsTable.createdAt))
      .limit(1);
    res.json(PushRecommendationToSapResponse.parse(toSapNotification(note)));
  },
);

router.post("/pipeline/run", async (_req, res): Promise<void> => {
  const result = await runPipeline();
  res.json(RunPipelineResponse.parse(result));
});

async function findRec(id: string) {
  const [row] = await db
    .select()
    .from(recommendationsTable)
    .where(eq(recommendationsTable.id, id));
  return row;
}

export default router;
