import { pgTable, text, integer, real, timestamp } from "drizzle-orm/pg-core";

export const enginesTable = pgTable("engines", {
  esn: text("esn").primaryKey(),
  model: text("model").notNull(),
  tailNumber: text("tail_number").notNull(),
  operator: text("operator"),
  status: text("status").notNull().default("operational"),
  healthScore: integer("health_score").notNull().default(100),
  tsn: real("tsn").notNull().default(0),
  csn: integer("csn").notNull().default(0),
  tso: real("tso").notNull().default(0),
  cso: integer("cso").notNull().default(0),
  egtMargin: real("egt_margin"),
  lastUpdated: timestamp("last_updated", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type EngineRow = typeof enginesTable.$inferSelect;
