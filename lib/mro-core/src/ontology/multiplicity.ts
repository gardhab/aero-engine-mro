import type { OntologyRelationship } from "../types.js";

/**
 * UML-style multiplicity: "1", "0..1", "0..*", "1..*", "2..4", "*".
 * Lower bound is a non-negative integer; upper bound is an integer or "*".
 */
const MULTIPLICITY_RE = /^(?:\*|(\d+)(?:\.\.(\d+|\*))?)$/;

/** Returns an error message if the multiplicity is malformed, else null. */
export function multiplicityError(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return "multiplicity is missing";
  }
  const m = MULTIPLICITY_RE.exec(value.trim());
  if (!m) {
    return `"${value}" is not a valid multiplicity (expected forms: 1, 0..1, 0..*, 1..*)`;
  }
  if (m[1] !== undefined && m[2] !== undefined && m[2] !== "*") {
    const lower = Number(m[1]);
    const upper = Number(m[2]);
    if (upper < lower) {
      return `"${value}" has upper bound below lower bound`;
    }
    if (upper === 0) {
      return `"${value}" has an upper bound of 0`;
    }
  }
  return null;
}

export function isValidMultiplicity(value: unknown): boolean {
  return multiplicityError(value) === null;
}

/**
 * Reviewed multiplicities for relationships that predate first-class
 * multiplicity storage, keyed by relationship id: [source-end, target-end].
 * Used to default older stored ontology versions on read.
 */
const LEGACY_MULTIPLICITIES: Record<string, [string, string]> = {
  hasModule: ["1", "1..*"],
  hasComponent: ["1", "0..*"],
  hasPiecePart: ["1", "0..*"],
  monitoredBy: ["1", "1..*"],
  indicates: ["0..*", "0..*"],
  affects: ["0..*", "1..*"],
  detects: ["1", "1"],
  evaluates: ["0..*", "1..*"],
  generates: ["1", "0..*"],
  appliesTo: ["0..*", "1"],
  recommends: ["1", "0..*"],
  governedBy: ["0..*", "1..*"],
  dispatchedAs: ["1", "0..1"],
  concerns: ["0..*", "1"],
  mandates: ["1", "0..*"],
  acknowledgedBy: ["1", "0..1"],
};

const DEFAULT_MULTIPLICITY: [string, string] = ["0..*", "0..*"];

/**
 * Fill in multiplicities for relationships stored before they became part of
 * the model (older published versions). Known seed relationships get their
 * reviewed values; anything else defaults to 0..* at both ends.
 */
export function normalizeRelationship(
  rel: Partial<OntologyRelationship> & Omit<OntologyRelationship, "sourceMultiplicity" | "targetMultiplicity">,
): OntologyRelationship {
  if (
    isValidMultiplicity(rel.sourceMultiplicity) &&
    isValidMultiplicity(rel.targetMultiplicity)
  ) {
    return rel as OntologyRelationship;
  }
  const [src, tgt] = LEGACY_MULTIPLICITIES[rel.id] ?? DEFAULT_MULTIPLICITY;
  return {
    ...rel,
    sourceMultiplicity: isValidMultiplicity(rel.sourceMultiplicity)
      ? (rel.sourceMultiplicity as string)
      : src,
    targetMultiplicity: isValidMultiplicity(rel.targetMultiplicity)
      ? (rel.targetMultiplicity as string)
      : tgt,
  };
}

export function normalizeRelationships(
  rels: Array<Partial<OntologyRelationship> & Omit<OntologyRelationship, "sourceMultiplicity" | "targetMultiplicity">>,
): OntologyRelationship[] {
  return rels.map(normalizeRelationship);
}
