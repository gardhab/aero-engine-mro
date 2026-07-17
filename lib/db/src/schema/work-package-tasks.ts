import {
  pgTable,
  text,
  integer,
  real,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// One row per TCN-tracked maintenance task in a shop-visit work package.
// A work package is the group of tasks spawned from one approved
// recommendation (workPackageId is shared across the group). The unique TCN
// is derived from tcnSeq, a globally monotonic identity column, so numbers
// are allocated race-free by the database (TCN-1001, TCN-1002, ...).
export const workPackageTasksTable = pgTable("work_package_tasks", {
  id: text("id").primaryKey(),
  workPackageId: text("work_package_id").notNull(),
  recommendationId: text("recommendation_id").notNull(),
  engineId: text("engine_id").notNull(),
  module: text("module").notNull().default(""),
  tcnSeq: integer("tcn_seq").generatedAlwaysAsIdentity({ startWith: 1 }),
  sequence: integer("sequence").notNull(),
  description: text("description").notNull(),
  ataCode: text("ata_code").notNull(),
  s1000dCode: text("s1000d_code"),
  skill: text("skill").notNull(),
  estimatedHours: real("estimated_hours").notNull(),
  status: text("status").notNull().default("not_started"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => [
  // One work package per recommendation: concurrent creators conflict here,
  // so duplicate packages cannot be created (insert uses onConflictDoNothing).
  uniqueIndex("work_package_tasks_rec_seq_unique").on(
    t.recommendationId,
    t.sequence,
  ),
]);

export type WorkPackageTaskRow = typeof workPackageTasksTable.$inferSelect;
