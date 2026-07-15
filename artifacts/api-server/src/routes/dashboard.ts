import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import {
  db,
  enginesTable,
  recommendationsTable,
  activityTable,
} from "@workspace/db";
import { GetDashboardSummaryResponse, GetActivityResponse } from "@workspace/api-zod";
import type { FleetRisk, Priority } from "@workspace/mro-core";
import { toActivity } from "../lib/mro/mappers";

const router: IRouter = Router();

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const engines = await db.select().from(enginesTable);
  const recs = await db.select().from(recommendationsTable);

  const statusCounts = {
    operational: engines.filter((e) => e.status === "operational").length,
    monitor: engines.filter((e) => e.status === "monitor").length,
    actionRequired: engines.filter((e) => e.status === "action_required").length,
    grounded: engines.filter((e) => e.status === "grounded").length,
  };

  const openRecs = recs.filter(
    (r) => r.status === "pending" || r.status === "approved",
  );
  const priorityCounts = {
    routine: openRecs.filter((r) => r.priority === "routine").length,
    expedite: openRecs.filter((r) => r.priority === "expedite").length,
    urgent: openRecs.filter((r) => r.priority === "urgent").length,
    aog: openRecs.filter((r) => r.priority === "aog").length,
  };

  const avgHealthScore =
    engines.length > 0
      ? Math.round(
          engines.reduce((sum, e) => sum + e.healthScore, 0) / engines.length,
        )
      : 0;

  const topRisks: FleetRisk[] = [...engines]
    .sort((a, b) => a.healthScore - b.healthScore)
    .slice(0, 3)
    .map((e) => {
      const engineRecs = recs
        .filter(
          (r) =>
            r.engineId === e.esn &&
            (r.status === "pending" || r.status === "approved"),
        )
        .sort((a, b) => b.severity - a.severity);
      return {
        esn: e.esn,
        model: e.model,
        healthScore: e.healthScore,
        topFailureMode: engineRecs[0]?.failureMode ?? "Nominal",
      };
    });

  void ({} as Priority);
  const data = GetDashboardSummaryResponse.parse({
    fleetSize: engines.length,
    statusCounts,
    priorityCounts,
    pendingRecommendations: recs.filter((r) => r.status === "pending").length,
    approvedRecommendations: recs.filter((r) => r.status === "approved").length,
    pushedToSap: recs.filter((r) => r.status === "pushed").length,
    avgHealthScore,
    topRisks,
  });
  res.json(data);
});

router.get("/dashboard/activity", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(activityTable)
    .orderBy(desc(activityTable.timestamp))
    .limit(40);
  const data = GetActivityResponse.parse(rows.map(toActivity));
  res.json(data);
});

export default router;
