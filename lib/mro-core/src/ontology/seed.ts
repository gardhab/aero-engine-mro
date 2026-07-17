import type { OntologyClass, OntologyRelationship } from "../types.js";

// Domain ontology for aircraft-engine MRO decision support.
// This is the SME-editable knowledge model: the single source of truth that the
// rules engine, knowledge graph, and decision service all reference by class id.
//
// Structural principles (per the domain-model review):
// - Definition vs. instance: design concepts (EngineModel, LlpCategory,
//   DiagnosticRuleDefinition, MaintenanceTaskDefinition) are distinct from
//   serialized physical assets (Engine, LifeLimitedPart) and from produced
//   records (MeasurementObservation, MaintenanceRecommendation).
// - Identity: an Engine is identified by ESN only; the airframe tail number
//   belongs to Aircraft, linked through a time-bounded EngineInstallation.
// - Controlled vocabularies: enumerable attributes declare `enumValues`
//   instead of being unconstrained strings.

/**
 * Class-id renames applied by the ontology restructure. Used to migrate stored
 * ontology versions (and their relationships) without losing SME edits.
 */
export const ONTOLOGY_CLASS_RENAMES: Record<string, string> = {
  Rule: "DiagnosticRuleDefinition",
  Recommendation: "MaintenanceRecommendation",
  MaintenanceTask: "MaintenanceTaskDefinition",
  RegulatoryReference: "RegulatoryRequirement",
};

/**
 * Attributes removed from existing classes by the restructure (moved to a
 * different class). Keyed by (post-rename) class id.
 */
export const ONTOLOGY_ATTRIBUTE_REMOVALS: Record<string, string[]> = {
  // model → EngineModel, tailNumber → Aircraft.
  Engine: ["model", "tailNumber"],
  // Replaced by remainingCycles / cyclesSinceNew counters on the instance.
  LifeLimitedPart: ["cyclesRemaining"],
};

export const SEED_CLASSES: Omit<
  OntologyClass,
  "instanceCount" | "ruleCount"
