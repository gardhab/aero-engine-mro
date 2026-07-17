import type {
  Engine,
  LifeLimitedPart,
  MaintenanceTask,
  Priority,
  Recommendation,
} from "./types.js";
import { classifyRuleId } from "./repair-category.js";

// Life-Limited Part (LLP) status tracking for the Trent XWB-84 demonstrator.
// The catalogue follows the three-shaft Trent architecture (Fan, IP Compressor,
// HP Compressor, HP Turbine, IP Turbine, LP Turbine). All life limits are
// ILLUSTRATIVE ONLY and are not certified engine data.

/** Remaining-cycles threshold at which an LLP should be flagged for planning. */
export const LLP_WARNING_REMAINING = 2000;
/** Remaining-cycles threshold at which an LLP drives an urgent shop visit. */
export const LLP_CRITICAL_REMAINING = 800;

/** Pseudo rule id used for LLP-driven recommendations (not a DB rule). */
export const LLP_RULE_ID = "llp-life-limit";
export const LLP_RULE_NAME = "LLP Remaining-Life Policy";

export type LlpLifeStatus = "ok" | "warning" | "critical";

/** One tracked life-limited part installed on an engine. */
export interface EngineLlp {
  engineId: string;
  module: string;
  partName: string;
  partNumber: string;
  serialNumber: string;
  /** Installed position, e.g. "Module 05 · Stage 1". */
  position: string;
  /** Certified cyclic life limit (illustrative). */
  lifeLimitCycles: number;
  /** Cycles since new accumulated by this part. */
  csn: number;
  /** Derived: lifeLimitCycles - csn. */
  remainingCycles: number;
  status: LlpLifeStatus;
}

export interface LlpModuleRollup {
  module: string;
  partCount: number;
  /** Part with the fewest remaining cycles in the module. */
  limitingPartName: string;
  limitingSerialNumber: string;
  minRemainingCycles: number;
  status: LlpLifeStatus;
}

interface CatalogEntry {
  module: string;
  partName: string;
  partNumber: string;
  serialPrefix: string;
  position: string;
  lifeLimitCycles: number;
  /** True for parts commonly replaced at overhaul (get a younger part CSN). */
  overhaulReplaceable: boolean;
}

// ~22 LLPs per engine across the rotating hardware. Part numbers use a
// synthetic FW-series convention; limits are representative magnitudes only.
export const LLP_CATALOG: CatalogEntry[] = [
  // Fan / LP system
  { module: "Fan", partName: "Fan Disk", partNumber: "FW61001", serialPrefix: "FAN", position: "Module 01 · Fan", lifeLimitCycles: 12000, overhaulReplaceable: false },
  { module: "Fan", partName: "LP Shaft", partNumber: "FW61010", serialPrefix: "FAN", position: "Module 01 · Shaft", lifeLimitCycles: 13000, overhaulReplaceable: false },
  // IP Compressor
  { module: "IP Compressor", partName: "IPC Stage 1 Disk", partNumber: "FW62101", serialPrefix: "IPC", position: "Module 02 · Stage 1", lifeLimitCycles: 9500, overhaulReplaceable: false },
  { module: "IP Compressor", partName: "IPC Stage 2 Disk", partNumber: "FW62102", serialPrefix: "IPC", position: "Module 02 · Stage 2", lifeLimitCycles: 9500, overhaulReplaceable: false },
  { module: "IP Compressor", partName: "IPC Stage 3-8 Drum", partNumber: "FW62138", serialPrefix: "IPC", position: "Module 02 · Stages 3-8", lifeLimitCycles: 6600, overhaulReplaceable: false },
  { module: "IP Compressor", partName: "IPC Rear Stub Shaft", partNumber: "FW62150", serialPrefix: "IPC", position: "Module 02 · Rear", lifeLimitCycles: 10000, overhaulReplaceable: false },
  // HP Compressor
  { module: "HP Compressor", partName: "HPC Stage 1 Blisk", partNumber: "FW63101", serialPrefix: "HPC", position: "Module 03 · Stage 1", lifeLimitCycles: 8500, overhaulReplaceable: true },
  { module: "HP Compressor", partName: "HPC Stage 2 Blisk", partNumber: "FW63102", serialPrefix: "HPC", position: "Module 03 · Stage 2", lifeLimitCycles: 8500, overhaulReplaceable: true },
  { module: "HP Compressor", partName: "HPC Stage 3-6 Drum", partNumber: "FW63136", serialPrefix: "HPC", position: "Module 03 · Stages 3-6", lifeLimitCycles: 7000, overhaulReplaceable: false },
  { module: "HP Compressor", partName: "HPC Rear Seal Disk", partNumber: "FW63160", serialPrefix: "HPC", position: "Module 03 · Rear seal", lifeLimitCycles: 8000, overhaulReplaceable: true },
  // HP Turbine (single stage on the XWB)
  { module: "HP Turbine", partName: "HPT Disk", partNumber: "FW71828", serialPrefix: "HPT", position: "Module 05 · Stage 1", lifeLimitCycles: 7500, overhaulReplaceable: true },
  { module: "HP Turbine", partName: "HPT Shaft", partNumber: "FW71840", serialPrefix: "HPT", position: "Module 05 · Shaft", lifeLimitCycles: 7800, overhaulReplaceable: false },
  { module: "HP Turbine", partName: "HPT Front Seal Plate", partNumber: "FW71851", serialPrefix: "HPT", position: "Module 05 · Front seal", lifeLimitCycles: 8200, overhaulReplaceable: true },
  { module: "HP Turbine", partName: "HPT Rear Seal Plate", partNumber: "FW71852", serialPrefix: "HPT", position: "Module 05 · Rear seal", lifeLimitCycles: 8200, overhaulReplaceable: true },
  // IP Turbine
  { module: "IP Turbine", partName: "IPT Disk", partNumber: "FW72101", serialPrefix: "IPT", position: "Module 06 · Stage 1", lifeLimitCycles: 8800, overhaulReplaceable: true },
  { module: "IP Turbine", partName: "IPT Shaft", partNumber: "FW72110", serialPrefix: "IPT", position: "Module 06 · Shaft", lifeLimitCycles: 9500, overhaulReplaceable: false },
  // LP Turbine
  { module: "LP Turbine", partName: "LPT Stage 1 Disk", partNumber: "FW73101", serialPrefix: "LPT", position: "Module 07 · Stage 1", lifeLimitCycles: 10500, overhaulReplaceable: false },
  { module: "LP Turbine", partName: "LPT Stage 2 Disk", partNumber: "FW73102", serialPrefix: "LPT", position: "Module 07 · Stage 2", lifeLimitCycles: 10500, overhaulReplaceable: false },
  { module: "LP Turbine", partName: "LPT Stage 3 Disk", partNumber: "FW73103", serialPrefix: "LPT", position: "Module 07 · Stage 3", lifeLimitCycles: 11000, overhaulReplaceable: false },
  { module: "LP Turbine", partName: "LPT Stage 4 Disk", partNumber: "FW73104", serialPrefix: "LPT", position: "Module 07 · Stage 4", lifeLimitCycles: 11000, overhaulReplaceable: false },
  { module: "LP Turbine", partName: "LPT Stage 5 Disk", partNumber: "FW73105", serialPrefix: "LPT", position: "Module 07 · Stage 5", lifeLimitCycles: 11500, overhaulReplaceable: false },
  { module: "LP Turbine", partName: "LPT Stage 6 Disk", partNumber: "FW73106", serialPrefix: "LPT", position: "Module 07 · Stage 6", lifeLimitCycles: 11500, overhaulReplaceable: false },
  { module: "LP Turbine", partName: "LPT Shaft", partNumber: "FW73110", serialPrefix: "LPT", position: "Module 07 · Shaft", lifeLimitCycles: 13000, overhaulReplaceable: false },
];

