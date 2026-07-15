import type {
  Engine,
  EngineHealth,
  EngineStatus,
  ModuleHealth,
  ParameterHealth,
  ParameterReading,
  ReadingStatus,
  Rule,
  Trend,
} from "./types.js";
import { ENGINE_MODULES, PARAMETERS, PARAMETER_BY_CODE } from "./data/parameters.js";

function latestByParameter(
  readings: ParameterReading[],
): Map<string, ParameterReading[]> {
  const byParam = new Map<string, ParameterReading[]>();
  for (const r of readings) {
    const arr = byParam.get(r.parameter) ?? [];
    arr.push(r);
    byParam.set(r.parameter, arr);
  }
  for (const arr of byParam.values()) arr.sort((a, b) => a.cycle - b.cycle);
  return byParam;
}

function trendOf(series: ParameterReading[]): Trend {
  if (series.length < 4) return "stable";
  const window = series.slice(-6);
  const first = window[0].value;
  const last = window[window.length - 1].value;
  const delta = last - first;
  const scale = Math.max(Math.abs(first), 1) * 0.03;
  if (delta > scale) return "rising";
  if (delta < -scale) return "falling";
  return "stable";
}

const STATUS_RANK: Record<ReadingStatus, number> = {
  normal: 0,
  caution: 1,
  warning: 2,
};

/**
 * Compute a full engine-health snapshot from its readings and the active rules.
 * Pure function: returns per-parameter health, module rollups, and an overall
 * health score / airworthiness status.
 */
export function computeEngineHealth(
  engine: Engine,
  readings: ParameterReading[],
  rules: Rule[],
): EngineHealth {
  const byParam = latestByParameter(readings);
  const parameters: ParameterHealth[] = [];

  for (const def of PARAMETERS) {
    const series = byParam.get(def.code);
    if (!series || series.length === 0) continue;
    const latest = series[series.length - 1];
    parameters.push({
      parameter: def.code,
      label: def.label,
      value: latest.value,
      unit: def.unit,
      baseline: def.baseline,
      limit: def.limit,
      trend: trendOf(series),
      status: latest.status,
    });
  }

  // Module rollup: worst parameter status per module.
  const moduleStatus = new Map<string, ReadingStatus>();
  for (const ph of parameters) {
    const def = PARAMETER_BY_CODE[ph.parameter];
    if (!def) continue;
    const current = moduleStatus.get(def.module) ?? "normal";
    if (STATUS_RANK[ph.status] > STATUS_RANK[current]) {
      moduleStatus.set(def.module, ph.status);
    } else if (!moduleStatus.has(def.module)) {
      moduleStatus.set(def.module, ph.status);
    }
  }

  const moduleHealth: ModuleHealth[] = ENGINE_MODULES.map((module) => {
    const status = moduleStatus.get(module) ?? "normal";
    return {
      module,
      status,
      note:
        status === "warning"
          ? "Parameter beyond warning threshold"
          : status === "caution"
            ? "Parameter in caution band"
            : null,
    };
  });

  // Health score: start at 100, deduct for each parameter's status/exceedance.
  let score = 100;
  for (const ph of parameters) {
    if (ph.status === "warning") score -= 18;
    else if (ph.status === "caution") score -= 7;
  }
  // Extra penalty when an active rule would fire (sustained condition).
  const firing = rules.filter((r) => r.enabled).length;
  score = Math.max(0, Math.min(100, Math.round(score)));

  const worst = parameters.reduce<ReadingStatus>(
    (acc, ph) => (STATUS_RANK[ph.status] > STATUS_RANK[acc] ? ph.status : acc),
    "normal",
  );
  const status = statusFromScore(score, worst);

  void firing;
  return {
    esn: engine.esn,
    model: engine.model,
    healthScore: score,
    status,
    parameters,
    moduleHealth,
  };
}

function statusFromScore(score: number, worst: ReadingStatus): EngineStatus {
  if (score < 55 || worst === "warning") {
    return score < 40 ? "grounded" : "action_required";
  }
  if (score < 80 || worst === "caution") return "monitor";
  return "operational";
}

export function egtMarginOf(readings: ParameterReading[]): number | null {
  const egt = readings
    .filter((r) => r.parameter === "EGT_MARGIN")
    .sort((a, b) => a.cycle - b.cycle);
  return egt.length ? egt[egt.length - 1].value : null;
}
