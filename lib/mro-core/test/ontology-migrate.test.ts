import assert from "node:assert/strict";
import { test } from "node:test";
import { applyOntologyRestructure } from "../src/ontology/migrate.js";
import { SEED_CLASSES } from "../src/ontology/seed.js";
import type { OntologyClass, OntologyRelationship } from "../src/types.js";

function cls(partial: Partial<OntologyClass> & { id: string }): OntologyClass {
  return {
    label: partial.id,
    description: "",
    parentClass: null,
    attributes: [],
    ...partial,
  } as OntologyClass;
}

function rel(
  id: string,
  domain: string,
  range: string,
): OntologyRelationship {
  return {
    id,
    label: id,
    domain,
    range,
    sourceMultiplicity: "1",
    targetMultiplicity: "0..*",
  } as unknown as OntologyRelationship;
}

test("renames class ids and rewires relationships; refreshes only unchanged default labels", () => {
  const row = {
    classes: [
      // Still at the shipped default → label/description refreshed.
      cls({
        id: "Rule",
        label: "Diagnostic Rule",
        description:
          "A data-driven rule that evaluates a sensor trend to detect a failure mode.",
      }),
      // SME-edited label → preserved verbatim across the id rename.
      cls({
        id: "Recommendation",
        label: "SME Custom Recommendation",
        description: "SME wrote this.",
      }),
    ],
    relationships: [rel("generates", "Rule", "Recommendation")],
  };
  const out = applyOntologyRestructure(row);
  const ids = out.classes.map((c) => c.id);
  assert.deepEqual(ids, ["DiagnosticRuleDefinition", "MaintenanceRecommendation"]);
  const seedRule = SEED_CLASSES.find((c) => c.id === "DiagnosticRuleDefinition")!;
  assert.equal(out.classes[0].label, seedRule.label);
  assert.equal(out.classes[1].label, "SME Custom Recommendation");
  assert.equal(out.classes[1].description, "SME wrote this.");
  assert.deepEqual(
    [out.relationships[0].domain, out.relationships[0].range],
    ["DiagnosticRuleDefinition", "MaintenanceRecommendation"],
  );
});

test("retargets evaluates/indicates from Sensor to MeasurementObservation and drops moved attributes", () => {
  const row = {
    classes: [
      cls({
        id: "Engine",
        label: "Engine",
        attributes: [
          { name: "esn", type: "string" },
          { name: "model", type: "string" },
          { name: "tailNumber", type: "string" },
        ] as OntologyClass["attributes"],
      }),
    ],
    relationships: [
      rel("evaluates", "Rule", "Sensor"),
      rel("indicates", "Sensor", "FailureMode"),
    ],
  };
  const out = applyOntologyRestructure(row);
  assert.deepEqual(
    out.classes[0].attributes.map((a) => a.name),
    ["esn"],
    "model/tailNumber moved off Engine",
  );
  assert.equal(out.relationships[0].range, "MeasurementObservation");
  assert.equal(out.relationships[1].domain, "MeasurementObservation");
});

test("is idempotent: no changes on an already-migrated row", () => {
  const row = {
    classes: [cls({ id: "DiagnosticRuleDefinition", label: "Kept" })],
    relationships: [
      rel("evaluates", "DiagnosticRuleDefinition", "MeasurementObservation"),
    ],
  };
  const out = applyOntologyRestructure(row);
  assert.equal(out, row, "same object identity when nothing applies");
});
