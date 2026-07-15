import type { Engine, ParameterReading } from "../types.js";
import { PARAMETERS, PARAMETER_BY_CODE, classify } from "./parameters.js";

// Deterministic synthetic ECTM run-to-failure data for a Trent XWB-84 fleet.
// A seeded PRNG keeps runs reproducible so backtests and demos are stable.

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

export type Scenario =
  | "healthy"
  | "egt_erosion"
  | "fan_vibration"
  | "oil_pressure"
  | "oil_consumption";

export interface EngineSpec {
  esn: string;
  tailNumber: string;
  operator: string;
  scenario: Scenario;
  csn: number;
  cso: number;
  /** Fraction (0-1) through the degradation profile at "now". */
  progression: number;
}

const MODEL = "Trent XWB-84";
const CYCLES = 160;
const HOURS_PER_CYCLE = 7.4;

export const FLEET: EngineSpec[] = [
  { esn: "XWB-10021", tailNumber: "G-XWBA", operator: "Aurora Atlantic", scenario: "egt_erosion", csn: 4200, cso: 1850, progression: 0.95 },
  { esn: "XWB-10022", tailNumber: "G-XWBB", operator: "Aurora Atlantic", scenario: "healthy", csn: 2100, cso: 2100, progression: 0.4 },
  { esn: "XWB-10023", tailNumber: "G-XWBC", operator: "Aurora Atlantic", scenario: "fan_vibration", csn: 5600, cso: 900, progression: 0.85 },
  { esn: "XWB-10024", tailNumber: "G-XWBD", operator: "Meridian Cargo", scenario: "oil_pressure", csn: 3300, cso: 3300, progression: 0.8 },
  { esn: "XWB-10025", tailNumber: "G-XWBE", operator: "Meridian Cargo", scenario: "oil_consumption", csn: 4800, cso: 1200, progression: 0.7 },
  { esn: "XWB-10026", tailNumber: "G-XWBF", operator: "Skyline Intl", scenario: "healthy", csn: 1500, cso: 1500, progression: 0.25 },
  { esn: "XWB-10027", tailNumber: "G-XWBG", operator: "Skyline Intl", scenario: "egt_erosion", csn: 6100, cso: 2400, progression: 0.6 },
  { esn: "XWB-10028", tailNumber: "G-XWBH", operator: "Meridian Cargo", scenario: "healthy", csn: 900, cso: 900, progression: 0.15 },
];

interface Profile {
  parameter: string;
  /** value at cycle 0 (start of window). */
  start: number;
  /** value at the current/last cycle for progression=1. */
  end: number;
}

function scenarioProfiles(spec: EngineSpec): Profile[] {
  const p = spec.progression;
  const lerp = (a: number, b: number) => a + (b - a) * p;
  switch (spec.scenario) {
    case "egt_erosion":
      return [{ parameter: "EGT_MARGIN", start: 40, end: lerp(40, -3) }];
    case "fan_vibration":
      return [{ parameter: "N1_VIB", start: 0.9, end: lerp(0.9, 4.6) }];
    case "oil_pressure":
      return [{ parameter: "OIL_PRESSURE", start: 61, end: lerp(61, 43) }];
    case "oil_consumption":
      return [{ parameter: "OIL_CONSUMPTION", start: 0.16, end: lerp(0.16, 0.5) }];
    default:
      return [];
  }
}

/** The cycle at which the degrading parameter crosses its hard limit (or -1). */
export function failureOnsetCycle(spec: EngineSpec): number {
  const profiles = scenarioProfiles(spec);
  if (profiles.length === 0) return -1;
  const prof = profiles[0];
  const def = PARAMETER_BY_CODE[prof.parameter];
  for (let c = 0; c < CYCLES; c++) {
    const frac = c / (CYCLES - 1);
    const value = prof.start + (prof.end - prof.start) * Math.pow(frac, 1.7);
    const crossed =
      def.direction === "lower_is_worse" ? value <= def.limit : value >= def.limit;
    if (crossed) return c + 1;
  }
  return -1;
}

export function scenarioFailureMode(scenario: Scenario): string {
  switch (scenario) {
    case "egt_erosion":
      return "EGT Margin Erosion";
    case "fan_vibration":
      return "Fan Rotor Imbalance";
    case "oil_pressure":
      return "Oil System Degradation";
    case "oil_consumption":
      return "Excessive Oil Consumption";
    default:
      return "None";
  }
}

/** Generate the full readings time-series for one engine. */
export function generateReadings(
  spec: EngineSpec,
  baseTime: Date,
): ParameterReading[] {
  const rand = mulberry32(hash(spec.esn));
  const profiles = scenarioProfiles(spec);
  const profByParam = new Map(profiles.map((p) => [p.parameter, p]));
  const readings: ParameterReading[] = [];

  for (let c = 0; c < CYCLES; c++) {
    const cycle = c + 1;
    const frac = c / (CYCLES - 1);
    const ts = new Date(
      baseTime.getTime() - (CYCLES - c) * HOURS_PER_CYCLE * 3600 * 1000,
    ).toISOString();

    for (const def of PARAMETERS) {
      const prof = profByParam.get(def.code);
      let value: number;
      if (prof) {
        // Degrading parameter follows an accelerating profile.
        value = prof.start + (prof.end - prof.start) * Math.pow(frac, 1.7);
      } else {
        // Stable parameter hovers near baseline with mild drift.
        value = def.baseline;
      }
      const noise = (rand() - 0.5) * noiseFor(def.code);
      value = round(value + noise, def.code);

      readings.push({
        engineId: spec.esn,
        parameter: def.code,
        label: def.label,
        value,
        unit: def.unit,
        cycle,
        timestamp: ts,
        status: classify(def, value),
      });
    }
  }
  return readings;
}

function noiseFor(code: string): number {
  switch (code) {
    case "EGT_MARGIN":
      return 1.4;
    case "OIL_PRESSURE":
      return 1.0;
    case "N1_VIB":
    case "N2_VIB":
      return 0.12;
    case "OIL_CONSUMPTION":
      return 0.02;
    default:
      return 0.25;
  }
}

function round(v: number, code: string): number {
  const dp = code === "OIL_CONSUMPTION" || code.endsWith("_VIB") ? 2 : 1;
  const f = Math.pow(10, dp);
  return Math.round(v * f) / f;
}

/** Build the Engine record; health fields are computed downstream from readings. */
export function buildEngine(spec: EngineSpec, baseTime: Date): Engine {
  return {
    esn: spec.esn,
    model: MODEL,
    tailNumber: spec.tailNumber,
    operator: spec.operator,
    status: "operational",
    healthScore: 100,
    tsn: Math.round(spec.csn * HOURS_PER_CYCLE),
    csn: spec.csn,
    tso: Math.round(spec.cso * HOURS_PER_CYCLE),
    cso: spec.cso,
    egtMargin: null,
    openRecommendations: 0,
    lastUpdated: baseTime.toISOString(),
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

export const SYNTHETIC = { CYCLES, HOURS_PER_CYCLE, MODEL };
