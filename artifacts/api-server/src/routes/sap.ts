import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import { db, sapNotificationsTable } from "@workspace/db";
import { GetSapStatusResponse, ListSapNotificationsResponse } from "@workspace/api-zod";
import { toSapNotification } from "../lib/mro/mappers";
import { getSapAdapter } from "../lib/mro/service";

const router: IRouter = Router();

router.get("/sap/status", async (_req, res): Promise<void> => {
  const config = getSapAdapter().config;
  res.json(
    GetSapStatusResponse.parse({
      mode: config.mode,
      configured: config.mode === "live",
      baseUrl: config.baseUrl ?? null,
      notificationType: config.notificationType,
    }),
  );
});

router.get("/sap/notifications", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(sapNotificationsTable)
    .orderBy(desc(sapNotificationsTable.createdAt));
  res.json(ListSapNotificationsResponse.parse(rows.map(toSapNotification)));
});

export default router;
