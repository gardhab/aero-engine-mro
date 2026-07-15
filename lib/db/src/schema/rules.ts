import {
  pgTable,
  text,
  integer,
  real,
  boolean,
} from "drizzle-orm/pg-core";

export const rulesTable = pgTable("rules", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  failureMode: text("failure_mode").notNull(),
  parameter: text("parameter").notNull(),
  operator: text("operator").notNull(),
  threshold: real("threshold").notNull(),
  consecutiveCycles: integer("consecutive_cycles").notNull(),
  severity: real("severity").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  autoApprove: boolean("auto_approve").notNull().default(false),
  component: text("component").notNull(),
  recommendedTaskCode: text("recommended_task_code"),
  regulatoryRefs: text("regulatory_refs").array().notNull().default([]),
});

export type RuleRow = typeof rulesTable.$inferSelect;
