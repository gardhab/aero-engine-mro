import { Router, type IRouter } from "express";
import {
  GetGraphResponse,
  GetGraphNodeResponse,
  UpdateGraphNodeResponse,
} from "@workspace/api-zod";
import { getGraphStore } from "../lib/mro/graph";

const router: IRouter = Router();

router.get("/graph", async (req, res): Promise<void> => {
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
