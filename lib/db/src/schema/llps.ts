import { pgTable, text, integer } from "drizzle-orm/pg-core";

// Life-limited part inventory: one row per part installed on an engine.
// Remaining cycles and life status are derived (lifeLimitCycles - csn).
export const llpsTable = pgTable("llps", {
  /** Stable id: `${engineId}:${partNumber}` (one of each catalog part per engine). */
  id: text("id").primaryKey(),
  engineId: text("engine_id").notNull(),
  module: text("module").notNull(),
  partName: text("part_name").notNull(),
  partNumber: text("part_number").notNull(),
  serialNumber: text("serial_number").notNull(),
  position: text("position").notNull(),
  lifeLimitCycles: integer("life_limit_cycles").notNull(),
  csn: integer("csn").notNull(),
});

export type LlpRow = typeof llpsTable.$inferSelect;
