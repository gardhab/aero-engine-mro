// OEM -> MRO shop-visit exchange domain model.
//
// Models the AECMA / Spec 2000 Chapter 4 (Aircraft Maintenance Data Exchange)
// handshake: an OEM-directed Engine Service Request (TSR) dispatched to an MRO
// shop, and the MRO's Induction Acceptance response. This is the external B2B
// loop, complementary to (and independent of) the internal SAP push.

/** Lifecycle of a shop-visit exchange, from dispatch through release. */
export type ExchangeStatus =
  | "recommended"
  | "sent"
  | "accepted"
  | "in_work"
  | "released"
  | "rejected";

/** A module-level work directive within the directed scope of work. */
export interface ModuleDirective {
  module: string;
  actionRequired: string;
}

/** A mandatory airworthiness / fleet-campaign directive (AD or SB). */
export interface ComplianceDirective {
  reference: string;
  category: string;
  description: string;
}

/** Material and parts-provisioning policy for the shop visit. */
export interface MaterialPolicy {
  partsSupply: string;
  materialClass: string;
  scrapPolicy: string | null;
}

export interface ServiceRequestHeader {
  documentId: string;
  transmissionDate: string;
  originator: string;
  recipient: string;
  contractType: string;
}

export interface AssetDetails {
  engineModel: string;
  esn: string;
  flightHours: number;
  flightCycles: number;
}

export interface ServiceRequestWorkScope {
  primaryReason: string;
  targetTatDays: number;
  targetInductionDate: string | null;
  targetReleaseDate: string | null;
  directives: ModuleDirective[];
  complianceDirectives: ComplianceDirective[];
  materialPolicy: MaterialPolicy | null;
}

/** The Spec 2000 EngineServiceRequest (TSR) sent from OEM to MRO. */
export interface EngineServiceRequest {
  header: ServiceRequestHeader;
  asset: AssetDetails;
  workScope: ServiceRequestWorkScope;
}

/** Per-directive / per-AD-SB feasibility flag from the MRO's evaluation. */
export interface FeasibilityFlag {
  reference: string;
  feasible: boolean;
  note: string | null;
}

/** Slot-allocation / induction logistics committed by the MRO. */
export interface AcceptanceLogistics {
  shopOrder: string | null;
  bayAllocation: string | null;
  uncratingDate: string | null;
}

/** The MRO's Induction Acceptance & Commercial Proposal response. */
export interface InductionAcceptance {
  documentId: string;
  associatedRequestId: string;
  issueDate: string;
  inductionStatus: "accepted" | "rejected";
  logistics: AcceptanceLogistics;
  targetTatDays: number;
  committedTatDays: number;
  committedReleaseDate: string | null;
  feasibility: FeasibilityFlag[];
  unscheduledCostCapUsd: number | null;
  signature: string | null;
  signedAt: string | null;
}

/** A persisted shop-visit exchange tying a recommendation to its TSR + response. */
export interface ShopVisitExchange {
  id: string;
  recommendationId: string;
  engineId: string;
  engineModel: string;
  tailNumber: string;
  mroProvider: string;
  status: ExchangeStatus;
  documentId: string;
  request: EngineServiceRequest;
  requestXml: string;
  acknowledgement: InductionAcceptance | null;
  targetTatDays: number;
  committedTatDays: number | null;
  tatDeviationDays: number | null;
  shopOrder: string | null;
  unscheduledCostCapUsd: number | null;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  acceptedAt: string | null;
  releasedAt: string | null;
}

/** Condensed exchange view for list/queue displays. */
export interface ShopVisitExchangeSummary {
  id: string;
  recommendationId: string;
  engineId: string;
  engineModel: string;
  tailNumber: string;
  mroProvider: string;
  status: ExchangeStatus;
  documentId: string;
  inductionStatus: "accepted" | "rejected" | null;
  targetTatDays: number;
  committedTatDays: number | null;
  tatDeviationDays: number | null;
  shopOrder: string | null;
  unscheduledCostCapUsd: number | null;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  acceptedAt: string | null;
  releasedAt: string | null;
}

/** A single document-validation problem, surfaced to the caller (fail loudly). */
export interface DocumentIssue {
  field: string;
  message: string;
}
