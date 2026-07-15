import { Router, type IRouter } from "express";
import { and, asc, eq } from "drizzle-orm";
import { db, enginesTable, readingsTable, rulesTable } from "@workspace/db";
import {
  ListEnginesResponse,
  GetEngineResponse,
  GetEngineHealthResponse,
  GetEngineReadingsResponse,
} from "@workspace/api-zod";
import { computeEngineHealth } from "@workspace/mro-core";
import { toEngine, toReading, toRule } from "../lib/mro/mappers";
import { openRecommendationCounts } from "../lib/mro/service";

const router: IRouter = Router();

router.get("/engines", async (_req, res): Promise<void> => {
  const [rows, counts] = await Promise.all([
    db.select().from(enginesTable).orderBy(asc(enginesTable.esn)),
    openRecommendationCounts(),
  ]);
  const data = ListEnginesResponse.parse(
    rows.map((r) => toEngine(r, counts.get(r.esn) ?? 0)),
  );
  res.json(data);
});

router.get("/engines/:esn", async (req, res): Promise<void> => {
  const esn = req.params.esn;
  const [row] = await db
    .select()
    .from(enginesTable)
    .where(eq(enginesTable.esn, esn));
  if (!row) {
    res.status(404).json({ error: "Engine not found" });
    return;
  }
  const counts = await openRecommendationCounts();
  const data = GetEngineResponse.parse(toEngine(row, counts.get(esn) ?? 0));
  res.json(data);
});

router.get("/engines/:esn/health", async (req, res): Promise<void> => {
  const esn = req.params.esn;
  const [row] = await db
    .select()
    .from(enginesTable)
    .where(eq(enginesTable.esn, esn));
  if (!row) {
    res.status(404).json({ error: "Engine not found" });
    return;
  }
  const [readingRows, ruleRows] = await Promise.all([
    db.select().from(readingsTable).where(eq(readingsTable.engineId, esn)),
    db.select().from(rulesTable),
  ]);
  const health = computeEngineHealth(
    toEngine(row, 0),
    readingRows.map(toReading),
    ruleRows.map(toRule),
  );
  const data = GetEngineHealthResponse.parse(health);
  res.json(data);
});

router.get("/readings", async (req, res): Promise<void> => {
  const engineId = typeof req.query.engineId === "string" ? req.query.engineId : "";
  const parameter =
    typeof req.query.parameter === "string" ? req.query.parameter : undefined;
  if (!engineId) {
    res.status(400).json({ error: "engineId query parameter is required" });
    return;
  }
  const where = parameter
    ? and(
        eq(readingsTable.engineId, engineId),
        eq(readingsTable.parameter, parameter),
      )
    : eq(readingsTable.engineId, engineId);
  const rows = await db
    .select()
    .from(readingsTable)
    .where(where)
    .orderBy(asc(readingsTable.cycle));
  const data = GetEngineReadingsResponse.parse(rows.map(toReading));
  res.json(data);
});

export default router;
