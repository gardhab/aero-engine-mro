import type { ParameterReading, Rule } from "../types.js";

export interface RuleMatch {
  rule: Rule;
  /** Readings (most recent window) that satisfied the rule, oldest-first. */
  window: ParameterReading[];
  /** The latest triggering reading. */
  trigger: ParameterReading;
  /** 0-1 confidence derived from exceedance magnitude and window length. */
  confidence: number;
  /** 0-1 severity, base rule severity scaled by exceedance magnitude. */
  severity: number;
}

function readingsFor(
  readings: ParameterReading[],
  parameter: string,
): ParameterReading[] {
  return readings
    .filter((r) => r.parameter === parameter)
    .sort((a, b) => a.cycle - b.cycle);
}

function satisfies(rule: Rule, value: number): boolean {
  switch (rule.operator) {
    case "lt":
      return value < rule.threshold;
    case "gt":
      return value > rule.threshold;
    default:
      return false;
  }
}

function isMonotonic(window: ParameterReading[], down: boolean): boolean {
  for (let i = 1; i < window.length; i++) {
    if (down && window[i].value >= window[i - 1].value) return false;
    if (!down && window[i].value <= window[i - 1].value) return false;
  }
  return true;
}

/**
 * Evaluate a single rule against an engine's readings. Returns a match if the
 * most recent `consecutiveCycles` readings all satisfy the rule condition.
 */
export function evaluateRule(
  rule: Rule,
  readings: ParameterReading[],
): RuleMatch | null {
  if (!rule.enabled) return null;
  const series = readingsFor(readings, rule.parameter);
  if (series.length < rule.consecutiveCycles) return null;

  const window = series.slice(-rule.consecutiveCycles);
  const trigger = window[window.length - 1];

  let fired = false;
  if (rule.operator === "lt" || rule.operator === "gt") {
    fired = window.every((r) => satisfies(rule, r.value));
  } else if (rule.operator === "trend_down") {
    fired = isMonotonic(window, true);
  } else if (rule.operator === "trend_up") {
    fired = isMonotonic(window, false);
  }
  if (!fired) return null;

  // Confidence: how far beyond threshold, plus consistency of the window.
  const magnitude = exceedanceRatio(rule, trigger.value);
  const confidence = clamp(0.55 + 0.35 * magnitude, 0, 0.99);
  const severity = clamp(rule.severity * (0.7 + 0.6 * magnitude), 0, 1);

  return { rule, window, trigger, confidence, severity };
}

function exceedanceRatio(rule: Rule, value: number): number {
  const t = rule.threshold;
  if (rule.operator === "lt") {
    if (t === 0) return value <= 0 ? 1 : 0;
    return clamp((t - value) / Math.abs(t), 0, 1);
  }
  if (rule.operator === "gt") {
    if (t === 0) return clamp(value, 0, 1);
    return clamp((value - t) / Math.abs(t), 0, 1);
  }
  return 0.5;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Evaluate all rules against an engine's readings, best match first. */
export function evaluateRules(
  rules: Rule[],
  readings: ParameterReading[],
): RuleMatch[] {
  const matches: RuleMatch[] = [];
  for (const rule of rules) {
    const m = evaluateRule(rule, readings);
    if (m) matches.push(m);
  }
  return matches.sort((a, b) => b.severity - a.severity);
}
