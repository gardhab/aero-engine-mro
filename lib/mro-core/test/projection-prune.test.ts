import assert from "node:assert/strict";
import { test } from "node:test";
import { buildGraph, supersededSensorEdgeIds } from "../src/graph/projection.js";
import type { Engine, GraphData, ParameterReading, Rule } from "../src/types.js";

const engine: Engine = {
  esn: "ESN-9001",
  model: "Trent XWB-84",
  tailNumber: "A7-TST",
  operator: "TestAir",
  status: "healthy",
  healthScore: 95,
  tsn: 1000,
  csn: 500,
} as unknown as Engine;

function rule(id: string, parameter: string, failureMode: string): Rule {
  return {
    id,
    name: `Rule ${id}`,
    parameter,
    component: "HPT",
    failureMode,
    operator: "gt",
    threshold: 10,
    enabled: true,
  } as unknown as Rule;
}

function reading(parameter: string): ParameterReading {
  return {
    engineId: engine.esn,
    parameter,
    label: parameter.toUpperCase(),
    value: 42,
    unit: "u",
    cycle: 100,
    timestamp: "2026-07-17T00:00:00Z",
    status: "normal",
  } as unknown as ParameterReading;
}

test("observed parameters get observation-level diagnostic edges; unobserved keep sensor-level fallback", () => {
  // 'EGT_MARGIN' has a projected observation; 'N2_VIB' does not.
  const graph = buildGraph(
    [engine],
    [],
    [rule("r1", "EGT_MARGIN", "HPT blade deterioration"), rule("r2", "N2_VIB", "Bearing wear")],
    [],
    [],
    [],
    [reading("EGT_MARGIN")],
  );
  const evalEdges = graph.edges.filter((e) => e.label === "evaluates");
  const obsEval = evalEdges.find((e) => e.source === "rule:r1");
  const sensorEval = evalEdges.find((e) => e.source === "rule:r2");
  assert.ok(obsEval && obsEval.target.startsWith("obs:"), "observed rule evaluates observation");
  assert.ok(sensorEval && sensorEval.target === "sensor:N2_VIB", "unobserved rule keeps sensor fallback");
});

test("prune removes only sensor-level edges with an observation-level replacement in the same context", () => {
  // Simulate a post-merge graph: old sensor-level edges survive alongside new
  // observation-level edges for 'EGT_MARGIN' only; 'N2_VIB' has no observations.
  const fresh = buildGraph(
    [engine],
    [],
    [rule("r1", "EGT_MARGIN", "HPT blade deterioration"), rule("r2", "N2_VIB", "Bearing wear")],
    [],
    [],
    [],
    [reading("EGT_MARGIN")],
  );
  const merged: GraphData = {
    nodes: fresh.nodes,
    edges: [
      ...fresh.edges,
      // Pre-split legacy edges for both rules (merge never deletes).
      { id: "e:r1:evaluates", source: "rule:r1", target: "sensor:EGT_MARGIN", label: "evaluates" },
      { id: "e:EGT_MARGIN:hpt-blade-deterioration:indicates", source: "sensor:EGT_MARGIN", target: "failuremode:hpt-blade-deterioration", label: "indicates" },
    ],
  };
  const stale = supersededSensorEdgeIds(merged);
  assert.deepEqual(
    stale.sort(),
    ["e:EGT_MARGIN:hpt-blade-deterioration:indicates", "e:r1:evaluates"],
    "only the superseded egtm edges are pruned",
  );
  // r2's sensor-level fallback edges must survive: they are not in the list.
  assert.ok(!stale.some((id) => id.includes("r2") || id.includes("N2_VIB")));
});

test("prune is a no-op when no observations are projected", () => {
  const graph = buildGraph([engine], [], [rule("r1", "EGT_MARGIN", "HPT blade deterioration")], [], [], [], []);
  assert.deepEqual(supersededSensorEdgeIds(graph), []);
});
