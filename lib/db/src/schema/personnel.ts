import { pgTable, text, timestamp, uuid, jsonb } from "drizzle-orm/pg-core";
import { workCentersTable } from "./work-centres.js";

export const personnelClassesTable = pgTable("personnel_classes", {
  id: uuid("id").primaryKey().defaultRandom(),
  classCode: text("class_code").notNull().unique(), // MROSkillCode
  name: text("name").notNull(),
  description: text("description"),
  /** JSON array of PersonnelQualification */
  qualifications: jsonb("qualifications").notNull().default("[]"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const personsTable = pgTable("persons", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: text("employee_id").notNull().unique(),
  name: text("name").notNull(),
  /** JSON array of PersonnelClass IDs */
  personnelClassIds: jsonb("personnel_class_ids").notNull().default("[]"),
  currentWorkCenterId: uuid("current_work_center_id").references(
    () => workCentersTable.id,
  ),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type PersonnelClassRow = typeof personnelClassesTable.$inferSelect;
export type PersonRow = typeof personsTable.$inferSelect;
