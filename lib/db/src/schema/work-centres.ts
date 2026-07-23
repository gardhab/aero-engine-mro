import {
  pgTable,
  text,
  integer,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// ISA-95 Equipment Hierarchy tables.
// Chain: enterprise → site → area → work_center → work_unit

export const enterprisesTable = pgTable("enterprises", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  enterpriseId: text("enterprise_id").notNull().unique(),
  twinState: text("twin_state").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const sitesTable = pgTable("sites", {
  id: uuid("id").primaryKey().defaultRandom(),
  enterpriseId: uuid("enterprise_id")
    .references(() => enterprisesTable.id)
    .notNull(),
  name: text("name").notNull(),
  icaoCode: text("icao_code"),
  twinState: text("twin_state").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const areasTable = pgTable("areas", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id")
    .references(() => sitesTable.id)
    .notNull(),
  name: text("name").notNull(),
  areaType: text("area_type").notNull(), // MROAreaType
  twinState: text("twin_state").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const workCentersTable = pgTable("work_centers", {
  id: uuid("id").primaryKey().defaultRandom(),
  areaId: uuid("area_id")
    .references(() => areasTable.id)
    .notNull(),
  name: text("name").notNull(),
  workCenterType: text("work_center_type").notNull(), // WorkCenterType
  capacity: integer("capacity").notNull().default(1),
  twinState: text("twin_state").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const workUnitsTable = pgTable("work_units", {
  id: uuid("id").primaryKey().defaultRandom(),
  workCenterId: uuid("work_center_id")
    .references(() => workCentersTable.id)
    .notNull(),
  name: text("name").notNull(),
  workUnitType: text("work_unit_type").notNull().default("WorkCell"),
  twinState: text("twin_state").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type EnterpriseRow = typeof enterprisesTable.$inferSelect;
export type SiteRow = typeof sitesTable.$inferSelect;
export type AreaRow = typeof areasTable.$inferSelect;
export type WorkCenterRow = typeof workCentersTable.$inferSelect;
export type WorkUnitRow = typeof workUnitsTable.$inferSelect;
