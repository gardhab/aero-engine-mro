import { XMLParser } from "fast-xml-parser";
import type {
  AcceptanceLogistics,
  DocumentIssue,
  FeasibilityFlag,
  InductionAcceptance,
} from "./types.js";

// Ingests and validates an MRO Induction Acceptance document, accepting either
// the Spec 2000 XML form or its JSON representation. Validation is deliberately
// strict: malformed or incomplete documents are rejected loudly rather than
// silently coerced, so a bad handshake never advances the lifecycle.

export type ParseFormat = "json" | "xml" | "auto";

export type AcknowledgementParseResult =
  | { ok: true; document: InductionAcceptance }
  | { ok: false; issues: DocumentIssue[] };

function detectFormat(raw: string): "json" | "xml" {
  return raw.trimStart().startsWith("<") ? "xml" : "json";
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

/** Read a value by any of several candidate keys (case/style tolerant). */
function pick(obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

function toStringOrNull(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function toBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  return s === "true" || s === "yes" || s === "1";
}

/** Normalize a raw parsed object (from JSON or XML) into an InductionAcceptance. */
function normalize(obj: Record<string, unknown>): InductionAcceptance {
  const logisticsRaw =
    (pick(obj, "logistics", "Logistics") as Record<string, unknown>) ?? {};
  const logistics: AcceptanceLogistics = {
    shopOrder: toStringOrNull(
      pick(logisticsRaw, "shopOrder", "ShopOrder", "allocatedShopOrder"),
    ),
    bayAllocation: toStringOrNull(
      pick(logisticsRaw, "bayAllocation", "BayAllocation"),
    ),
    uncratingDate: toStringOrNull(
      pick(logisticsRaw, "uncratingDate", "UncratingDate"),
    ),
  };

  const feasibilityContainer = pick(obj, "feasibility", "Feasibility");
  let feasibilityItems: unknown[] = [];
  if (Array.isArray(feasibilityContainer)) {
    feasibilityItems = feasibilityContainer;
  } else if (feasibilityContainer && typeof feasibilityContainer === "object") {
    feasibilityItems = asArray(
      (feasibilityContainer as Record<string, unknown>).Item ??
        (feasibilityContainer as Record<string, unknown>).item,
    );
  }
  const feasibility: FeasibilityFlag[] = feasibilityItems.map((raw) => {
    const item = (raw ?? {}) as Record<string, unknown>;
    return {
      reference: String(pick(item, "reference", "Reference") ?? "").trim(),
      feasible: toBool(pick(item, "feasible", "Feasible")),
      note: toStringOrNull(pick(item, "note", "Note")),
    };
  });

  const statusRaw = String(
    pick(obj, "inductionStatus", "InductionStatus") ?? "",
  )
    .trim()
    .toLowerCase();
  const inductionStatus: InductionAcceptance["inductionStatus"] =
    statusRaw.startsWith("accept") || statusRaw.includes("slot")
      ? "accepted"
      : statusRaw.startsWith("reject")
        ? "rejected"
        : (statusRaw as InductionAcceptance["inductionStatus"]);

  const costCapRaw = pick(
    obj,
    "unscheduledCostCapUsd",
    "UnscheduledCostCapUSD",
    "unscheduledCostCap",
  );

  const committedRaw = pick(obj, "committedTatDays", "CommittedTAT", "committedTat");
  const targetRaw = pick(obj, "targetTatDays", "TargetTAT", "targetTat");

  return {
    documentId: String(pick(obj, "documentId", "DocumentID") ?? "").trim(),
    associatedRequestId: String(
      pick(obj, "associatedRequestId", "AssociatedRequestID") ?? "",
    ).trim(),
    issueDate: String(pick(obj, "issueDate", "IssueDate") ?? "").trim(),
    inductionStatus,
    logistics,
    targetTatDays: Number(targetRaw),
    committedTatDays: Number(committedRaw),
    committedReleaseDate: toStringOrNull(
      pick(obj, "committedReleaseDate", "CommittedReleaseDate"),
    ),
    feasibility,
    unscheduledCostCapUsd:
      costCapRaw === undefined || costCapRaw === null || String(costCapRaw).trim() === ""
        ? null
        : Number(costCapRaw),
    signature: toStringOrNull(pick(obj, "signature", "Signature")),
    signedAt: toStringOrNull(pick(obj, "signedAt", "SignedAt")),
  };
}

export interface ValidateOptions {
  expectedRequestId?: string;
  expectedTargetTatDays?: number;
}

/** Validate a normalized acceptance, returning all problems found. */
export function validateAcknowledgement(
  doc: InductionAcceptance,
  opts: ValidateOptions = {},
): DocumentIssue[] {
  const issues: DocumentIssue[] = [];
  const require = (field: string, value: string, label: string) => {
    if (!value) issues.push({ field, message: `${label} is required.` });
  };

  require("documentId", doc.documentId, "Document ID");
  require("associatedRequestId", doc.associatedRequestId, "Associated request ID");
  require("issueDate", doc.issueDate, "Issue date");

  if (doc.inductionStatus !== "accepted" && doc.inductionStatus !== "rejected") {
    issues.push({
      field: "inductionStatus",
      message: 'Induction status must be "accepted" or "rejected".',
    });
  }

  if (!Number.isFinite(doc.committedTatDays) || doc.committedTatDays <= 0) {
    issues.push({
      field: "committedTatDays",
      message: "Committed TAT must be a positive number of days.",
    });
  }
  if (!Number.isFinite(doc.targetTatDays) || doc.targetTatDays <= 0) {
    issues.push({
      field: "targetTatDays",
      message: "Target TAT must be a positive number of days.",
    });
  }

  if (
    doc.unscheduledCostCapUsd !== null &&
    (!Number.isFinite(doc.unscheduledCostCapUsd) ||
      doc.unscheduledCostCapUsd < 0)
  ) {
    issues.push({
      field: "unscheduledCostCapUsd",
      message: "Unscheduled cost cap must be a non-negative number when present.",
    });
  }

  if (
    opts.expectedRequestId &&
    doc.associatedRequestId &&
    doc.associatedRequestId !== opts.expectedRequestId
  ) {
    issues.push({
      field: "associatedRequestId",
      message: `Associated request ID "${doc.associatedRequestId}" does not match this exchange's TSR "${opts.expectedRequestId}".`,
    });
  }

  if (
    opts.expectedTargetTatDays !== undefined &&
    Number.isFinite(doc.targetTatDays) &&
    doc.targetTatDays !== opts.expectedTargetTatDays
  ) {
    issues.push({
      field: "targetTatDays",
      message: `Acknowledged target TAT (${doc.targetTatDays}d) does not match this exchange's requested target TAT (${opts.expectedTargetTatDays}d).`,
    });
  }

  return issues;
}

/**
 * Parse + validate a raw acknowledgement document (JSON or XML).
 * Returns the canonical InductionAcceptance on success, or the list of issues.
 */
export function parseAcknowledgement(
  raw: string,
  format: ParseFormat = "auto",
  opts: ValidateOptions = {},
): AcknowledgementParseResult {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") {
    return { ok: false, issues: [{ field: "document", message: "Document is empty." }] };
  }

  const effective = format === "auto" ? detectFormat(trimmed) : format;
  let parsedObj: Record<string, unknown>;

  try {
    if (effective === "xml") {
      const parser = new XMLParser({
        ignoreAttributes: true,
        parseTagValue: true,
        trimValues: true,
      });
      const tree = parser.parse(trimmed) as Record<string, unknown>;
      const root = (pick(tree, "InductionAcceptance") ??
        pick(tree, "inductionAcceptance")) as Record<string, unknown> | undefined;
      if (!root) {
        return {
          ok: false,
          issues: [
            {
              field: "document",
              message: "XML root element <InductionAcceptance> not found.",
            },
          ],
        };
      }
      parsedObj = root;
    } else {
      const json = JSON.parse(trimmed);
      if (!json || typeof json !== "object" || Array.isArray(json)) {
        return {
          ok: false,
          issues: [
            { field: "document", message: "JSON document must be an object." },
          ],
        };
      }
      // Allow either a bare acceptance object or one wrapped in a root key.
      parsedObj =
        (pick(json as Record<string, unknown>, "InductionAcceptance") as
          | Record<string, unknown>
          | undefined) ?? (json as Record<string, unknown>);
    }
  } catch (err) {
    return {
      ok: false,
      issues: [
        {
          field: "document",
          message: `Failed to parse ${effective.toUpperCase()} document: ${
            err instanceof Error ? err.message : String(err)
          }`,
        },
      ],
    };
  }

  const document = normalize(parsedObj);
  const issues = validateAcknowledgement(document, opts);
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, document };
}
