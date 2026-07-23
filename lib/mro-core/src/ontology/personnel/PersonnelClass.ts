import type { ISA95BaseModel } from "../common/BaseModel.js";

/**
 * ISA-95 PersonnelClass — a category of personnel defined by shared qualifications.
 * Maps to: Ontology/CommonObjectModels/Person/PersonnelClass.json
 *
 * Used to replace the flat `skill: string` on MaintenanceTaskDefinition with a
 * typed, regulated-qualification model. Enables skill-constrained capacity simulation.
 */
export interface PersonnelClass extends ISA95BaseModel {
  readonly _type: "PersonnelClass";
  /** Short code e.g. B1_MECHANICAL, BORESCOPE */
  classCode: MROSkillCode;
  qualifications: PersonnelQualification[];
  /** IDs of WorkCenters this class is qualified to work in */
  qualifiedWorkCenterIds: string[];
}

export interface PersonnelQualification {
  /** e.g. EASA Part-66 B1, FAA A&P, EN4179 NDT Level II */
  qualificationCode: string;
  regulatoryAuthority: string;
  /** ISO 8601 date — null if no expiry */
  expiryDate?: string;
}

/**
 * Person — a specific technician, inspector, or engineer.
 * Maps to: Ontology/CommonObjectModels/Person/Person.json
 */
export interface Person extends ISA95BaseModel {
  readonly _type: "Person";
  employeeId: string;
  /** IDs of PersonnelClass memberships this person holds */
  personnelClassIds: string[];
  qualifications: PersonnelQualification[];
  /** WorkCenter this person is currently assigned to */
  currentWorkCenterId?: string;
  shiftId?: string;
}

export type MROSkillCode =
  | "B1_MECHANICAL"
  | "B2_AVIONICS"
  | "NDT_LII"
  | "NDT_LIII"
  | "BORESCOPE"
  | "BLADE_REPAIR"
  | "WELDING"
  | "COMPOSITE"
  | "TEST_CELL"
  | "QUALITY_INSPECTOR";
