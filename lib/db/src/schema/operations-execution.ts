import {
  pgTable,
  text,
  integer,
  timestamp,
  uuid,
  jsonb,
} from "drizzle-orm/pg-core";
import { workCentersTable, workUnitsTable } from "./work-centres.js";

// ISA-95 Operations Execution tables.
// OperationsRequest = work-order twin (wraps an existing WorkPackage).
// OperationSegment  = one step (wraps an existing WorkPackageTask / TCN).

export const operationsRequestsTable = pgTable("operations_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestType: text("request_type").notNull().default("MAINTENANCE"),
  priority: integer("priority").notNull().default(3),
  /** ESN of the engine — links to engines.esn */
  engineId: text("engine_id").notNull(),
  /** ID of the WorkPackage in work_package_tasks (denormalized for join) */
  sourceWorkPackageId: text("source_work_package_id"),
  /** ID of the MaintenanceRecommendation */
  sourceRecommendationId: text("source_recommendation_id"),
  requestedStartTime: timestamp("requested_start_time"),
  requestedEndTime: timestamp("requested_end_time"),
  status: text("status").notNull().default("CREATED"),
  twinState: text("twin_state").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const operationSegmentsTable = pgTable("operation_segments", {
  id: uuid("id").primaryKey().defaultRandom(),
  operationsRequestId: uuid("operations_request_id")
    .references(() => operationsRequestsTable.id)
    .notNull(),
  sequenceNumber: integer("sequence_number").notNull(),
  /** Links back to the existing work_package_tasks.tcn (e.g. "TCN-1001") */
  sourceTcn: text("source_tcn"),
  /** ID of WorkPackageTask row (work_package_tasks.id) */
  sourceTaskId: text("source_task_id"),
  assignedWorkCenterId: uuid("assigned_work_center_id").references(
    () => workCentersTable.id,
  ),
  assignedWorkUnitId: uuid("assigned_work_unit_id").references(
    () => workUnitsTable.id,
  ),
  scheduledStart: timestamp("scheduled_start"),
  scheduledEnd: timestamp("scheduled_end"),
  actualStart: timestamp("actual_start"),
  actualEnd: timestamp("actual_end"),
  segmentStatus: text("segment_status").notNull().default("PENDING"),
  findings: jsonb("findings").notNull().default("[]"),
  twinState: text("twin_state").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type OperationsRequestRow =
  typeof operationsRequestsTable.$inferSelect;
export type OperationSegmentRow =
  typeof operationSegmentsTable.$inferSelect;
