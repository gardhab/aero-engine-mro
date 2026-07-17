import type { OntologyClass, OntologyRelationship } from "../types.js";

// Domain ontology for aircraft-engine MRO decision support.
// This is the SME-editable knowledge model: the single source of truth that the
// rules engine, knowledge graph, and decision service all reference by class id.

export const SEED_CLASSES: Omit<
  OntologyClass,
  "instanceCount" | "ruleCount"
>[] = [
  {
    id: "Engine",
    label: "Engine",
    description:
      "A physical gas-turbine aero engine tracked by serial number (ESN).",
    parentClass: null,
    deprecated: false,
    attributes: [
      { name: "esn", type: "string", description: "Engine serial number" },
      { name: "model", type: "string", description: "Engine type/model" },
      { name: "tailNumber", type: "string", description: "Airframe tail" },
      { name: "tsn", type: "number", description: "Time since new (hours)" },
      { name: "csn", type: "integer", description: "Cycles since new" },
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
      { name: "status", type: "string", description: "Health status" },
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
    label: "Sensor / Measurement",
    description:
      "An ECTM parameter measured during engine operation and trended over cycles.",
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
    id: "FailureMode",
    label: "Failure Mode",
    description:
      "A degradation or failure mechanism the system reasons about (e.g. EGT margin erosion).",
    parentClass: null,
    deprecated: false,
    attributes: [
      { name: "name", type: "string", description: "Failure mode name" },
      { name: "mechanism", type: "string", description: "Physical mechanism" },
    ],
  },
  {
    id: "Rule",
    label: "Diagnostic Rule",
    description:
      "A data-driven rule that evaluates a sensor trend to detect a failure mode.",
    parentClass: null,
    deprecated: false,
    attributes: [
      { name: "name", type: "string", description: "Rule name" },
      { name: "operator", type: "string", description: "Comparison operator" },
      { name: "threshold", type: "number", description: "Trigger threshold" },
    ],
  },
  {
    id: "Recommendation",
    label: "Work Recommendation",
    description:
      "A traceable MRO work recommendation produced by the decision service.",
    parentClass: null,
    deprecated: false,
    attributes: [
      { name: "priority", type: "string", description: "Dispatch priority" },
      { name: "workscopeLevel", type: "string", description: "Workscope" },
      { name: "confidence", type: "number", description: "Confidence 0-1" },
    ],
  },
  {
    id: "MaintenanceTask",
    label: "Maintenance Task",
    description:
      "A discrete maintenance action, referenced by ATA and S1000D task codes.",
    parentClass: null,
    deprecated: false,
    attributes: [
      { name: "ataCode", type: "string", description: "ATA chapter/task" },
      { name: "s1000dCode", type: "string", description: "S1000D task code" },
      { name: "skill", type: "string", description: "Required skill" },
      {
        name: "tcn",
        type: "string",
        description: "Task Control Number tracking shop-floor execution",
      },
      {
        name: "status",
        type: "string",
        description: "Execution status (Not Started … Complete)",
      },
    ],
  },
  {
    id: "LifeLimitedPart",
    label: "Life-Limited Part",
    description:
      "A part with a hard cyclic life limit tracked for airworthiness.",
    parentClass: "Component",
    deprecated: false,
    attributes: [
      { name: "partNumber", type: "string", description: "Part number" },
      {
        name: "cyclesRemaining",
        type: "integer",
        description: "Cycles remaining to life limit",
      },
    ],
  },
  {
    id: "RegulatoryReference",
    label: "Regulatory Reference",
    description:
      "An airworthiness citation (AMM, SB, AD, EASA/FAA regulation) governing a task.",
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
      { name: "status", type: "string", description: "Exchange lifecycle status" },
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
      { name: "category", type: "string", description: "Mandatory / Service Bulletin / Standard" },
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
    id: "indicates",
    label: "indicates",
    domain: "Sensor",
    range: "FailureMode",
    sourceMultiplicity: "0..*",
    targetMultiplicity: "0..*",
    description: "A sensor trend can indicate a failure mode.",
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
    domain: "Rule",
    range: "FailureMode",
    sourceMultiplicity: "1",
    targetMultiplicity: "1",
    description: "A rule detects a specific failure mode.",
    deprecated: false,
  },
  {
    id: "evaluates",
    label: "evaluates",
    domain: "Rule",
    range: "Sensor",
    sourceMultiplicity: "0..*",
    targetMultiplicity: "1..*",
    description: "A rule evaluates a specific sensor parameter.",
    deprecated: false,
  },
  {
    id: "generates",
    label: "generates",
    domain: "Rule",
    range: "Recommendation",
    sourceMultiplicity: "1",
    targetMultiplicity: "0..*",
    description: "A fired rule generates a work recommendation.",
    deprecated: false,
  },
  {
    id: "appliesTo",
    label: "applies to",
    domain: "Recommendation",
    range: "Engine",
    sourceMultiplicity: "0..*",
    targetMultiplicity: "1",
    description: "A recommendation applies to a specific engine.",
    deprecated: false,
  },
  {
    id: "recommends",
    label: "recommends",
    domain: "Recommendation",
    range: "MaintenanceTask",
    sourceMultiplicity: "1",
    targetMultiplicity: "0..*",
    description: "A recommendation prescribes maintenance tasks.",
    deprecated: false,
  },
  {
    id: "governedBy",
    label: "governed by",
    domain: "MaintenanceTask",
    range: "RegulatoryReference",
    sourceMultiplicity: "0..*",
    targetMultiplicity: "1..*",
    description: "A task is governed by regulatory references.",
    deprecated: false,
  },
  {
    id: "dispatchedAs",
    label: "dispatched as",
    domain: "Recommendation",
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
