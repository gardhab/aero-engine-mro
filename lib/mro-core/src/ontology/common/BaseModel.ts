/**
 * ISA-95 BaseModel — all twin classes extend this.
 * Maps to: Ontology/CommonObjectModels/BaseModel.json in
 * github.com/JMayrbaeurl/opendigitaltwins-isa95
 */
export interface ISA95BaseModel {
  /** Globally unique identifier for this twin instance */
  id: string;
  /** Human-readable name */
  name: string;
  /** Optional free-text description */
  description?: string;
  /** Reference to the ISA-95 hierarchy node that scopes this object */
  hierarchyScopeId?: string;
  /** ISO 8601 timestamp — when this record was created */
  createdAt: string;
  /** ISO 8601 timestamp — when this record was last updated */
  updatedAt: string;
  /** Lifecycle state for digital twin synchronisation */
  twinState: TwinState;
}

export type TwinState =
  | "ACTIVE"      // twin is live and synchronized
  | "INACTIVE"    // twin exists but is not currently in service
  | "INDUCTION"   // asset has entered the MRO facility
  | "IN_WORK"     // currently under maintenance
  | "COMPLETE"    // maintenance complete, pending redelivery
  | "ARCHIVED";   // historical record only

/** A numeric value paired with its unit of measure. */
export interface ValueWithUOM {
  value: number;
  unitOfMeasure: string;
}

/** A time interval with an open end (null = ongoing). */
export interface TimeInterval {
  startDateTime: string;   // ISO 8601
  endDateTime?: string;    // ISO 8601 — null means open/ongoing
}
