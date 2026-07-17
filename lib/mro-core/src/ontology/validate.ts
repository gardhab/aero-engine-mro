import type {
  Ontology,
  OntologyValidationIssue,
  OntologyValidationResult,
  OntologyImpact,
  Rule,
} from "../types.js";
import { multiplicityError } from "./multiplicity.js";

export interface ImpactCounts {
  /** Number of graph instance nodes per class id. */
  nodeCountByClass: Record<string, number>;
}

/**
 * Validate an ontology document for structural conformance and surface impact
 * warnings so an SME understands the blast radius of a change before publishing.
 */
export function validateOntology(
  ontology: Ontology,
  rules: Rule[],
  impacts: ImpactCounts,
): OntologyValidationResult {
  const issues: OntologyValidationIssue[] = [];
  const classIds = new Set(ontology.classes.map((c) => c.id));
  const activeClassIds = new Set(
    ontology.classes.filter((c) => !c.deprecated).map((c) => c.id),
  );

  // Duplicate class ids.
  const seen = new Set<string>();
  for (const cls of ontology.classes) {
    if (seen.has(cls.id)) {
      issues.push({
        severity: "error",
        message: `Duplicate class id "${cls.id}".`,
        target: cls.id,
      });
    }
    seen.add(cls.id);
    if (!cls.label.trim()) {
      issues.push({
        severity: "error",
        message: `Class "${cls.id}" has an empty label.`,
        target: cls.id,
      });
    }
    if (cls.parentClass && !classIds.has(cls.parentClass)) {
      issues.push({
        severity: "error",
        message: `Class "${cls.id}" references unknown parent "${cls.parentClass}".`,
        target: cls.id,
      });
    }
  }

  // Relationship endpoints must resolve to existing, non-deprecated classes,
  // and both-end multiplicities must be present and well-formed.
  for (const rel of ontology.relationships) {
    if (!rel.label.trim()) {
      issues.push({
        severity: "error",
        message: `Relationship "${rel.id}" has an empty directional name.`,
        target: rel.id,
      });
    }
    const srcErr = multiplicityError(rel.sourceMultiplicity);
    if (srcErr) {
      issues.push({
        severity: "error",
        message: `Relationship "${rel.id}" source-end multiplicity: ${srcErr}.`,
        target: rel.id,
      });
    }
    const tgtErr = multiplicityError(rel.targetMultiplicity);
    if (tgtErr) {
      issues.push({
        severity: "error",
        message: `Relationship "${rel.id}" target-end multiplicity: ${tgtErr}.`,
        target: rel.id,
      });
    }
    if (!classIds.has(rel.domain)) {
      issues.push({
        severity: "error",
        message: `Relationship "${rel.id}" has unknown domain class "${rel.domain}".`,
        target: rel.id,
      });
    } else if (!activeClassIds.has(rel.domain) && !rel.deprecated) {
      issues.push({
        severity: "warning",
        message: `Relationship "${rel.id}" uses deprecated domain class "${rel.domain}".`,
        target: rel.id,
      });
    }
    if (!classIds.has(rel.range)) {
      issues.push({
        severity: "error",
        message: `Relationship "${rel.id}" has unknown range class "${rel.range}".`,
        target: rel.id,
      });
    } else if (!activeClassIds.has(rel.range) && !rel.deprecated) {
      issues.push({
        severity: "warning",
        message: `Relationship "${rel.id}" uses deprecated range class "${rel.range}".`,
        target: rel.id,
      });
    }
  }

  // Impact analysis: how many rules / graph nodes depend on each class.
  const impactList: OntologyImpact[] = [];
  for (const cls of ontology.classes) {
    const ruleCount = countRulesForClass(cls.id, rules);
    const nodeCount = impacts.nodeCountByClass[cls.id] ?? 0;
    if (cls.deprecated && (ruleCount > 0 || nodeCount > 0)) {
      issues.push({
        severity: "warning",
        message: `Deprecated class "${cls.id}" is still referenced by ${ruleCount} rule(s) and ${nodeCount} graph node(s).`,
        target: cls.id,
      });
    }
    if (ruleCount > 0 || nodeCount > 0) {
      impactList.push({
        target: cls.id,
        ruleCount,
        nodeCount,
        message: `${ruleCount} rule(s) and ${nodeCount} graph node(s) reference "${cls.label}".`,
      });
    }
  }

  const valid = issues.every((i) => i.severity !== "error");
  return { valid, issues, impacts: impactList };
}

// Rules reference the domain model conceptually. Rules that produce
// Recommendations from Sensors and FailureModes touch those core classes.
const RULE_CORE_CLASSES = new Set([
  "DiagnosticRuleDefinition",
  "Sensor",
  "MeasurementObservation",
  "FailureMode",
  "MaintenanceRecommendation",
  "Component",
]);

function countRulesForClass(classId: string, rules: Rule[]): number {
  if (RULE_CORE_CLASSES.has(classId)) return rules.length;
  return 0;
}
