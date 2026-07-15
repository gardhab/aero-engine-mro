import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import { db, rulesTable } from "@workspace/db";
import {
  ListRulesResponse,
  GetRuleResponse,
  UpdateRuleResponse,
} from "@workspace/api-zod";
import { toRule } from "../lib/mro/mappers";

const router: IRouter = Router();

router.get("/rules", async (_req, res): Promise<void> => {
  const rows = await db.select().from(rulesTable).orderBy(asc(rulesTable.id));
  res.json(ListRulesResponse.parse(rows.map(toRule)));
});

router.get("/rules/:id", async (req, res): Promise<void> => {
  const [row] = await db
    .select()
    .from(rulesTable)
    .where(eq(rulesTable.id, req.params.id));
  if (!row) {
    res.status(404).json({ error: "Rule not found" });
    return;
  }
  res.json(GetRuleResponse.parse(toRule(row)));
});

router.patch("/rules/:id", async (req, res): Promise<void> => {
  const [row] = await db
    .select()
    .from(rulesTable)
    .where(eq(rulesTable.id, req.params.id));
  if (!row) {
    res.status(404).json({ error: "Rule not found" });
    return;
  }
  const body = req.body as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const key of [
    "threshold",
    "consecutiveCycles",
    "severity",
    "enabled",
    "autoApprove",
  ]) {
    if (body[key] !== undefined) patch[key] = body[key];
  }
  const [updated] = await db
    .update(rulesTable)
    .set(patch)
    .where(eq(rulesTable.id, req.params.id))
    .returning();
  res.json(UpdateRuleResponse.parse(toRule(updated)));
});

export default router;