function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function llpLifeStatus(remainingCycles: number): LlpLifeStatus {
  if (remainingCycles <= LLP_CRITICAL_REMAINING) return "critical";
  if (remainingCycles <= LLP_WARNING_REMAINING) return "warning";
  return "ok";
}

export interface LlpSheetSpec {
  esn: string;
  /** Engine cycles since new. */
  csn: number;
  /** Engine cycles since overhaul. */
  cso: number;
}

/**
 * Deterministically generate the LLP status sheet for one engine. Original
 * parts carry the engine's CSN; overhaul-replaceable parts on engines that
 * have been shop-visited (csn > cso) were swapped at the last overhaul for a
 * part with some prior life, so their CSN is cso + a stable random offset.
 * High-time engines therefore naturally approach illustrative life limits.
 */
export function generateLlpSheet(spec: LlpSheetSpec): EngineLlp[] {
  const rand = mulberry32(hash(`llp:${spec.esn}`));
  const overhauled = spec.csn > spec.cso;
  return LLP_CATALOG.map((entry) => {
    const serialNumber = `${entry.serialPrefix}${String(10000 + Math.floor(rand() * 89999))}`;
    let partCsn = spec.csn;
    if (overhauled && entry.overhaulReplaceable) {
      // Replacement part installed at last shop visit with prior service life.
      const priorLife = Math.floor(rand() * Math.min(4000, entry.lifeLimitCycles * 0.3));
      partCsn = spec.cso + priorLife;
    }
    // Never seed an already-expired part; keep a small margin.
    partCsn = Math.min(partCsn, entry.lifeLimitCycles - 150 - Math.floor(rand() * 200));
    const remainingCycles = entry.lifeLimitCycles - partCsn;
    return {
      engineId: spec.esn,
      module: entry.module,
      partName: entry.partName,
      partNumber: entry.partNumber,
      serialNumber,
      position: entry.position,
      lifeLimitCycles: entry.lifeLimitCycles,
      csn: partCsn,
      remainingCycles,
      status: llpLifeStatus(remainingCycles),
    };
  });
}

