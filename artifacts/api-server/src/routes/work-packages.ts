import { Router, type IRouter } from "express";
import {
  GetProductionControlResponse,
  ListWorkPackagesResponse,
  UpdateWorkPackageTaskStatusResponse,
} from "@workspace/api-zod";
import {
  getProductionControl,
  listWorkPackages,
  updateWorkPackageTaskStatus,
} from "../lib/mro/work-packages";
import { rebuildGraphMerge } from "../lib/mro/service";

const router: IRouter = Router();

router.get("/work-packages", async (req, res): Promise<void> => {
  const packages = await listWorkPackages({
    engineId: typeof req.query.engineId === "string" ? req.query.engineId : undefined,
    recommendationId:
      typeof req.query.recommendationId === "string"
        ? req.query.recommendationId
        : undefined,
  });
  res.json(ListWorkPackagesResponse.parse(packages));
});

router.get("/production-control", async (_req, res): Promise<void> => {
  res.json(GetProductionControlResponse.parse(await getProductionControl()));
});

router.post(
  "/work-package-tasks/:id/status",
  async (req, res): Promise<void> => {
    const body = (req.body ?? {}) as { status?: string; updatedBy?: string };
    const result = await updateWorkPackageTaskStatus(
      req.params.id,
      body.status ?? "",
      body.updatedBy,
    );
    if (result.kind === "not_found") {
      res.status(404).json({ error: "Work-package task not found" });
      return;
    }
    if (result.kind === "invalid_status") {
      res.status(400).json({ error: result.message });
      return;
    }
    // Keep the knowledge-graph MaintenanceTask nodes' status current.
    await rebuildGraphMerge();
    res.json(UpdateWorkPackageTaskStatusResponse.parse(result.workPackage));
  },
);

export default router;