>[] = [
  {
    id: "EngineModel",
    label: "Engine Model",
    description:
      "An engine design/type family (e.g. Trent XWB-84): the definition a serialized engine conforms to.",
    parentClass: null,
    deprecated: false,
    attributes: [
      { name: "modelCode", type: "string", description: "Model designation" },
      { name: "manufacturer", type: "string", description: "OEM" },
      {
        name: "architecture",
        type: "string",
        description: "Engine architecture",
        enumValues: ["two-shaft turbofan", "three-shaft turbofan", "geared turbofan"],
      },
    ],
  },
  {
    id: "Engine",
    label: "Engine",
    description:
      "A serialized physical gas-turbine aero engine identified by its engine serial number (ESN).",
    parentClass: null,
    deprecated: false,
    attributes: [
      { name: "esn", type: "string", description: "Engine serial number" },
      { name: "tsn", type: "number", description: "Time since new (hours)" },
      { name: "csn", type: "integer", description: "Cycles since new" },
      {
        name: "status",
        type: "string",
        description: "Fleet-management status",
        enumValues: ["operational", "monitor", "action_required", "grounded"],
      },
    ],
  },
  {
    id: "Aircraft",
    label: "Aircraft",
    description:
      "An airframe identified by registration/tail number; engines are installed on it over time.",
    parentClass: null,
    deprecated: false,
    attributes: [
      { name: "tailNumber", type: "string", description: "Registration / tail number" },
      { name: "operator", type: "string", description: "Operating airline" },
    ],
  },
  {
    id: "EngineInstallation",
    label: "Engine Installation",
    description:
      "A time-bounded installation of a serialized engine on an aircraft (position, on/off dates).",
    parentClass: null,
    deprecated: false,
    attributes: [
      {
        name: "position",
        type: "string",
        description: "Wing position",
        enumValues: ["1", "2", "3", "4"],
      },
      { name: "installedDate", type: "string", description: "Installation date (ISO)" },
      { name: "removedDate", type: "string", description: "Removal date (ISO); empty while installed" },
    ],
  },
  {
    id: "EngineModule",
    label: "Engine Module",
    description:
      "A major serviceable module of the engine (fan, compressor, turbine, etc.).",
    parentClass: null,
    deprecated: false,
    attributes: [
      { name: "name", type: "string", description: "Module name" },
      {
        name: "status",
        type: "string",
        description: "Health status",
        enumValues: ["normal", "caution", "warning"],
      },
    ],
  },
  {
    id: "Component",
    label: "Component",
    description:
      "A serviceable or life-limited part within an engine module.",
    parentClass: null,
    deprecated: false,
    attributes: [
      { name: "name", type: "string", description: "Component name" },
      { name: "partNumber", type: "string", description: "Part number" },
    ],
  },
  {
    id: "PiecePart",
    label: "Piece Part",
    description:
      "A lowest-level detail part (bolt, seal, lockplate, spacer) within a component assembly.",
    parentClass: null,
    deprecated: false,
    attributes: [
      { name: "name", type: "string", description: "Piece-part name" },
      { name: "partNumber", type: "string", description: "Part number" },
      { name: "quantity", type: "integer", description: "Quantity per assembly" },
    ],
  },
  {
    id: "Sensor",
    label: "Sensor",
    description:
      "A physical/derived ECTM sensing channel on the engine that produces measurement observations.",
    parentClass: null,
    deprecated: false,
    attributes: [
      { name: "code", type: "string", description: "Parameter code" },
      { name: "unit", type: "string", description: "Unit of measure" },
      { name: "baseline", type: "number", description: "Healthy baseline" },
      { name: "limit", type: "number", description: "Operating limit" },
    ],
  },
  {
    id: "MeasurementObservation",
    label: "Measurement Observation",
    description:
      "A recorded observation produced by a sensor for a specific engine at a cycle; the input diagnostic rules evaluate.",
    parentClass: null,
    deprecated: false,
    attributes: [
      { name: "parameter", type: "string", description: "Parameter code" },
      { name: "value", type: "number", description: "Observed value" },
      { name: "unit", type: "string", description: "Unit of measure" },
      { name: "cycle", type: "integer", description: "Engine cycle at observation" },
      { name: "timestamp", type: "string", description: "Observation time (ISO)" },
      {
        name: "status",
        type: "string",
        description: "Exceedance assessment",
        enumValues: ["normal", "caution", "warning"],
      },
    ],
  },
  {
    id: "FailureMode",
    label: "Failure Mode",
    description:
      "A degradation or failure mechanism the system reasons about (e.g. EGT margin erosion).",
    parentClass: null,
    deprecated: false,
    attributes: [
      { name: "name", type: "string", description: "Failure mode name" },
      {
        name: "mechanism",
        type: "string",
        description: "Physical mechanism",
        enumValues: [
          "erosion",
          "wear",
          "fatigue",
          "corrosion",
          "fouling",
          "vibration",
          "leakage",
          "contamination",
        ],
      },
    ],
  },
  {
    id: "DiagnosticRuleDefinition",
    label: "Diagnostic Rule Definition",
    description:
      "A data-driven rule definition that evaluates measurement observations to detect a failure mode.",
    parentClass: null,
    deprecated: false,
    attributes: [
      { name: "name", type: "string", description: "Rule name" },
      {
        name: "operator",
        type: "string",
        description: "Comparison operator",
        enumValues: ["lt", "gt", "trend_down", "trend_up"],
      },
      { name: "threshold", type: "number", description: "Trigger threshold" },
    ],
  },
  {
    id: "MaintenanceRecommendation",
    label: "Maintenance Recommendation",
    description:
      "A traceable maintenance work recommendation produced by the decision service.",
    parentClass: null,
    deprecated: false,
    attributes: [
      {
        name: "priority",
        type: "string",
        description: "Dispatch priority",
        enumValues: ["routine", "expedite", "urgent", "aog"],
      },
      {
        name: "workscopeLevel",
        type: "string",
        description: "Workscope",
        enumValues: [
          "Performance restoration (hot section)",
          "Fan rotor rebalance / inspection",
          "Oil system line maintenance",
          "Bearing chamber seal inspection",
          "On-condition inspection",
          "LLP replacement (module exposure)",
        ],
      },
      {
        name: "status",
        type: "string",
        description: "Review lifecycle status",
        enumValues: ["pending", "approved", "rejected", "pushed", "failed"],
      },
      { name: "confidence", type: "number", description: "Confidence 0-1" },
    ],
  },
  {
    id: "MaintenanceTaskDefinition",
    label: "Maintenance Task Definition",
    description:
      "A discrete maintenance action definition, referenced by ATA and S1000D task codes.",
    parentClass: null,
    deprecated: false,
    attributes: [
      { name: "ataCode", type: "string", description: "ATA chapter/task" },
      { name: "s1000dCode", type: "string", description: "S1000D task code" },
      {
        name: "skill",
        type: "string",
        description: "Required skill",
        enumValues: [
          "Powerplant",
          "Powerplant (hot section)",
          "Powerplant (fan module)",
          "Powerplant (accessories)",
          "Powerplant (module exposure)",
          "Powerplant (rotatives)",
          "Borescope inspection",
          "Vibration analysis",
          "Oil system",
          "NDT Level 2",
        ],
      },
      {
        name: "tcn",
        type: "string",
        description: "Task Control Number tracking shop-floor execution",
      },
      {
        name: "status",
        type: "string",
        description: "Execution status",
        enumValues: [
          "not_started",
          "in_progress",
          "awaiting_parts",
          "awaiting_inspection",
          "complete",
        ],
      },
    ],
  },
  {
    id: "LlpCategory",
    label: "LLP Category",
    description:
      "The design definition of a life-limited part: part number and certified life limits, independent of any serial.",
    parentClass: null,
    deprecated: false,
    attributes: [
      { name: "partNumber", type: "string", description: "Part number" },
      { name: "partName", type: "string", description: "Part name" },
      { name: "lifeLimitCycles", type: "integer", description: "Certified life limit (cycles)" },
      { name: "lifeLimitHours", type: "number", description: "Certified life limit (flight hours), if applicable" },
      { name: "lifeLimitCalendarMonths", type: "integer", description: "Calendar life limit (months), if applicable" },
      {
        name: "lifeLimitSource",
        type: "string",
        description: "Authority defining the life limit",
        enumValues: [
          "Type Certificate Data Sheet",
          "Engine Manual (Ch. 05 Airworthiness Limitations)",
          "Airworthiness Directive",
          "Service Bulletin",
        ],
      },
    ],
  },
  {
    id: "LifeLimitedPart",
    label: "Life-Limited Part",
    description:
      "A serialized life-limited part installed on an engine, carrying its accumulated usage against the category's limits.",
    parentClass: "Component",
    deprecated: false,
    attributes: [
      { name: "partNumber", type: "string", description: "Part number" },
      { name: "serialNumber", type: "string", description: "Part serial number" },
      { name: "cyclesSinceNew", type: "integer", description: "Cycles since new (CSN)" },
      { name: "cyclesSinceOverhaul", type: "integer", description: "Cycles since overhaul (CSO)" },
      { name: "hoursSinceNew", type: "number", description: "Hours since new (TSN)" },
      {
        name: "remainingCycles",
        type: "integer",
        description: "Remaining life (life limit − CSN)",
      },
      {
        name: "lifeStatus",
        type: "string",
        description: "Remaining-life assessment",
        enumValues: ["ok", "warning", "critical"],
      },
    ],
  },
  {
    id: "RegulatoryRequirement",
    label: "Regulatory Requirement",
    description:
      "An airworthiness requirement (AMM, SB, AD, EASA/FAA regulation) governing a task.",
    parentClass: null,
    deprecated: false,
    attributes: [
      { name: "citation", type: "string", description: "Citation identifier" },
    ],
  },
  {
    id: "ServiceRequest",
    label: "Engine Service Request",
    description:
      "A Spec 2000 Ch.4 Technical Service Request (TSR) dispatched from the OEM to an MRO shop for a directed shop visit.",
    parentClass: null,
    deprecated: false,
    attributes: [
      { name: "documentId", type: "string", description: "TSR document control number" },
      {
        name: "status",
        type: "string",
        description: "Exchange lifecycle status",
        enumValues: ["draft", "dispatched", "acknowledged", "accepted", "rejected"],
      },
      { name: "mroProvider", type: "string", description: "Receiving MRO facility" },
      { name: "targetTatDays", type: "integer", description: "Target turnaround (days)" },
    ],
  },
  {
    id: "ComplianceDirective",
    label: "Compliance Directive",
    description:
      "A mandatory airworthiness directive (AD) or service bulletin (SB) required during a shop visit.",
    parentClass: null,
    deprecated: false,
    attributes: [
      { name: "reference", type: "string", description: "AD/SB reference number" },
      {
        name: "category",
        type: "string",
        description: "Directive category",
        enumValues: ["Mandatory", "Service Bulletin", "Standard"],
      },
    ],
  },
  {
    id: "MroCommitment",
    label: "MRO Commitment",
    description:
      "The MRO's induction acceptance: committed turnaround, slot allocation, feasibility, and cost cap.",
    parentClass: null,
    deprecated: false,
    attributes: [
      { name: "shopOrder", type: "string", description: "Allocated MRO shop order" },
      { name: "committedTatDays", type: "integer", description: "Committed turnaround (days)" },
      { name: "tatDeviationDays", type: "integer", description: "Deviation vs target (days)" },
      { name: "unscheduledCostCapUsd", type: "number", description: "Pre-authorized cost cap (USD)" },
    ],
  },
];

