import type { ISA95BaseModel } from "../common/BaseModel.js";

/**
 * ISA-95 Equipment Hierarchy — the physical/organizational spine of the operational twin.
 * Maps to: Ontology/EquipmentHierarchy/*.json in opendigitaltwins-isa95
 *
 * Hierarchy: Enterprise → Site → Area → WorkCenter → WorkUnit
 */

export interface Enterprise extends ISA95BaseModel {
  readonly _type: "Enterprise";
  /** IATA or internal MRO organisation code */
  enterpriseId: string;
  /** IDs of child Site twins */
  siteIds: string[];
}

export interface Site extends ISA95BaseModel {
  readonly _type: "Site";
  enterpriseId: string;
  /** Airport/facility ICAO identifier */
  icaoCode?: string;
  /** IDs of child Area twins */
  areaIds: string[];
}

export type MROAreaType =
  | "ENGINE_DISASSEMBLY"
  | "MODULE_REPAIR"
  | "COMPONENT_OVERHAUL"
  | "TEST_CELL"
  | "FINAL_ASSEMBLY"
  | "PARTS_STORE"
  | "RECEIVING_INSPECTION"
  | "SHIPPING";

export interface Area extends ISA95BaseModel {
  readonly _type: "Area";
  siteId: string;
  areaType: MROAreaType;
  /** IDs of child WorkCenter twins */
  workCenterIds: string[];
}

export type WorkCenterType =
  | "BORESCOPE"
  | "BLADE_REPAIR"
  | "COMBUSTION"
  | "GEARBOX"
  | "ACCESSORIES"
  | "TEST_CELL"
  | "NDT"
  | "BALANCING"
  | "FINAL_TEST";

export interface WorkCenter extends ISA95BaseModel {
  readonly _type: "WorkCenter";
  areaId: string;
  workCenterType: WorkCenterType;
  /** Maximum concurrent work orders / segments this center supports */
  capacity: number;
  /** IDs of Equipment twins assigned to this work center */
  equipmentIds: string[];
  /** IDs of PersonnelClass twins qualified to work here */
  qualifiedPersonnelClassIds: string[];
  /** IDs of child WorkUnit twins */
  workUnitIds: string[];
}

export interface WorkUnit extends ISA95BaseModel {
  readonly _type: "WorkUnit";
  workCenterId: string;
  workUnitType: "WorkCell" | "ProductionUnit" | "StorageUnit";
  /** ID of the OperationSegment currently assigned here — null if idle */
  currentSegmentId?: string;
  equipmentIds: string[];
}
