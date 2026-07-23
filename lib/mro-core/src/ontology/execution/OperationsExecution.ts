import type { ISA95BaseModel, TimeInterval, ValueWithUOM } from "../common/BaseModel.js";

/**
 * OperationsRequest — ISA-95 Part 4 work order twin.
 * Connects the product twin (engine/module) to the operations twin (work center).
 * A TCN work-package task IS an OperationSegment within this request.
 *
 * Maps to: Ontology/CommonObjectModels/OperationsRecord/*.json
 */
export interface OperationsRequest extends ISA95BaseModel {
  readonly _type: "OperationsRequest";
  requestType: "MAINTENANCE" | "INSPECTION" | "REPAIR" | "OVERHAUL" | "TEST";
  /** 1 = highest priority */
  priority: 1 | 2 | 3 | 4 | 5;
  /** ID of the Engine or EngineModule PhysicalAsset this request covers */
  physicalAssetId: string;
  /** ESN of the engine (denormalized for display) */
  engineId: string;
  /** ID of the originating WorkPackage in the existing TCN system */
  sourceWorkPackageId?: string;
  /** ID of the originating MaintenanceRecommendation */
  sourceRecommendationId?: string;
  requestedStartTime: string;  // ISO 8601
  requestedEndTime: string;    // ISO 8601
  /** IDs of OperationSegment twins for this request */
  segmentIds: string[];
  status: OperationsRequestStatus;
}

export type OperationsRequestStatus =
  | "CREATED"
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "ON_HOLD"
  | "COMPLETE"
  | "CANCELLED";

/**
 * OperationSegment — a single step within an OperationsRequest.
 * Maps to the ISA-95 OperationsSegment concept.
 *
 * Each TCN work-package task maps 1:1 to an OperationSegment.
 * sourceTcn links the two systems explicitly.
 */
export interface OperationSegment extends ISA95BaseModel {
  readonly _type: "OperationSegment";
  operationsRequestId: string;
  sequenceNumber: number;
  /** ID of the MaintenanceTaskDefinition that defines this segment */
  taskDefinitionId: string;
  /** TCN from the existing work-package system — the authoritative link */
  sourceTcn?: string;
  /** ID of the WorkCenter assigned to execute this segment */
  assignedWorkCenterId: string;
  /** ID of the WorkUnit (specific bay/cell) — null until assigned */
  assignedWorkUnitId?: string;
  scheduledInterval: TimeInterval;
  actualInterval?: TimeInterval;
  segmentStatus: OperationSegmentStatus;
  /** IDs of Person twins assigned to this segment */
  actualPersonnelIds: string[];
  /** IDs of Equipment twins used in this segment */
  actualEquipmentIds: string[];
  findings: Finding[];
}

export type OperationSegmentStatus =
  | "PENDING"
  | "READY"           // prerequisites met, can start
  | "IN_PROGRESS"
  | "HOLD_MATERIAL"   // waiting for parts
  | "HOLD_SKILL"      // waiting for qualified technician
  | "HOLD_EQUIPMENT"  // waiting for equipment availability
  | "COMPLETE"
  | "SKIPPED";

/** Maps TCN work-package task status to ISA-95 OperationSegmentStatus. */
export function tcnStatusToSegmentStatus(
  tcnStatus: string,
): OperationSegmentStatus {
  switch (tcnStatus) {
    case "not_started":
      return "PENDING";
    case "in_progress":
      return "IN_PROGRESS";
    case "awaiting_parts":
      return "HOLD_MATERIAL";
    case "awaiting_inspection":
      return "HOLD_SKILL";
    case "complete":
      return "COMPLETE";
    default:
      return "PENDING";
  }
}

/**
 * Finding — the result of an inspection or operation segment.
 */
export interface Finding extends ISA95BaseModel {
  readonly _type: "Finding";
  operationSegmentId: string;
  /** Which physical asset was inspected */
  physicalAssetId: string;
  ataChapter: string;
  /** ACARS/S1000D fault code */
  findingCode: string;
  severity: "SERVICEABLE" | "REPAIRABLE" | "BEYOND_LIMITS" | "SCRAP";
  disposition: FindingDisposition;
  discoveredAt: string;          // ISO 8601
  discoveredByPersonId: string;
}

export type FindingDisposition =
  | "NO_ACTION"
  | "REPAIR_IN_PLACE"
  | "REMOVE_AND_REPLACE"
  | "BLEND"
  | "WELD_REPAIR"
  | "SCRAP_AND_REPLACE"
  | "DEFER_WITH_LIMITATION";

/**
 * OperationsPerformance — immutable audit record of what was actually done.
 * ISA-95 Part 4 actual operations performance.
 */
export interface OperationsPerformance extends ISA95BaseModel {
  readonly _type: "OperationsPerformance";
  operationsRequestId: string;
  workCenterId: string;
  physicalAssetId: string;
  actualInterval: TimeInterval;
  actualPersonnelUsage: ActualPersonnelUsage[];
  actualEquipmentUsage: ActualEquipmentUsage[];
  actualMaterialUsage: ActualMaterialUsage[];
  performanceStatus: "IN_PROGRESS" | "COMPLETE" | "PARTIAL";
  /** Computed on completion */
  turnAroundTimeHours?: number;
}

export interface ActualPersonnelUsage {
  personId: string;
  personnelClassId: string;
  hoursWorked: number;
  interval: TimeInterval;
}

export interface ActualEquipmentUsage {
  equipmentId: string;
  equipmentClassId: string;
  interval: TimeInterval;
}

export interface ActualMaterialUsage {
  materialId: string;
  materialClassId: string;
  quantityUsed: ValueWithUOM;
}
