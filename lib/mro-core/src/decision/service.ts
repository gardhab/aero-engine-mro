import type {
  Engine,
  Evidence,
  LifeLimitedPart,
  MaintenanceTask,
  Priority,
  Recommendation,
} from "../types.js";
import type { RuleMatch } from "../rules/engine.js";
import { PARAMETER_BY_CODE } from "../data/parameters.js";
import { classifyRule } from "../repair-category.js";

export interface DecisionContext {
  engine: Engine;
  match: RuleMatch;
  now: Date;
  /** Stable id for the recommendation. */
  id: string;
  /**
   * Real LLP status for the parts gating this workscope (least remaining life
   * in the affected modules). When provided, replaces the static task-library
   * placeholder parts.
   */
  llps?: LifeLimitedPart[];
}

// Task templates keyed by rule id. In a production system these would be
// resolved from the maintenance-planning document (AMM / task catalogue).
const TASK_LIBRARY: Record<
  string,
  { tasks: MaintenanceTask[]; workscope: string; skills: string[]; llps: LifeLimitedPart[] }
> = {
  "rule-egt-margin-erosion": {
    workscope: "Performance restoration (hot section)",
    skills: ["Powerplant (hot section)", "Borescope inspection", "NDT Level 2"],
    tasks: [
      {
        ataCode: "72-50-00",
        s1000dCode: "TXWB-A-72-50-00-00A-520A-A",
        description: "HP turbine module borescope inspection and hot-section assessment",
        skill: "Borescope inspection",
        estimatedHours: 6,
      },
      {
        ataCode: "72-00-00",
        s1000dCode: "TXWB-A-72-00-00-00A-720A-A",
        description: "HP turbine blade set replacement / performance restoration",
        skill: "Powerplant (hot section)",
        estimatedHours: 90,
      },
    ],
    llps: [
      {
        partNumber: "FW71828",
        description: "HP turbine disc",
        cyclesRemaining: 1450,
      },
    ],
  },
  "rule-fan-vibration": {
    workscope: "Fan rotor rebalance / inspection",
    skills: ["Powerplant (fan module)", "Vibration analysis", "NDT Level 2"],
    tasks: [
      {
        ataCode: "72-30-00",
        s1000dCode: "TXWB-A-72-30-00-00A-520A-A",
        description: "Fan blade and rotor visual/NDT inspection",
        skill: "NDT Level 2",
        estimatedHours: 8,
      },
      {
        ataCode: "72-30-00",
        s1000dCode: "TXWB-A-72-30-00-00A-720B-A",
        description: "Fan rotor trim balance",
        skill: "Vibration analysis",
        estimatedHours: 12,
      },
    ],
    llps: [],
  },
  "rule-oil-pressure-low": {
    workscope: "Oil system line maintenance",
    skills: ["Powerplant (accessories)", "Oil system"],
    tasks: [
      {
        ataCode: "79-20-00",
        s1000dCode: "TXWB-A-79-20-00-00A-520A-A",
        description: "Oil pressure pump and relief valve inspection",
        skill: "Oil system",
        estimatedHours: 5,
      },
      {
        ataCode: "79-00-00",
        s1000dCode: "TXWB-A-79-00-00-00A-280A-A",
        description: "Oil system filter and magnetic chip detector check",
        skill: "Powerplant (accessories)",
        estimatedHours: 3,
      },
    ],
    llps: [],
  },
  "rule-oil-consumption-high": {
    workscope: "Bearing chamber seal inspection",
    skills: ["Powerplant (accessories)", "Oil system"],
    tasks: [
      {
        ataCode: "79-30-00",
        s1000dCode: "TXWB-A-79-30-00-00A-520A-A",
        description: "Bearing chamber seal condition inspection",
        skill: "Oil system",
        estimatedHours: 6,
      },
    ],
    llps: [],
  },
};

function priorityFor(match: RuleMatch): Priority {
  const { rule, trigger, severity } = match;
  // EGT margin approaching/below limit is the most safety-critical signal.
  if (rule.parameter === "EGT_MARGIN") {
    if (trigger.value <= 0) return "aog";
    if (trigger.value <= 5) return "urgent";
    if (trigger.value <= 10) return "expedite";
    return "routine";
  }
  if (severity >= 0.85) return "aog";
  if (severity >= 0.7) return "urgent";
  if (severity >= 0.5) return "expedite";
  return "routine";
}

function turnaroundFor(priority: Priority): { days: number; inductionOffset: number } {
  switch (priority) {
    case "aog":
      return { days: 20, inductionOffset: 0 };
    case "urgent":
      return { days: 25, inductionOffset: 7 };
    case "expedite":
      return { days: 30, inductionOffset: 21 };
    default:
      return { days: 35, inductionOffset: 60 };
  }
}

function addDays(base: Date, days: number): string {
  const d = new Date(base.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Build a canonical MRO Work Recommendation from a fired rule. This single
 * object is the source of truth for both the human report and the SAP payload,
 * carrying full evidence-to-rule traceability.
 */
export function buildRecommendation(ctx: DecisionContext): Recommendation {
  const { engine, match, now, id } = ctx;
  const { rule, window, trigger } = match;
  const lib = TASK_LIBRARY[rule.id] ?? {
    workscope: "On-condition inspection",
    skills: ["Powerplant"],
    tasks: [
      {
        ataCode: rule.recommendedTaskCode ?? "72-00-00",
        s1000dCode: null,
        description: `Inspect ${rule.component} for ${rule.failureMode}`,
        skill: "Powerplant",
        estimatedHours: 8,
      },
    ],
    llps: [],
  };

  const def = PARAMETER_BY_CODE[rule.parameter];
  const evidence: Evidence[] = window.map((r) => ({
    parameter: r.parameter,
    label: r.label,
    value: r.value,
    unit: r.unit,
    cycle: r.cycle,
    timestamp: r.timestamp,
    threshold: rule.threshold,
    description: `${r.label} = ${r.value}${r.unit} at cycle ${r.cycle} (rule threshold ${rule.operator} ${rule.threshold}${r.unit}).`,
  }));

  const priority = priorityFor(match);
  const { days, inductionOffset } = turnaroundFor(priority);
  const estimatedDurationHours = lib.tasks.reduce(
    (sum, t) => sum + t.estimatedHours,
    0,
  );
  const affectedModules = def ? [def.module] : [];

  const faultDescription =
    `${rule.failureMode} detected on ${engine.model} (ESN ${engine.esn}). ` +
    `${trigger.label} reached ${trigger.value}${trigger.unit} at cycle ${trigger.cycle}, ` +
    `sustained over ${rule.consecutiveCycles} consecutive cycles.`;

  return {
    id,
    engineId: engine.esn,
    engineModel: engine.model,
    tailNumber: engine.tailNumber,
    component: rule.component,
    failureMode: rule.failureMode,
    faultDescription,
    priority,
    ...classifyRule(rule),
    severity: round(match.severity),
    confidence: round(match.confidence),
    status: "pending",
    tasks: lib.tasks,
    requiredSkills: lib.skills,
    estimatedDurationHours,
    turnaroundDays: days,
    workscopeLevel: lib.workscope,
    affectedModules,
    lifeLimitedParts: ctx.llps && ctx.llps.length > 0 ? ctx.llps : lib.llps,
    evidence,
    regulatoryRefs: rule.regulatoryRefs,
    ruleId: rule.id,
    ruleName: rule.name,
    recommendedInductionDate: addDays(now, inductionOffset),
    recommendedCompletionDate: addDays(now, inductionOffset + days),
    sapNotificationNumber: null,
    reviewedBy: null,
    reviewNotes: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
