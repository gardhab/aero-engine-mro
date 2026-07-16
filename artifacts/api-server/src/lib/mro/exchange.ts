import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  db,
  enginesTable,
  recommendationsTable,
  shopVisitExchangesTable,
  type ShopVisitExchangeRow,
} from "@workspace/db";
import {
  canAdvanceManually,
  parseAcknowledgement,
  resolveExchangeConfig,
  serviceRequestToXml,
  toEngineServiceRequest,
  type DocumentIssue,
  type ExchangeConfig,
  type ExchangeStatus,
  type InductionAcceptance,
  type ParseFormat,
} from "@workspace/mro-core";
import { toEngine, toRecommendation } from "./mappers";
import { logActivity, rebuildGraphMerge } from "./service";
import { logger } from "../logger";

let exchangeConfig: ExchangeConfig | null = null;
export function getExchangeConfig(): ExchangeConfig {
  if (!exchangeConfig) exchangeConfig = resolveExchangeConfig(process.env);
  return exchangeConfig;
}

// A recommendation may only be dispatched once it has been approved (or already
// pushed to SAP) — mirrors the SAP push guard so a raw/pending recommendation
// can never leak to an external MRO shop.
const DISPATCHABLE_STATUSES = new Set(["approved", "pushed"]);

export type DispatchResult =
  | { kind: "not_found" }
  | { kind: "invalid_status"; message: string }
  | { kind: "already_dispatched"; message: string; exchange: ShopVisitExchangeRow }
  | { kind: "dispatched"; exchange: ShopVisitExchangeRow };

/**
 * Build a Spec 2000 Engine Service Request (TSR) from an approved recommendation
 * and persist it as a new shop-visit exchange in the `sent` state.
 */
export async function dispatchExchange(
  recommendationId: string,
): Promise<DispatchResult> {
  const [recRow] = await db
    .select()
    .from(recommendationsTable)
    .where(eq(recommendationsTable.id, recommendationId));
  if (!recRow) return { kind: "not_found" };

  if (!DISPATCHABLE_STATUSES.has(recRow.status)) {
    return {
      kind: "invalid_status",
      message: `Only approved recommendations can be dispatched to an MRO shop (current status: ${recRow.status}).`,
    };
  }

  const [existing] = await db
    .select()
    .from(shopVisitExchangesTable)
    .where(eq(shopVisitExchangesTable.recommendationId, recommendationId));
  if (existing) {
    return {
      kind: "already_dispatched",
      message: `Recommendation has already been dispatched as ${existing.documentId}.`,
      exchange: existing,
    };
  }

  const [engineRow] = await db
    .select()
    .from(enginesTable)
    .where(eq(enginesTable.esn, recRow.engineId));
  if (!engineRow) {
    return {
      kind: "invalid_status",
      message: `Engine ${recRow.engineId} for this recommendation was not found.`,
    };
  }

  const config = getExchangeConfig();
  const rec = toRecommendation(recRow);
  const engine = toEngine(engineRow, 0);
  const now = new Date();
  const esr = toEngineServiceRequest(rec, engine, { config, now });
  const xml = serviceRequestToXml(esr);

  const [inserted] = await db
    .insert(shopVisitExchangesTable)
    .values({
      id: randomUUID(),
      recommendationId,
      engineId: rec.engineId,
      engineModel: rec.engineModel,
      tailNumber: rec.tailNumber,
      mroProvider: config.mroProvider,
      status: "sent",
      documentId: esr.header.documentId,
      request: esr,
      requestXml: xml,
      acknowledgement: null,
      targetTatDays: esr.workScope.targetTatDays,
      committedTatDays: null,
      tatDeviationDays: null,
      shopOrder: null,
      unscheduledCostCapUsd: null,
      createdAt: now,
      updatedAt: now,
      sentAt: now,
    })
    .returning();

  await logActivity(
    "exchange",
    `Service request ${esr.header.documentId} dispatched to ${config.mroProvider} for ${rec.engineId} (${config.mode} mode).`,
    { engineId: rec.engineId, recommendationId },
  );
  await rebuildGraphMerge();
  logger.info(
    { exchangeId: inserted.id, documentId: esr.header.documentId, mode: config.mode },
    "Dispatched shop-visit exchange",
  );
  return { kind: "dispatched", exchange: inserted };
}

