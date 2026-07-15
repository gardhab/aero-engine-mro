import {
  pgTable,
  serial,
  text,
  integer,
  real,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const readingsTable = pgTable(
  "readings",
  {
    id: serial("id").primaryKey(),
    engineId: text("engine_id").notNull(),
    parameter: text("parameter").notNull(),
    label: text("label").notNull(),
    value: real("value").notNull(),
    unit: text("unit").notNull(),
    cycle: integer("cycle").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    status: text("status").notNull(),
  },
  (t) => [
    index("readings_engine_param_idx").on(t.engineId, t.parameter, t.cycle),
  ],
);

export type ReadingRow = typeof readingsTable.$inferSelect;
