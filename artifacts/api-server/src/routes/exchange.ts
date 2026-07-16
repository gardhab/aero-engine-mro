import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, shopVisitExchangesTable } from "@workspace/db";
import {
  DispatchRecommendationResponse,
  GetRecommendationExchangeResponse,
  ListExchangesResponse,
  GetExchangeResponse,
  IngestAcknowledgementResponse,
  AdvanceExchangeResponse,
} from "@workspace/api-zod";
import type { ExchangeStatus, ParseFormat } from "@workspace/mro-core";
import {
  toShopVisitExchange,
  toShopVisitExchangeSummary,
} from "../lib/mro/mappers";
import {
  advanceExchange,
  dispatchExchange,
  ingestAcknowledgement,
} from "../lib/mro/exchange";

const router: IRouter = Router();

router.post(
  "/recommendations/:id/dispatch",
  async (req, res): Promise<void> => {
    const result = await dispatchExchange(req.params.id);
    if (result.kind === "not_found") {
      res.status(404).json({ error: "Recommendation not found" });
      return;
    }
    if (result.kind === "invalid_status") {
      res.status(400).json({ error: result.message });
      return;
    }
    if (result.kind === "already_dispatched") {
      res.status(409).json({ error: result.message });
      return;
    }
    res.json(
      DispatchRecommendationResponse.parse(
        toShopVisitExchange(result.exchange),
      ),
    );
  },
);

router.get(
  "/recommendations/:id/exchange",
  async (req, res): Promise<void> => {
    const [row] = await db
      .select()
      .from(shopVisitExchangesTable)
      .where(eq(shopVisitExchangesTable.recommendationId, req.params.id));
    if (!row) {
      res.status(404).json({ error: "No exchange for this recommendation" });
      return;
    }
    res.json(GetRecommendationExchangeResponse.parse(toShopVisitExchange(row)));
  },
);

router.get("/exchanges", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(shopVisitExchangesTable)
    .orderBy(desc(shopVisitExchangesTable.createdAt));
  res.json(ListExchangesResponse.parse(rows.map(toShopVisitExchangeSummary)));
});

router.get("/exchanges/:id", async (req, res): Promise<void> => {
  const [row] = await db
    .select()
    .from(shopVisitExchangesTable)
    .where(eq(shopVisitExchangesTable.id, req.params.id));
  if (!row) {
    res.status(404).json({ error: "Exchange not found" });
    return;
  }
  res.json(GetExchangeResponse.parse(toShopVisitExchange(row)));
});

router.post(
  "/exchanges/:id/acknowledgement",
  async (req, res): Promise<void> => {
    const body = (req.body ?? {}) as { document?: unknown; format?: unknown };
    if (typeof body.document !== "string" || body.document.trim() === "") {
      res.status(400).json({
        error: "A document (JSON or XML string) is required.",
        issues: [{ field: "document", message: "Document is required." }],
      });
      return;
    }
    const format: ParseFormat =
      body.format === "json" || body.format === "xml" ? body.format : "auto";
    const result = await ingestAcknowledgement(
      req.params.id,
      body.document,
      format,
    );
    if (result.kind === "not_found") {
      res.status(404).json({ error: "Exchange not found" });
      return;
    }
    if (result.kind === "invalid_status") {
      res.status(409).json({ error: result.message });
      return;
    }
    if (result.kind === "invalid_document") {
      res.status(400).json({
        error: "Induction acceptance failed validation.",
        issues: result.issues,
      });
      return;
    }
    res.json(
      IngestAcknowledgementResponse.parse(toShopVisitExchange(result.exchange)),
    );
  },
);

router.post("/exchanges/:id/advance", async (req, res): Promise<void> => {
  const body = (req.body ?? {}) as { status?: unknown };
  const to = body.status as ExchangeStatus;
  if (typeof to !== "string") {
    res.status(409).json({ error: "A target status is required." });
    return;
  }
  const result = await advanceExchange(req.params.id, to);
  if (result.kind === "not_found") {
    res.status(404).json({ error: "Exchange not found" });
    return;
  }
  if (result.kind === "invalid_transition") {
    res.status(409).json({ error: result.message });
    return;
  }
  res.json(AdvanceExchangeResponse.parse(toShopVisitExchange(result.exchange)));
});

export default router;