export type IngestResult =
  | { kind: "not_found" }
  | { kind: "invalid_status"; message: string }
  | { kind: "invalid_document"; issues: DocumentIssue[] }
  | { kind: "ingested"; exchange: ShopVisitExchangeRow };

/**
 * Ingest and strictly validate an MRO Induction Acceptance (JSON or XML).
 * On success the exchange advances to `accepted` (or `rejected`) and records the
 * committed TAT, deviation, shop order and cost cap.
 */
export async function ingestAcknowledgement(
  exchangeId: string,
  rawDocument: string,
  format: ParseFormat = "auto",
): Promise<IngestResult> {
  const [row] = await db
    .select()
    .from(shopVisitExchangesTable)
    .where(eq(shopVisitExchangesTable.id, exchangeId));
  if (!row) return { kind: "not_found" };

  if (row.status !== "sent") {
    return {
      kind: "invalid_status",
      message: `An acknowledgement can only be ingested for a dispatched exchange awaiting response (current status: ${row.status}).`,
    };
  }

  const parsed = parseAcknowledgement(rawDocument, format, {
    expectedRequestId: row.documentId,
    expectedTargetTatDays: row.targetTatDays,
  });
  if (!parsed.ok) return { kind: "invalid_document", issues: parsed.issues };

  const doc: InductionAcceptance = parsed.document;
  const tatDeviationDays = doc.committedTatDays - row.targetTatDays;
  const now = new Date();
  const newStatus: ExchangeStatus =
    doc.inductionStatus === "accepted" ? "accepted" : "rejected";

  const [updated] = await db
    .update(shopVisitExchangesTable)
    .set({
      status: newStatus,
      acknowledgement: doc,
      committedTatDays: doc.committedTatDays,
      tatDeviationDays,
      shopOrder: doc.logistics.shopOrder,
      unscheduledCostCapUsd: doc.unscheduledCostCapUsd,
      acceptedAt: newStatus === "accepted" ? now : null,
      updatedAt: now,
    })
    .where(eq(shopVisitExchangesTable.id, exchangeId))
    .returning();

  await logActivity(
    "exchange",
    newStatus === "accepted"
      ? `MRO acceptance ${doc.documentId} received for ${row.documentId}: committed ${doc.committedTatDays}d TAT (${tatDeviationDays >= 0 ? "+" : ""}${tatDeviationDays}d vs target).`
      : `MRO rejected induction for ${row.documentId} (${doc.documentId}).`,
    { engineId: row.engineId, recommendationId: row.recommendationId },
  );
  await rebuildGraphMerge();
  return { kind: "ingested", exchange: updated };
}

export type AdvanceResult =
  | { kind: "not_found" }
  | { kind: "invalid_transition"; message: string }
  | { kind: "advanced"; exchange: ShopVisitExchangeRow };

/** Advance the exchange lifecycle (accepted -> in_work -> released), guarded. */
export async function advanceExchange(
  exchangeId: string,
  to: ExchangeStatus,
): Promise<AdvanceResult> {
  const [row] = await db
    .select()
    .from(shopVisitExchangesTable)
    .where(eq(shopVisitExchangesTable.id, exchangeId));
  if (!row) return { kind: "not_found" };

  const from = row.status as ExchangeStatus;
  if (!canAdvanceManually(from, to)) {
    const hint =
      from === "sent"
        ? ' A dispatched exchange can only advance by ingesting a validated MRO acknowledgement.'
        : "";
    return {
      kind: "invalid_transition",
      message: `Cannot move a shop visit from "${from}" to "${to}".${hint}`,
    };
  }

  const now = new Date();
  const [updated] = await db
    .update(shopVisitExchangesTable)
    .set({
      status: to,
      releasedAt: to === "released" ? now : row.releasedAt,
      updatedAt: now,
    })
    .where(eq(shopVisitExchangesTable.id, exchangeId))
    .returning();

  await logActivity(
    "exchange",
    `Shop visit ${row.documentId} advanced from ${from} to ${to}.`,
    { engineId: row.engineId, recommendationId: row.recommendationId },
  );
  await rebuildGraphMerge();
  return { kind: "advanced", exchange: updated };
}
