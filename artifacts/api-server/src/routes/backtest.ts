import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import {
  db,
  backtestRunsTable,
  enginesTable,
  readingsTable,
  rulesTable,
} from "@workspace/db";
import {
  ListBacktestRunsResponse,
  GetBacktestRunResponse,
  RunBacktestResponse,
} from "@workspace/api-zod";
import {
  FLEET,
  failureOnsetCycle,
  runBacktest,
  scenarioFailureMode,
} from "@workspace/mro-core";
import { toBacktestRun, toReading, toRule } from "../lib/mro/mappers";
import { logActivity } from "../lib/mro/service";

const router: IRouter = Router();

router.get("/backtest/runs", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(backtestRunsTable)
    .orderBy(desc(backtestRunsTable.createdAt));
  res.json(ListBacktestRunsResponse.parse(rows.map(toBacktestRun)));
});

router.get("/backtest/runs/:id", async (req, res): Promise<void> => {
  const [row] = await db
    .select()
    .from(backtestRunsTable)
    .where(eq(backtestRunsTable.id, req.params.id));
  if (!row) {
    res.status(404).json({ error: "Backtest run not found" });
    return;
  }
  res.json(GetBacktestRunResponse.parse(toBacktestRun(row)));
});

router.post("/backtest/run", async (req, res): Promise<void> => {
  const body = req.body as { engineId?: string; name?: string };
  if (!body.engineId) {
    res.status(400).json({ error: "engineId is required" });
    return;
  }
  const [engine] = await db
    .select()
    .from(enginesTable)
    .where(eq(enginesTable.esn, body.engineId));
  if (!engine) {
    res.status(404).json({ error: "Engine not found" });
    return;
  }
  const [readingRows, ruleRows] = await Promise.all([
    db.select().from(readingsTable).where(eq(readingsTable.engineId, body.engineId)),
    db.select().from(rulesTable),
  ]);
  const spec = FLEET.find((s) => s.esn === body.engineId);
  const onset = spec ? failureOnsetCycle(spec) : -1;
  const failureMode = spec ? scenarioFailureMode(spec.scenario) : "Unknown";

  const run = runBacktest({
    id: randomUUID(),
    name: body.name ?? `Backtest ${body.engineId}`,
    engineId: body.engineId,
    failureMode,
    readings: readingRows.map(toReading),
    rules: ruleRows.map(toRule),
    failureOnsetCycle: onset,
    now: new Date(),
  });

  await db.insert(backtestRunsTable).values({
    id: run.id,
    name: run.name,
    engineId: run.engineId,
    failureMode: run.failureMode,
    totalCycles: run.totalCycles,
    recommendationsGenerated: run.recommendationsGenerated ?? null,
    recordedActions: run.recordedActions ?? null,
    leadTimeCycles: run.leadTimeCycles,
    precision: run.precision,
    recall: run.recall,
    rows: run.rows,
    createdAt: new Date(run.createdAt),
  });
  await logActivity(
    "backtest",
    `Backtest for ${run.engineId}: precision ${run.precision}, recall ${run.recall}, lead ${run.leadTimeCycles} cycles.`,
    { engineId: run.engineId },
  );

  res.json(RunBacktestResponse.parse(run));
});

export default router;