/** Roll the sheet up per module, identifying each module's limiting part. */
export function rollupLlpsByModule(llps: EngineLlp[]): LlpModuleRollup[] {
  const byModule = new Map<string, EngineLlp[]>();
  for (const p of llps) {
    const list = byModule.get(p.module) ?? [];
    list.push(p);
    byModule.set(p.module, list);
  }
  const rollups: LlpModuleRollup[] = [];
  for (const [module, parts] of byModule) {
    const limiting = parts.reduce((a, b) =>
      b.remainingCycles < a.remainingCycles ? b : a,
    );
    rollups.push({
      module,
      partCount: parts.length,
      limitingPartName: limiting.partName,
      limitingSerialNumber: limiting.serialNumber,
      minRemainingCycles: limiting.remainingCycles,
      status: limiting.status,
    });
  }
  return rollups.sort((a, b) => a.minRemainingCycles - b.minRemainingCycles);
}

/** The engine-level limiting part (fewest remaining cycles), or null. */
export function limitingLlp(llps: EngineLlp[]): EngineLlp | null {
  if (llps.length === 0) return null;
  return llps.reduce((a, b) => (b.remainingCycles < a.remainingCycles ? b : a));
}

/** Map full status records to the compact form carried on recommendations. */
export function toLifeLimitedParts(llps: EngineLlp[]): LifeLimitedPart[] {
  return llps.map((p) => ({
    partNumber: p.partNumber,
    description: `${p.partName} (S/N ${p.serialNumber}, ${p.module})`,
    cyclesRemaining: p.remainingCycles,
  }));
}

/**
 * The LLPs a rule-based recommendation should carry: parts in the affected
 * modules with the least remaining life (they gate the shop-visit workscope).
 */
export function relevantLlpsForModules(
  llps: EngineLlp[],
  modules: string[],
  limit = 3,
): EngineLlp[] {
  const set = new Set(modules);
  return llps
    .filter((p) => set.has(p.module))
    .sort((a, b) => a.remainingCycles - b.remainingCycles)
    .slice(0, limit);
}

/**
 * Build an LLP-driven shop-visit recommendation when the engine's limiting
 * parts fall below the planning thresholds. Deterministic policy (not a
 * sensor rule): confidence is 1.0 and evidence is carried by the parts list.
 */
export function buildLlpRecommendation(
  engine: Engine,
  drivingLlps: EngineLlp[],
  now: Date,
  id: string,
): Recommendation {
  const limiting = drivingLlps[0];
  const critical = limiting.remainingCycles <= LLP_CRITICAL_REMAINING;
  const priority: Priority = critical ? "urgent" : "expedite";
  const modules = Array.from(new Set(drivingLlps.map((p) => p.module)));

  const tasks: MaintenanceTask[] = [
    {
      ataCode: "72-00-00",
      s1000dCode: "TXWB-A-72-00-00-00A-520B-A",
      description: `Module exposure for LLP replacement (${modules.join(", ")})`,
      skill: "Powerplant (module exposure)",
      estimatedHours: 60,
    },
    ...drivingLlps.map((p) => ({
      ataCode: "72-00-00",
      s1000dCode: null,
      description: `Replace ${p.partName} P/N ${p.partNumber} S/N ${p.serialNumber} (${p.remainingCycles} cycles remaining of ${p.lifeLimitCycles})`,
      skill: "Powerplant (rotatives)",
      estimatedHours: 24,
    })),
  ];
  const estimatedDurationHours = tasks.reduce((s, t) => s + t.estimatedHours, 0);
  const days = critical ? 25 : 30;
  const inductionOffset = critical ? 7 : 30;

  const faultDescription =
    `Life-limited part approaching certified limit on ${engine.model} (ESN ${engine.esn}). ` +
    `Limiting part: ${limiting.partName} S/N ${limiting.serialNumber} with ` +
    `${limiting.remainingCycles} cycles remaining of a ${limiting.lifeLimitCycles}-cycle limit ` +
    `(planning threshold ${critical ? LLP_CRITICAL_REMAINING : LLP_WARNING_REMAINING} cycles).`;

  return {
    id,
    engineId: engine.esn,
    engineModel: engine.model,
    tailNumber: engine.tailNumber,
    component: `${limiting.module} rotatives`,
    failureMode: "LLP Life Limit Expiry",
    faultDescription,
    priority,
    severity: critical ? 0.9 : 0.6,
    confidence: 1,
    status: "pending",
    tasks,
    requiredSkills: ["Powerplant (module exposure)", "Powerplant (rotatives)", "NDT Level 2"],
    estimatedDurationHours,
    turnaroundDays: days,
    workscopeLevel: "LLP replacement (module exposure)",
    affectedModules: modules,
    lifeLimitedParts: toLifeLimitedParts(drivingLlps),
    evidence: [],
    regulatoryRefs: ["14 CFR §33.70 (illustrative)", "EASA CS-E 515 (illustrative)"],
    ...classifyRuleId(LLP_RULE_ID),
    ruleId: LLP_RULE_ID,
    ruleName: LLP_RULE_NAME,
    recommendedInductionDate: addDays(now, inductionOffset),
    recommendedCompletionDate: addDays(now, inductionOffset + days),
    sapNotificationNumber: null,
    reviewedBy: null,
    reviewNotes: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

function addDays(base: Date, days: number): string {
  const d = new Date(base.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
