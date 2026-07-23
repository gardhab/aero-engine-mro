import type { ISA95BaseModel, ValueWithUOM, TimeInterval } from "../common/BaseModel.js";

/**
 * ISA-95 EquipmentClass — a category of MRO equipment with shared capabilities.
 * Maps to: Ontology/CommonObjectModels/EquipmentClass.json
 */
export interface EquipmentClass extends ISA95BaseModel {
  readonly _type: "EquipmentClass";
  equipmentClassCode: string;
  properties: EquipmentClassProperty[];
  /** IDs of Equipment instances that belong to this class */
  memberEquipmentIds: string[];
}

export interface EquipmentClassProperty {
  propertyName: string;
  propertyDescription?: string;
  value?: ValueWithUOM;
}

/**
 * ISA-95 Equipment — a specific piece of MRO shop equipment or tooling.
 * Maps to: Ontology/CommonObjectModels/Equipment.json
 */
export interface Equipment extends ISA95BaseModel {
  readonly _type: "Equipment";
  equipmentClassId: string;
  serialNumber?: string;
  /** ID of the WorkUnit or WorkCenter this equipment is currently assigned to */
  assignedLocationId: string;
  equipmentStatus: EquipmentStatus;
  properties: EquipmentProperty[];
}

export type EquipmentStatus =
  | "AVAILABLE"
  | "IN_USE"
  | "MAINTENANCE"
  | "CALIBRATION_DUE"
  | "OUT_OF_SERVICE";

export interface EquipmentProperty {
  propertyName: string;
  value: ValueWithUOM;
  /** ISO 8601 — when this value was last observed */
  timestamp: string;
}

/**
 * ISA-95 PhysicalAsset — a serialized physical object (engine, module, LRU).
 * Maps to: Ontology/CommonObjectModels/PhysicalAsset.json
 *
 * Engine and EngineModule extend this interface.
 */
export interface PhysicalAsset extends ISA95BaseModel {
  readonly _type: string;
  physicalAssetClassId: string;
  serialNumber: string;
  manufacturer?: string;
  /** ISO 8601 date */
  manufactureDate?: string;
  /** ID of the Equipment twin this asset is installed on/in — null if standalone */
  installedOnEquipmentId?: string;
  properties: PhysicalAssetProperty[];
}

export interface PhysicalAssetClass extends ISA95BaseModel {
  readonly _type: "PhysicalAssetClass";
  partNumber: string;
  ataChapter?: string;
  properties: PhysicalAssetClassProperty[];
}

export interface PhysicalAssetClassProperty {
  propertyName: string;
  propertyDescription?: string;
  value?: ValueWithUOM;
}

export interface PhysicalAssetProperty {
  propertyName: string;
  value: ValueWithUOM;
  /** ISO 8601 — when this value was last observed */
  timestamp: string;
}

/**
 * EquipmentAssetMapping — the time-bounded bridge between Equipment (logical) and
 * PhysicalAsset (physical). Tells you which serialized engine occupies which
 * work-unit slot and when.
 * Maps to: Ontology/CommonObjectModels/EquipmentAssetMapping.json
 */
export interface EquipmentAssetMapping extends ISA95BaseModel {
  readonly _type: "EquipmentAssetMapping";
  equipmentId: string;
  physicalAssetId: string;
  effectivePeriod: TimeInterval;
}
