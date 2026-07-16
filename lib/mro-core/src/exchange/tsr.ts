import { XMLBuilder } from "fast-xml-parser";
import type { Engine, Recommendation } from "../types.js";
import type { ExchangeConfig } from "./config.js";
import type {
  ComplianceDirective,
  EngineServiceRequest,
  MaterialPolicy,
  ModuleDirective,
} from "./types.js";

// Maps an approved Work Recommendation to a Spec 2000 Ch.4 EngineServiceRequest
// (the OEM's Technical Service Request / directed work order), following the same
// adapter pattern as the SAP payload mapper. Emits both a canonical JSON object
// and an XSD-valid XML serialization.

function primaryReasonFor(rec: Recommendation): string {
  const ws = rec.workscopeLevel?.toLowerCase() ?? "";
  const lead = ws.includes("overhaul")
    ? "Performance Restoration Shop Visit (PRSV)"
    : ws.includes("module")
      ? "Module Performance Shop Visit"
      : "Directed Maintenance Shop Visit";
  return `${lead} triggered by ${rec.failureMode}. ${rec.faultDescription}`.trim();
}

function moduleDirectivesFor(rec: Recommendation): ModuleDirective[] {
  const taskSummary = rec.tasks
    .map((t) => `${t.ataCode} ${t.description}`)
    .join("; ");
  if (rec.affectedModules.length === 0) {
    return [
      {
        module: rec.component,
        actionRequired:
          `${rec.workscopeLevel} workscope. ${taskSummary}`.trim() ||
          `Address ${rec.failureMode}.`,
      },
    ];
  }
  return rec.affectedModules.map((module, i) => ({
    module,
    actionRequired:
      i === 0 && taskSummary
        ? `${rec.workscopeLevel} workscope. ${taskSummary}`
        : `Inspect and service per ${rec.workscopeLevel} workscope; address ${rec.failureMode}.`,
  }));
}

function classifyCompliance(ref: string): string {
  const upper = ref.toUpperCase();
  if (/\bAD\b/.test(upper) || upper.includes("AIRWORTHINESS")) return "Mandatory";
  if (/\bSB\b/.test(upper) || upper.includes("SERVICE BULLETIN"))
    return "Service Bulletin";
  return "Standard";
}

function complianceDirectivesFor(rec: Recommendation): ComplianceDirective[] {
  return rec.regulatoryRefs.map((ref) => ({
    reference: ref,
    category: classifyCompliance(ref),
    description: `Incorporate ${ref} during this shop visit.`,
  }));
}

function materialPolicyFor(rec: Recommendation): MaterialPolicy {
  const hasLlp = rec.lifeLimitedParts.length > 0;
  return {
    partsSupply:
      "All Life Limited Parts (LLPs) and specialized materials supplied from OEM Logistics.",
    materialClass: hasLlp
      ? "New OEM parts required for life-limited modules; Serviceable Used Material (SUM) permitted only with OEM Fleet Engineer pre-approval."
      : "Serviceable Used Material (SUM) acceptable where approved by the current Engine Manual.",
    scrapPolicy:
      "Life-expired or scrapped parts held 14 days for OEM metallurgical review before local disposal.",
  };
}

export interface BuildServiceRequestOptions {
  config: ExchangeConfig;
  now?: Date;
  documentId?: string;
}

/** Build the canonical EngineServiceRequest JSON from a recommendation + engine. */
export function toEngineServiceRequest(
  rec: Recommendation,
  engine: Engine,
  opts: BuildServiceRequestOptions,
): EngineServiceRequest {
  const now = opts.now ?? new Date();
  const documentId =
    opts.documentId ??
    `TSR-${now.getUTCFullYear()}-${engine.esn}-${rec.id.slice(0, 8).toUpperCase()}`;
  return {
    header: {
      documentId,
      transmissionDate: now.toISOString(),
      originator: opts.config.originator,
      recipient: opts.config.mroProvider,
      contractType: opts.config.contractType,
    },
    asset: {
      engineModel: rec.engineModel,
      esn: engine.esn,
      flightHours: engine.tsn,
      flightCycles: engine.csn,
    },
    workScope: {
      primaryReason: primaryReasonFor(rec),
      targetTatDays: rec.turnaroundDays,
      targetInductionDate: rec.recommendedInductionDate ?? null,
      targetReleaseDate: rec.recommendedCompletionDate ?? null,
      directives: moduleDirectivesFor(rec),
      complianceDirectives: complianceDirectivesFor(rec),
      materialPolicy: materialPolicyFor(rec),
    },
  };
}

/** Serialize an EngineServiceRequest to XSD-valid Spec 2000 XML. */
export function serviceRequestToXml(esr: EngineServiceRequest): string {
  const builder = new XMLBuilder({
    format: true,
    indentBy: "  ",
    suppressEmptyNode: true,
  });
  const doc = {
    EngineServiceRequest: {
      Header: {
        DocumentID: esr.header.documentId,
        TransmissionDate: esr.header.transmissionDate,
        Originator: esr.header.originator,
        Recipient: esr.header.recipient,
        ContractType: esr.header.contractType,
      },
      AssetDetails: {
        EngineModel: esr.asset.engineModel,
        ESN: esr.asset.esn,
        FlightHours: esr.asset.flightHours,
        FlightCycles: esr.asset.flightCycles,
      },
      WorkScope: {
        PrimaryReason: esr.workScope.primaryReason,
        TargetTAT: esr.workScope.targetTatDays,
        Directives: {
          Directive: esr.workScope.directives.map((d) => ({
            Module: d.module,
            ActionRequired: d.actionRequired,
          })),
        },
        ...(esr.workScope.complianceDirectives.length > 0
          ? {
              ComplianceDirectives: {
                ComplianceDirective: esr.workScope.complianceDirectives.map(
                  (c) => ({
                    Reference: c.reference,
                    Category: c.category,
                    Description: c.description,
                  }),
                ),
              },
            }
          : {}),
        ...(esr.workScope.materialPolicy
          ? {
              MaterialPolicy: {
                PartsSupply: esr.workScope.materialPolicy.partsSupply,
                MaterialClass: esr.workScope.materialPolicy.materialClass,
                ...(esr.workScope.materialPolicy.scrapPolicy
                  ? { ScrapPolicy: esr.workScope.materialPolicy.scrapPolicy }
                  : {}),
              },
            }
          : {}),
      },
    },
  };
  return `<?xml version="1.0" encoding="UTF-8"?>\n${builder.build(doc)}`;
}
