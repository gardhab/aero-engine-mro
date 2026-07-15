import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";

export const sapNotificationsTable = pgTable("sap_notifications", {
  id: text("id").primaryKey(),
  recommendationId: text("recommendation_id").notNull(),
  notificationNumber: text("notification_number"),
  status: text("status").notNull(),
  mode: text("mode"),
  errorMessage: text("error_message"),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type SapNotificationRow = typeof sapNotificationsTable.$inferSelect;
