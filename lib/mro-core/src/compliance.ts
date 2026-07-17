// Computable compliance semantics.
//
// A ComplianceDirective (AD/SB) is no longer just a citation: given the
// operational evidence the system already tracks — the recommendation that
// carries the directive's work, its TCN task executions, and the shop-visit
// exchange state — we derive a concrete compliance status. The same derivation
// feeds both the API responses and the knowledge-graph ComplianceAssessment
// event nodes, so the two can never disagree.

export const COMPLIANCE_STATUSES = [
  "compliant",
  "due",
  "overdue",
  "not_applicable",
  "pending_evidence",
] as const;

export type ComplianceStatus = (typeof COMPLIANCE_STATUSES)[number];

export interface ComplianceEvidenceInput {
  /** ISO date the directive must be complied with by (e.g. the shop visit's target release date), if any. */
  deadline: string | null;
  /** Status of the recommendation carrying the directive's work, if known. */
  recommendationStatus: string | null;
  /** Execution statuses of the TCN work-package tasks spawned for that recommendation. */
  taskStatuses: string[];
  /** Shop-visit exchange lifecycle status (recommended/sent/accepted/in_work/released/rejected), if any. */
  exchangeStatus: string | null;
  /** Assessment time. */
  now: Date;
}

/**
 * Derive a directive's compliance status from live evidence:
 * - `not_applicable` — the driving recommendation or shop visit was rejected;
 * - `compliant`     — the shop visit is released, or every spawned TCN task is complete;
 * - `pending_evidence` — no task executions exist yet to evidence the work;
 * - `overdue`       — evidence is incomplete and the deadline has passed;
 * - `due`           — evidence is incomplete and the deadline has not passed (or none is set).
 */
export function deriveComplianceStatus(
  input: ComplianceEvidenceInput,
): ComplianceStatus {
  if (
    input.recommendationStatus === "rejected" ||
    input.exchangeStatus === "rejected"
  ) {
    return "not_applicable";
  }
  if (input.exchangeStatus === "released") return "compliant";
  const tasks = input.taskStatuses;
  if (tasks.length > 0 && tasks.every((s) => s === "complete")) {
    return "compliant";
  }
  const overdue =
    input.deadline != null &&
    input.deadline !== "" &&
    new Date(input.deadline).getTime() < input.now.getTime();
  if (tasks.length === 0) {
    // No executions yet: the obligation exists but nothing evidences the work.
    return overdue ? "overdue" : "pending_evidence";
  }
  return overdue ? "overdue" : "due";
}

/** A derived, evidence-linked compliance assessment for one directive. */
export interface ComplianceAssessment {
  /** Directive reference (AD/SB number). */
  reference: string;
  /** Directive category (Mandatory / Service Bulletin / Standard). */
  category: string;
  status: ComplianceStatus;
  /** Compliance deadline (ISO), if one applies. */
  deadline: string | null;
  /** When this assessment was computed (ISO). */
  assessedAt: string;
  /** Engine the directive applies to. */
  engineId: string;
  /** Recommendation whose work satisfies the directive, if any. */
  recommendationId: string | null;
  /** TCNs of the task executions providing evidence. */
  evidenceTcns: string[];
}
