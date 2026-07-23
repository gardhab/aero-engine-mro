import type { ISA95BaseModel, ValueWithUOM } from "../common/BaseModel.js";

/**
 * MaterialClass — the design definition of a material or part.
 * Maps to: Ontology/CommonObjectModels/Material/*.json
 */
export interface MaterialClass extends ISA95BaseModel {
  readonly _type: "MaterialClass";
  partNumber: string;
  ataChapter: string;
  materialType: "LRU" | "CONSUMABLE" | "TOOL" | "CHEMICAL" | "HARDWARE";
  isLifeLimited: boolean;
  lifeLimitCycles?: number;
  lifeLimitHours?: number;
}

/**
 * Material — a specific stock item (serialized LRU or consumable batch).
 * Maps to: Ontology/CommonObjectModels/Material/*.json
 */
export interface Material extends ISA95BaseModel {
  readonly _type: "Material";
  materialClassId: string;
  /** Serial number for life-tracked / serialized parts */
  serialNumber?: string;
  /** Batch number for consumables */
  batchNumber?: string;
  quantity: ValueWithUOM;
  /** ID of the StorageUnit or WorkUnit where this material is stocked */
  locationId: string;
  materialStatus: MaterialStatus;
  /** ISO 8601 date — for shelf-life-limited items */
  expiryDate?: string;
  /** For serialized parts */
  tsn?: number;
  csn?: number;
}

export type MaterialStatus =
  | "SERVICEABLE"
  | "UNSERVICEABLE"
  | "QUARANTINE"
  | "AWAITING_INSPECTION"
  | "SCRAPPED"
  | "ON_ORDER";
