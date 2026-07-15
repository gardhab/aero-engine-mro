import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import type { OntologyClass, OntologyRelationship } from "@workspace/mro-core";

export const ontologyVersionsTable = pgTable("ontology_versions", {
  version: text("version").primaryKey(),
  status: text("status").notNull(), // draft | published | superseded
  note: text("note").notNull().default(""),
  author: text("author"),
  classes: jsonb("classes").$type<OntologyClass[]>().notNull().default([]),
  relationships: jsonb("relationships")
    .$type<OntologyRelationship[]>()
    .notNull()
    .default([]),
  turtle: text("turtle").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type OntologyVersionRow = typeof ontologyVersionsTable.$inferSelect;
