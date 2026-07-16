import { pgTable, text, integer, real, jsonb, timestamp } from "drizzle-orm/pg-core";
import type {
  EngineServiceRequest,
  InductionAcceptance,
} from "@workspace/mro-core";

// One row per dispatched OEM -> MRO shop-visit exchange. Stores the full TSR
// (JSON + XML) and the MRO's induction acceptance, plus flattened summary
// columns for listing/highlighting (status, TAT deviation, cost cap, shop order).
export const shopVisitExchangesTable = pgTable("shop_visit_exchanges", {
  id: text("id").primaryKey(),
  recommendationId: text("recommendation_id").notNull(),
  engineId: text("engine_id").notNull(),
  engineModel: text("engine_model").notNull(),
  tailNumber: text("tail_number").notNull(),
  mroProvider: text("mro_provider").notNull(),
  status: text("status").notNull().default("sent"),
  documentId: text("document_id").notNull(),
  request: jsonb("request").$type<EngineServiceRequest>().notNull(),
  requestXml: text("request_xml").notNull(),
  acknowledgement: jsonb("acknowledgement").$type<InductionAcceptance | null>(),
  targetTatDays: integer("target_tat_days").notNull(),
  committedTatDays: integer("committed_tat_days"),
  tatDeviationDays: integer("tat_deviation_days"),
  shopOrder: text("shop_order"),
  unscheduledCostCapUsd: real("unscheduled_cost_cap_usd"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  releasedAt: timestamp("released_at", { withTimezone: true }),
});

export type ShopVisitExchangeRow = typeof shopVisitExchangesTable.$inferSelect;
