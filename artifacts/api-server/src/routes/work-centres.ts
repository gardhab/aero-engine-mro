import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, operationsRequestsTable, operationSegmentsTable } from "@workspace/db";
import {
  listWorkCentres,
  getWorkCentreUtilisation,
} from "../lib/mro/equipment-hierarchy";

const router = Router();

/** GET /work-centres — list all work centres with utilisation summary */
router.get("/work-centres", async (_req, res): Promise<void> => {
  const wcs = await listWorkCentres();
  res.json(wcs);
});

/** GET /work-centres/:id/utilisation — detailed utilisation for one work centre */
router.get("/work-centres/:id/utilisation", async (req, res): Promise<void> => {
  const result = await getWorkCentreUtilisation(req.params.id);
  if (!result) {
    res.status(404).json({ error: "Work centre not found" });
    return;
  }
  res.json(result);
});

/** POST /operations-requests — create an ISA-95 operations request */
router.post("/operations-requests", async (req, res): Promise<void> => {
  const { engineId, requestType, priority, workCentreId, sourceTcns } = req.body as {
    engineId: string;
    requestType?: string;
    priority?: number;
    workCentreId?: string;
    sourceTcns?: string[];
  };
  if (!engineId) {
    res.status(400).json({ error: "engineId is required" });
    return;
  }
  const [request] = await db
    .insert(operationsRequestsTable)
    .values({
      requestType: requestType ?? "MAINTENANCE",
      priority: priority ?? 3,
      engineId,
      status: "CREATED",
    })
    .returning();

  // Create segments for each TCN if provided
  if (sourceTcns?.length && workCentreId) {
    for (let i = 0; i < sourceTcns.length; i++) {
      await db.insert(operationSegmentsTable).values({
        operationsRequestId: request.id,
        sequenceNumber: i + 1,
        sourceTcn: sourceTcns[i],
        assignedWorkCenterId: workCentreId,
        segmentStatus: "PENDING",
      });
    }
  }

  res.status(201).json(request);
});

/** GET /operations-requests/:id/segments — list segments for a request */
router.get(
  "/operations-requests/:id/segments",
  async (req, res): Promise<void> => {
    const segments = await db
      .select()
      .from(operationSegmentsTable)
      .where(eq(operationSegmentsTable.operationsRequestId, req.params.id))
      .orderBy(operationSegmentsTable.sequenceNumber);
    res.json(segments);
  },
);

export default router;
