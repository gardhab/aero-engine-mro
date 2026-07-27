import { Router, type IRouter } from "express";
import {
  GetGraphResponse,
  GetGraphNodeResponse,
  UpdateGraphNodeResponse,
} from "@workspace/api-zod";
import { getGraphStore } from "../lib/mro/graph";
import { rebuildGraphMerge } from "../lib/mro/service";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * Lazy graph-build gate.  The first call to GET /graph triggers a Kùzu merge
 * so that the blocking native-addon work happens off the hot startup path.
 * Subsequent calls skip the rebuild and serve cached Kùzu data directly.
 */
let graphReady = false;
let graphBuildPromise: Promise<void> | null = null;

async function ensureGraphReady(): Promise<void> {
  if (graphReady) return;
  if (!graphBuildPromise) {
    graphBuildPromise = rebuildGraphMerge()
      .then(() => {
        graphReady = true;
        logger.info("Lazy graph build complete");
      })
      .catch((err) => {
        graphBuildPromise = null; // allow retry on next request
        logger.error({ err }, "Lazy graph build failed");
      });
  }
  return graphBuildPromise;
}

router.get("/graph", async (req, res): Promise<void> => {
  await ensureGraphReady();
  const store = await getGraphStore();
  const engineId =
    typeof req.query.engineId === "string" ? req.query.engineId : undefined;
  const type = typeof req.query.type === "string" ? req.query.type : undefined;
  const graph = await store.getGraph({ engineId, type });
  res.json(GetGraphResponse.parse(graph));
});

router.get("/graph/nodes/:id", async (req, res): Promise<void> => {
  const store = await getGraphStore();
  const node = await store.getNode(req.params.id);
  if (!node) {
    res.status(404).json({ error: "Node not found" });
    return;
  }
  res.json(GetGraphNodeResponse.parse(node));
});

router.patch("/graph/nodes/:id", async (req, res): Promise<void> => {
  const body = req.body as { properties?: Record<string, unknown> };
  if (!body.properties || typeof body.properties !== "object") {
    res.status(400).json({ error: "properties object is required" });
    return;
  }
  const store = await getGraphStore();
  const node = await store.updateNode(req.params.id, body.properties);
  if (!node) {
    res.status(404).json({ error: "Node not found" });
    return;
  }
  res.json(UpdateGraphNodeResponse.parse(node));
});

export default router;
