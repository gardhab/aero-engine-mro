import type { OntologyClass, OntologyRelationship } from "../types.js";
import {
  ONTOLOGY_ATTRIBUTE_REMOVALS,
  ONTOLOGY_CLASS_RENAMES,
  SEED_CLASSES,
  SEED_RELATIONSHIPS,
} from "./seed.js";

/**
 * Pre-restructure seed defaults for label/description, keyed by OLD class id.
 * Used to distinguish "still the shipped default" (safe to refresh) from
 * SME-edited text (must be preserved verbatim).
 */
const LEGACY_CLASS_DEFAULTS: Record<
  string,
  { label: string; description: string }
> = {
  Rule: {
    label: "Diagnostic Rule",
    description:
      "A data-driven rule that evaluates a sensor trend to detect a failure mode.",
  },
  Recommendation: {
    label: "Work Recommendation",
    description:
      "A traceable MRO work recommendation produced by the decision service.",
  },
  MaintenanceTask: {
    label: "Maintenance Task",
    description:
      "A discrete maintenance action, referenced by ATA and S1000D task codes.",
  },
  RegulatoryReference: {
    label: "Regulatory Reference",
    description:
      "An airworthiness citation (AMM, SB, AD, EASA/FAA regulation) governing a task.",
  },
  Sensor: {
    label: "Sensor / Measurement",
    description:
      "An ECTM parameter measured during engine operation and trended over cycles.",
  },
};

export interface OntologyRestructureInput {
  classes: OntologyClass[];
  relationships: OntologyRelationship[];
}

/**
 * Apply the definition/instance restructure to a stored ontology version:
 * - rename class ids per ONTOLOGY_CLASS_RENAMES, rewiring relationship
 *   domains/ranges and parentClass references through the same map;
 * - refresh a renamed/retitled class's label/description ONLY when it still
 *   equals the old seed default — SME-edited text is preserved verbatim;
 * - retarget `evaluates`/`indicates` from the physical Sensor to
 *   MeasurementObservation (only when they still point at Sensor);
 * - drop attributes that moved to another class (e.g. Engine.model →
 *   EngineModel, Engine.tailNumber → Aircraft);
 * - adopt seed enumValues on attributes that are still unconstrained strings.
 * Returns the input unchanged (same object identities) when nothing applies.
 */
export function applyOntologyRestructure<T extends OntologyRestructureInput>(
  row: T,
): T {
  const seedById = new Map(SEED_CLASSES.map((c) => [c.id, c]));
  let classesChanged = false;
  const classes = row.classes.map((c) => {
    let next = c;
    const legacy = LEGACY_CLASS_DEFAULTS[c.id];
    const newId = ONTOLOGY_CLASS_RENAMES[c.id];
    if (newId && !row.classes.some((o) => o.id === newId)) {
      next = { ...next, id: newId };
    }
    // Refresh only text that still equals the old shipped default.
    if (legacy) {
      const seed = seedById.get(newId ?? c.id);
      if (seed) {
        if (next.label === legacy.label && next.label !== seed.label) {
          next = next === c ? { ...next } : next;
          next.label = seed.label;
        }
        if (
          next.description === legacy.description &&
          next.description !== seed.description
        ) {
          next = next === c ? { ...next } : next;
          next.description = seed.description;
        }
      }
    }
    const removals = ONTOLOGY_ATTRIBUTE_REMOVALS[next.id];
    if (removals && next.attributes.some((a) => removals.includes(a.name))) {
      next = {
        ...next,
        attributes: next.attributes.filter((a) => !removals.includes(a.name)),
      };
    }
    // Adopt seed enumValues for attributes that are still plain strings.
    const seed = seedById.get(next.id);
    if (seed) {
      const enumByName = new Map(
        seed.attributes
          .filter((a) => a.enumValues && a.enumValues.length > 0)
          .map((a) => [a.name, a.enumValues as string[]]),
      );
      if (
        next.attributes.some(
          (a) => enumByName.has(a.name) && !a.enumValues?.length,
        )
      ) {
        next = {
          ...next,
          attributes: next.attributes.map((a) =>
            enumByName.has(a.name) && !a.enumValues?.length
              ? { ...a, enumValues: enumByName.get(a.name) }
              : a,
          ),
        };
      }
    }
    if (next.parentClass && ONTOLOGY_CLASS_RENAMES[next.parentClass]) {
      next = { ...next, parentClass: ONTOLOGY_CLASS_RENAMES[next.parentClass] };
    }
    if (next !== c) classesChanged = true;
    return next;
  });

  const seedRelById = new Map(SEED_RELATIONSHIPS.map((r) => [r.id, r]));
  let relsChanged = false;
  const relationships = row.relationships.map((r) => {
    let next = r;
    const domain = ONTOLOGY_CLASS_RENAMES[next.domain] ?? next.domain;
    const range = ONTOLOGY_CLASS_RENAMES[next.range] ?? next.range;
    if (domain !== next.domain || range !== next.range) {
      next = { ...next, domain, range };
    }
    // Sensor → observation retarget for the diagnostic chain.
    const seedRel = seedRelById.get(next.id);
    if (
      seedRel &&
      (next.id === "evaluates" || next.id === "indicates") &&
      (next.domain === "Sensor" || next.range === "Sensor")
    ) {
      next = { ...next, domain: seedRel.domain, range: seedRel.range };
    }
    if (next !== r) relsChanged = true;
    return next;
  });

  if (!classesChanged && !relsChanged) return row;
  return {
    ...row,
    classes: classesChanged ? classes : row.classes,
    relationships: relsChanged ? relationships : row.relationships,
  };
}
