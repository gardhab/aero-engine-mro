import type { BacktestResultRow, BacktestRun, ParameterReading, Rule } from "./types.js";
import { evaluateRules } from "./rules/engine.js";

export interface BacktestParams {
  id: string;
  name: string;
  engineId: string;
  failureMode: string;
  readings: ParameterReading[];
  rules: Rule[];
  /** Cycle at which the real failure/limit-exceedance occurred (-1 if none). */
  failureOnsetCycle: number;
  now: Date;
}

/**
 * Replay an engine's history cycle-by-cycle. At each cycle we run the rules over
 * all readings up to that cycle and compare the prediction against ground truth
 * (whether the failure onset has occurred). Produces precision/recall and the
 * lead-time (cycles of early warning before the failure onset).
 */
export function runBacktest(params: BacktestParams): BacktestRun {
  const { readings, rules, failureOnsetCycle } = params;
  const cycles = Math.max(0, ...readings.map((r) => r.cycle));
  const rows: BacktestResultRow[] = [];

  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  let firstPredictionCycle = -1;

  for (let cycle = 1; cycle <= cycles; cycle++) {
    const upTo = readings.filter((r) => r.cycle <= cycle);
    const matches = evaluateRules(rules, upTo);
    const predicted = matches.length > 0;
    if (predicted && firstPredictionCycle === -1) firstPredictionCycle = cycle;

    // Ground truth: within a lead window before onset, the condition is
    // genuinely developing, so a prediction there is a true positive.
    const actual =
      failureOnsetCycle > 0 && cycle >= failureOnsetCycle - LEAD_WINDOW;

    let outcome: BacktestResultRow["outcome"];
    if (predicted && actual) {
      outcome = "true_positive";
      tp++;
    } else if (predicted && !actual) {
      outcome = "false_positive";
      fp++;
    } else if (!predicted && actual) {
      outcome = "false_negative";
      fn++;
    } else {
      outcome = "true_negative";
      tn++;
    }

    rows.push({
      cycle,
      predicted,
      actual,
      outcome,
      note:
        cycle === failureOnsetCycle
          ? "Ground-truth failure onset (limit exceedance)"
          : cycle === firstPredictionCycle && predicted
            ? "First predictive alert"
            : null,
    });
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const leadTimeCycles =
    failureOnsetCycle > 0 && firstPredictionCycle > 0
      ? Math.max(0, failureOnsetCycle - firstPredictionCycle)
      : 0;

  return {
    id: params.id,
    name: params.name,
    engineId: params.engineId,
    failureMode: params.failureMode,
    totalCycles: cycles,
    recommendationsGenerated: rows.filter((r) => r.predicted).length,
    recordedActions: failureOnsetCycle > 0 ? 1 : 0,
    leadTimeCycles,
    precision: round(precision),
    recall: round(recall),
    createdAt: params.now.toISOString(),
    rows,
  };
}

const LEAD_WINDOW = 25;

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
