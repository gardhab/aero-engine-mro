import type { ISA95BaseModel } from "../common/BaseModel.js";

/**
 * ProcessSegment — the routing template for a class of MRO work.
 * Maps to: Ontology/CommonObjectModels/ProcessSegment/*.json
 *
 * This is the *definition* of how work is done for a given engine type/workscope.
 * Think: "For a Trent XWB-84 heavy shop visit, these are the standard segments
 * in order." OperationSegment is the execution instance of a ProcessSegment.
 */
export interface ProcessSegment extends ISA95BaseModel {
  readonly _type: "ProcessSegment";
  /** ID of the PhysicalAssetClass (EngineModel) this routing applies to */
  applicablePhysicalAssetClassId: string;
  operationCategory:
    | "DISASSEMBLY"
    | "INSPECTION"
    | "REPAIR"
    | "ASSEMBLY"
    | "TEST";
  sequenceNumber: number;
  /** ID of the MaintenanceTaskDefinition this segment implements */
  taskDefinitionId: string;
  /** WorkCenterType best suited for this segment */
  preferredWorkCenterType: string;
  estimatedDurationHours: number;
  /** IDs of ProcessSegments that must complete before this starts */
  prerequisiteSegmentIds: string[];
  /** When true, this segment can run concurrently with its prerequisites */
  canRunParallel: boolean;
}
