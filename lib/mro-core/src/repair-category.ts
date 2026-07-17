// MRO repair prioritization: the safety/compliance category hierarchy used by
// engine MRO shops, plus the Red/Amber/Green (Must/Should/Could Do) operational
// buckets production control plans against.
//
//   1 Airworthiness Mandatory      – release blocked
//   2 Life-Limited Part Compliance – release blocked
//   3 Safety-Critical Repairs      – release blocked
//   4 Regulatory (ADs / SBs)       – release blocked (ADs always)
//   5 Functional Restoration       – generally required, Amber
//   6 Reliability Improvements     – opportunistic, Amber
//   7 Cosmetic / Minor             – deferrable, Green

// Keep this file dependency-free (llp.ts imports it) — the LLP policy rule id
// is duplicated here as a literal; a unit-level invariant, not runtime config.
const LLP_POLICY_RULE_ID = "llp-life-limit";

export type RepairCategoryId = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type RagBucket = "red" | "amber" | "green";

export interface RepairClassification {
  /** Repair category 1 (Airworthiness Mandatory) … 7 (Cosmetic). */
  repairCategory: RepairCategoryId;
  /** Human-readable category name. */
  repairCategoryName: string;
  /** Operational bucket: red = Must Do, amber = Should Do, green = Could Do. */
  ragBucket: RagBucket;
  /** True when the engine cannot be released to service without this repair. */
  releaseHold: boolean;
}

export const REPAIR_CATEGORY_NAMES: Record<RepairCategoryId, string> = {
  1: "Airworthiness Mandatory",
  2: "Life-Limited Part Compliance",
  3: "Safety-Critical Repair",
  4: "Regulatory (AD/SB)",
  5: "Functional Restoration",
  6: "Reliability Improvement",
  7: "Cosmetic / Minor",
};

/** Red = categories 1–4 (must do before release), amber = 5–6, green = 7. */
export function ragBucketFor(category: RepairCategoryId): RagBucket {
  if (category <= 4) return "red";
  if (category <= 6) return "amber";
  return "green";
}

export function classificationFor(
  category: RepairCategoryId,
): RepairClassification {
  return {
    repairCategory: category,
    repairCategoryName: REPAIR_CATEGORY_NAMES[category],
    ragBucket: ragBucketFor(category),
    releaseHold: category <= 4,
  };
}

// Category assignment per decision rule. Safety-critical structural/rotor
// signals map to Cat 3; performance-restoration signals to Cat 5.
const RULE_CATEGORY: Record<string, RepairCategoryId> = {
  // LLP remaining-life policy → Cat 2 (LLP compliance).
  [LLP_POLICY_RULE_ID]: 2,
  // Fan vibration touches rotor integrity / containment → safety-critical.
  "rule-fan-vibration": 3,
  // Oil pressure below limit endangers bearing/shaft operation → safety-critical.
  "rule-oil-pressure-low": 3,
  // EGT margin erosion → hot-section performance restoration.
  "rule-egt-margin-erosion": 5,
  // Elevated oil consumption → seal restoration (performance/functional).
  "rule-oil-consumption-high": 5,
};

/**
 * Classify a recommendation by the rule that produced it. Unknown rules default
 * to Functional Restoration (Cat 5 / Amber) — the safe middle ground for
 * on-condition inspections.
 */
export function classifyRuleId(ruleId: string): RepairClassification {
  return classificationFor(RULE_CATEGORY[ruleId] ?? 5);
}

/**
 * Classify by rule, considering regulatory references: rules not in the
 * explicit map whose references cite an Airworthiness Directive are
 * compliance-driven → Cat 4 (Regulatory). Explicit assignments always win
 * (e.g. fan vibration cites an AD but is safety-critical Cat 3).
 */
export function classifyRule(rule: {
  id: string;
  regulatoryRefs: string[];
}): RepairClassification {
  const explicit = RULE_CATEGORY[rule.id];
  if (explicit !== undefined) return classificationFor(explicit);
  const adDriven = rule.regulatoryRefs.some((r) => /\bAD\b/.test(r));
  return classificationFor(adDriven ? 4 : 5);
}

/** Sort order: red first, then amber, then green. */
export const RAG_ORDER: Record<RagBucket, number> = {
  red: 0,
  amber: 1,
  green: 2,
};
