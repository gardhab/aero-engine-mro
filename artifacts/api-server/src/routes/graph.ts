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
 * Graph-build state.
 *
 * Kùzu's native addon runs synchronously on the main thread — a full merge of
 * hundreds of nodes blocks the event loop for ~5-10 s.  To prevent that from
 * stalling unrelated routes (rules, ontology, fleet…) we NEVER await the build
 * inside a request handler.  Instead we fire it in the background and let
 * callers read whatever is currently in the store (empty on cold start, fully
 * populated once the build finishes).
 *
 * Callers can check `X-Graph-Building: true` in the response header to know
 * whether to poll for updated data.
 */
export let graphReady = false;
let graphBuildPromise: Promise<void> | null = null;

/** Fire the graph rebuild in the background without blocking the caller. */
export function triggerGraphBuild(): void {
  if (graphReady || graphBuildPromise) return;
  graphBuildPromise = rebuildGraphMerge()
    .then(() => {
      graphReady = true;
      logger.info("Background graph build complete");
    })
    .catch((err) => {
      graphBuildPromise = null; // allow a retry on the next call
      logger.error({ err }, "Background graph build failed");
    });
}

router.get("/graph", async (req, res): Promise<void> => {
  // Never auto-trigger the Kùzu rebuild here — doing so would block the
  // event loop and stall unrelated routes (rules, ontology, fleet…).
  // The store may already have cached data from a prior run; we serve that
  // immediately.  If it is empty the client can POST /api/graph/refresh.
  const store = await getGraphStore();
  const engineId =
    typeof req.query.engineId === "string" ? req.query.engineId : undefined;
  const type = typeof req.query.type === "string" ? req.query.type : undefined;
  const graph = await store.getGraph({ engineId, type });

  if (!graphReady) res.setHeader("X-Graph-Building", "true");
  res.json(GetGraphResponse.parse(graph));
});

/**
 * POST /api/graph/refresh — fire a Kùzu graph rebuild in the background.
 * Returns 202 immediately; the client polls GET /api/graph until populated.
 * This is the only place we trigger the blocking native-addon work so that
 * other routes are never stalled by it.
 */
router.post("/graph/refresh", (_req, res): void => {
  if (graphReady) {
    // Force a re-build even if already done (planner wants fresh data).
    graphReady = false;
    graphBuildPromise = null;
  }
  triggerGraphBuild();
  res.status(202).json({ building: true });
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
