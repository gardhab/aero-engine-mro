// ECTM (Engine Condition Trend Monitoring) parameter catalogue for the
// Rolls-Royce Trent XWB-84. Baselines and limits are representative synthetic
// values for a v1 decision-support demonstrator, not certified engine data.

export type Direction = "lower_is_worse" | "higher_is_worse";

export interface ParameterDef {
  code: string;
  label: string;
  unit: string;
  /** Healthy baseline value for a fresh/nominal engine. */
  baseline: number;
  /** Hard airworthiness / operating limit. */
  limit: number;
  /** Which side of the baseline represents degradation. */
  direction: Direction;
  /** Threshold (parameter value) where a caution should be raised. */
  caution: number;
  /** Threshold (parameter value) where a warning should be raised. */
  warning: number;
  /** Engine module this parameter primarily reflects. */
  module: string;
}

export const ENGINE_MODULES = [
  "Fan",
  "IP Compressor",
  "HP Compressor",
  "Combustor",
  "HP Turbine",
  "IP Turbine",
  "LP Turbine",
  "Accessory Gearbox",
  "Oil System",
] as const;

export const PARAMETERS: ParameterDef[] = [
  {
    code: "EGT_MARGIN",
    label: "EGT Margin",
    unit: "\u00b0C",
    baseline: 45,
    limit: 0,
    direction: "lower_is_worse",
    caution: 15,
    warning: 8,
    module: "HP Turbine",
  },
  {
    code: "FUEL_FLOW_DEV",
    label: "Fuel Flow Deviation",
    unit: "%",
    baseline: 0,
    limit: 4,
    direction: "higher_is_worse",
    caution: 2,
    warning: 3,
    module: "Combustor",
  },
  {
    code: "N1_VIB",
    label: "Fan (N1) Vibration",
    unit: "ips",
    baseline: 0.8,
    limit: 5,
    direction: "higher_is_worse",
    caution: 3,
    warning: 4,
    module: "Fan",
  },
  {
    code: "N2_VIB",
    label: "Core (N2) Vibration",
    unit: "ips",
    baseline: 0.9,
    limit: 5,
    direction: "higher_is_worse",
    caution: 3,
    warning: 4,
    module: "HP Compressor",
  },
  {
    code: "OIL_PRESSURE",
    label: "Oil Pressure",
    unit: "psi",
    baseline: 62,
    limit: 40,
    direction: "lower_is_worse",
    caution: 50,
    warning: 45,
    module: "Oil System",
  },
  {
    code: "OIL_CONSUMPTION",
    label: "Oil Consumption",
    unit: "qt/hr",
    baseline: 0.15,
    limit: 0.6,
    direction: "higher_is_worse",
    caution: 0.35,
    warning: 0.45,
    module: "Oil System",
  },
  {
    code: "N2_SPEED_DEV",
    label: "Core Speed (N2) Deviation",
    unit: "%",
    baseline: 0,
    limit: 3,
    direction: "higher_is_worse",
    caution: 1.5,
    warning: 2.2,
    module: "HP Compressor",
  },
];

export const PARAMETER_BY_CODE: Record<string, ParameterDef> =
  Object.fromEntries(PARAMETERS.map((p) => [p.code, p]));

/** Classify a raw parameter value into normal/caution/warning. */
export function classify(
  def: ParameterDef,
  value: number,
): "normal" | "caution" | "warning" {
  if (def.direction === "lower_is_worse") {
    if (value <= def.warning) return "warning";
    if (value <= def.caution) return "caution";
    return "normal";
  }
  if (value >= def.warning) return "warning";
  if (value >= def.caution) return "caution";
  return "normal";
}
