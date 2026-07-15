import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const activityTable = pgTable("activity_events", {
  id: text("id").primaryKey(),
  timestamp: timestamp("timestamp", { withTimezone: true })
    .notNull()
    .defaultNow(),
  type: text("type").notNull(),
  description: text("description").notNull(),
  engineId: text("engine_id"),
  recommendationId: text("recommendation_id"),
});

export type ActivityRow = typeof activityTable.$inferSelect;
