import {
  pgTable,
  text,
  integer,
  real,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import type { BacktestResultRow } from "@workspace/mro-core";

export const backtestRunsTable = pgTable("backtest_runs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  engineId: text("engine_id").notNull(),
  failureMode: text("failure_mode").notNull(),
  totalCycles: integer("total_cycles").notNull(),
  recommendationsGenerated: integer("recommendations_generated"),
  recordedActions: integer("recorded_actions"),
  leadTimeCycles: integer("lead_time_cycles").notNull(),
  precision: real("precision").notNull(),
  recall: real("recall").notNull(),
  rows: jsonb("rows").$type<BacktestResultRow[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type BacktestRunRow = typeof backtestRunsTable.$inferSelect;
