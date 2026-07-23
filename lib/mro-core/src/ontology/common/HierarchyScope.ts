import type { ISA95BaseModel } from "./BaseModel.js";

/**
 * ISA-95 HierarchyScope — scopes any object to a node in the equipment hierarchy.
 * Maps to: Ontology/CommonObjectModels/HierarchyScope.json
 */
export type HierarchyLevel =
  | "Enterprise"
  | "Site"
  | "Area"
  | "WorkCenter"
  | "WorkUnit"
  | "WorkCell"
  | "ProcessCell"
  | "ProductionLine"
  | "ProductionUnit"
  | "StorageZone"
  | "StorageUnit";

export interface HierarchyScope extends ISA95BaseModel {
  readonly _type: "HierarchyScope";
  hierarchyLevel: HierarchyLevel;
  /** ID of the parent scope node — null for Enterprise root */
  parentScopeId?: string;
}