export const SEED_RELATIONSHIPS: OntologyRelationship[] = [
  {
    id: "instanceOf",
    label: "instance of",
    domain: "Engine",
    range: "EngineModel",
    sourceMultiplicity: "0..*",
    targetMultiplicity: "1",
    description: "A serialized engine conforms to exactly one engine model.",
    deprecated: false,
  },
  {
    id: "hasInstallation",
    label: "has installation",
    domain: "Engine",
    range: "EngineInstallation",
    sourceMultiplicity: "1",
    targetMultiplicity: "0..*",
    description:
      "An engine's installation history: each record is one time-bounded fitment.",
    deprecated: false,
  },
  {
    id: "onAircraft",
    label: "on aircraft",
    domain: "EngineInstallation",
    range: "Aircraft",
    sourceMultiplicity: "0..*",
    targetMultiplicity: "1",
    description: "An installation places the engine on a specific aircraft.",
    deprecated: false,
  },
  {
    id: "hasModule",
    label: "has module",
    domain: "Engine",
    range: "EngineModule",
    sourceMultiplicity: "1",
    targetMultiplicity: "1..*",
    description: "An engine is composed of major modules.",
    deprecated: false,
  },
  {
    id: "hasComponent",
    label: "has component",
    domain: "EngineModule",
    range: "Component",
    sourceMultiplicity: "1",
    targetMultiplicity: "0..*",
    description: "A module contains serviceable components.",
    deprecated: false,
  },
  {
    id: "hasPiecePart",
    label: "has piece part",
    domain: "Component",
    range: "PiecePart",
    sourceMultiplicity: "1",
    targetMultiplicity: "0..*",
    description: "A component assembly is built from piece parts.",
    deprecated: false,
  },
  {
    id: "conformsTo",
    label: "conforms to",
    domain: "LifeLimitedPart",
    range: "LlpCategory",
    sourceMultiplicity: "0..*",
    targetMultiplicity: "1",
    description:
      "A serialized life-limited part conforms to its part-number category and its certified life limits.",
    deprecated: false,
  },
  {
    id: "monitoredBy",
    label: "monitored by",
    domain: "EngineModule",
    range: "Sensor",
    sourceMultiplicity: "1",
    targetMultiplicity: "1..*",
    description: "A module's condition is monitored by ECTM sensors.",
    deprecated: false,
  },
  {
    id: "produces",
    label: "produces",
    domain: "Sensor",
    range: "MeasurementObservation",
    sourceMultiplicity: "1",
    targetMultiplicity: "0..*",
    description: "A sensor produces measurement observations over cycles.",
    deprecated: false,
  },
  {
    id: "indicates",
    label: "indicates",
    domain: "MeasurementObservation",
    range: "FailureMode",
    sourceMultiplicity: "0..*",
    targetMultiplicity: "0..*",
    description: "An observation trend can indicate a failure mode.",
    deprecated: false,
  },
  {
    id: "affects",
    label: "affects",
    domain: "FailureMode",
    range: "EngineModule",
    sourceMultiplicity: "0..*",
    targetMultiplicity: "1..*",
    description: "A failure mode degrades one or more modules.",
    deprecated: false,
  },
  {
    id: "detects",
    label: "detects",
    domain: "DiagnosticRuleDefinition",
    range: "FailureMode",
    sourceMultiplicity: "1",
    targetMultiplicity: "1",
    description: "A diagnostic rule detects a specific failure mode.",
    deprecated: false,
  },
  {
    id: "evaluates",
    label: "evaluates",
    domain: "DiagnosticRuleDefinition",
    range: "MeasurementObservation",
    sourceMultiplicity: "0..*",
    targetMultiplicity: "1..*",
    description:
      "A diagnostic rule evaluates measurement observations (not the physical sensor).",
    deprecated: false,
  },
  {
    id: "generates",
    label: "generates",
    domain: "DiagnosticRuleDefinition",
    range: "MaintenanceRecommendation",
    sourceMultiplicity: "1",
    targetMultiplicity: "0..*",
    description: "A fired rule generates a maintenance recommendation.",
    deprecated: false,
  },
  {
    id: "appliesTo",
    label: "applies to",
    domain: "MaintenanceRecommendation",
    range: "Engine",
    sourceMultiplicity: "0..*",
    targetMultiplicity: "1",
    description: "A recommendation applies to a specific engine.",
    deprecated: false,
  },
  {
    id: "recommends",
    label: "recommends",
    domain: "MaintenanceRecommendation",
    range: "MaintenanceTaskDefinition",
    sourceMultiplicity: "1",
    targetMultiplicity: "0..*",
    description: "A recommendation prescribes maintenance tasks.",
    deprecated: false,
  },
  {
    id: "governedBy",
    label: "governed by",
    domain: "MaintenanceTaskDefinition",
    range: "RegulatoryRequirement",
    sourceMultiplicity: "0..*",
    targetMultiplicity: "1..*",
    description: "A task is governed by regulatory requirements.",
    deprecated: false,
  },
  {
    id: "dispatchedAs",
    label: "dispatched as",
    domain: "MaintenanceRecommendation",
    range: "ServiceRequest",
    sourceMultiplicity: "1",
    targetMultiplicity: "0..1",
    description: "An approved recommendation is dispatched to an MRO as a service request.",
    deprecated: false,
  },
  {
    id: "concerns",
    label: "concerns",
    domain: "ServiceRequest",
    range: "Engine",
    sourceMultiplicity: "0..*",
    targetMultiplicity: "1",
    description: "A service request directs work on a specific engine.",
    deprecated: false,
  },
  {
    id: "mandates",
    label: "mandates",
    domain: "ServiceRequest",
    range: "ComplianceDirective",
    sourceMultiplicity: "1",
    targetMultiplicity: "0..*",
    description: "A service request mandates incorporation of compliance directives.",
    deprecated: false,
  },
  {
    id: "acknowledgedBy",
    label: "acknowledged by",
    domain: "ServiceRequest",
    range: "MroCommitment",
    sourceMultiplicity: "1",
    targetMultiplicity: "0..1",
    description: "A service request is acknowledged by the MRO's induction commitment.",
    deprecated: false,
  },
];
