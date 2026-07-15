import {
  pgTable,
  text,
  integer,
  real,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import type {
  Evidence,
  LifeLimitedPart,
  MaintenanceTask,
} from "@workspace/mro-core";

export const recommendationsTable = pgTable("recommendations", {
  id: text("id").primaryKey(),
  engineId: text("engine_id").notNull(),
  engineModel: text("engine_model").notNull(),
  tailNumber: text("tail_number").notNull(),
  component: text("component").notNull(),
  failureMode: text("failure_mode").notNull(),
  faultDescription: text("fault_description").notNull(),
  priority: text("priority").notNull(),
  severity: real("severity").notNull(),
  confidence: real("confidence").notNull(),
  status: text("status").notNull().default("pending"),
  tasks: jsonb("tasks").$type<MaintenanceTask[]>().notNull().default([]),
  requiredSkills: text("required_skills").array().notNull().default([]),
  estimatedDurationHours: real("estimated_duration_hours").notNull(),
  turnaroundDays: integer("turnaround_days").notNull(),
  workscopeLevel: text("workscope_level").notNull(),
  affectedModules: text("affected_modules").array().notNull().default([]),
  lifeLimitedParts: jsonb("life_limited_parts")
    .$type<LifeLimitedPart[]>()
    .notNull()
    .default([]),
  evidence: jsonb("evidence").$type<Evidence[]>().notNull().default([]),
  regulatoryRefs: text("regulatory_refs").array().notNull().default([]),
  ruleId: text("rule_id").notNull(),
  ruleName: text("rule_name").notNull(),
  recommendedInductionDate: text("recommended_induction_date"),
  recommendedCompletionDate: text("recommended_completion_date"),
  sapNotificationNumber: text("sap_notification_number"),
  reviewedBy: text("reviewed_by"),
  reviewNotes: text("review_notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type RecommendationRow = typeof recommendationsTable.$inferSelect;
