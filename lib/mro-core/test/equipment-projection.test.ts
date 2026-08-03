/**
 * Verifies that WorkUnit, EquipmentClass, and Equipment nodes — plus the five
 * new edge types introduced by the equipment hierarchy feature — are correctly
 * projected into the graph by buildGraph().
 *
 * Runs with: pnpm --filter @workspace/mro-core exec tsx --test test/equipment-projection.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildGraph,
  type GraphWorkCentre,
  type GraphWorkUnit,
  type GraphEquipmentClass,
  type GraphEquipment,
} from "../src/graph/projection.js";
import type { Engine } from "../src/types.js";

// ── minimal fixtures ──────────────────────────────────────────────────────────

const engine: Engine = {
  esn: "ESN-EQ-01",
  model: "Trent XWB-84",
  tailNumber: "A7-EQ",
  operator: "TestAir",
  status: "healthy",
  healthScore: 88,
  tsn: 5000,
  csn: 2000,
} as unknown as Engine;

const workCentre: GraphWorkCentre = {
  id: "wc-borescope",
  name: "Borescope Bay",
  workCenterType: "BORESCOPE",
  capacity: 3,
  areaName: "Engine Disassembly",
  twinState: "ACTIVE",
};

const workUnit: GraphWorkUnit = {
  id: "wu-1",
  workCenterId: "wc-borescope",
  name: "Borescope Bay — Cell 1",
  workUnitType: "WorkCell",
};

const equipmentClass: GraphEquipmentClass = {
  id: "ec-borescope",
  equipmentClassCode: "BORESCOPE_RIG",
  name: "Borescope Inspection Rig",
  requiredForSkills: ["Borescope inspection"],
};

const equipment: GraphEquipment = {
  id: "eq-1",
  equipmentClassId: "ec-borescope",
  workUnitId: "wu-1",
  name: "Olympus IPLEX NX Borescope #1",
  serialNumber: "SN-1001",
  equipmentStatus: "AVAILABLE",
};

// Node ID prefixes used by projection.ts
const WC_ID  = `wc:${workCentre.id}`;
const WU_ID  = `wu:${workUnit.id}`;
const EC_ID  = `eqclass:${equipmentClass.id}`;
const EQ_ID  = `eq:${equipment.id}`;

/** Baseline buildGraph call with all equipment inputs populated. */
function buildEquipmentGraph() {
  return buildGraph(
    [engine],         // engines
    [],               // recommendations
    [],               // rules
    [],               // exchanges
    [],               // llps
    [],               // workPackageTasks
    [],               // latestReadings
    new Date(),       // now
    [workCentre],     // workCentres
    [],               // operationSegments
    [],               // personnelClasses
    [workUnit],       // workUnits
    [equipmentClass], // equipmentClasses
    [equipment],      // equipment
  );
}

// ── node tests ────────────────────────────────────────────────────────────────

test("WorkUnit node is projected with correct type and label", () => {
  const { nodes } = buildEquipmentGraph();
  const node = nodes.find((n) => n.id === WU_ID);
  assert.ok(node, `WorkUnit node '${WU_ID}' must exist in graph`);
  assert.equal(node!.type, "WorkUnit");
  assert.equal(node!.label, workUnit.name);
});

test("EquipmentClass node is projected with correct type and label", () => {
  const { nodes } = buildEquipmentGraph();
  const node = nodes.find((n) => n.id === EC_ID);
  assert.ok(node, `EquipmentClass node '${EC_ID}' must exist in graph`);
  assert.equal(node!.type, "EquipmentClass");
  assert.equal(node!.label, equipmentClass.name);
});

test("Equipment node is projected with correct type and equipmentStatus property", () => {
  const { nodes } = buildEquipmentGraph();
  const node = nodes.find((n) => n.id === EQ_ID);
  assert.ok(node, `Equipment node '${EQ_ID}' must exist in graph`);
  assert.equal(node!.type, "Equipment");
  assert.equal(node!.properties?.["equipmentStatus"], equipment.equipmentStatus);
});

// ── edge tests ────────────────────────────────────────────────────────────────

test("hasWorkUnit edge connects WorkCentre to WorkUnit (fires only when WC node exists)", () => {
  const { edges } = buildEquipmentGraph();
  const edge = edges.find(
    (e) =>
      e.label === "hasWorkUnit" &&
      e.source === WC_ID &&
      e.target === WU_ID,
  );
  assert.ok(edge, "hasWorkUnit edge must connect WorkCentre → WorkUnit");
});

test("equipmentInUnit edge connects WorkUnit to Equipment", () => {
  const { edges } = buildEquipmentGraph();
  const edge = edges.find(
    (e) =>
      e.label === "equipmentInUnit" &&
      e.source === WU_ID &&
      e.target === EQ_ID,
  );
  assert.ok(edge, "equipmentInUnit edge must connect WorkUnit → Equipment");
});

test("equipInstanceOf edge connects Equipment to its EquipmentClass", () => {
  const { edges } = buildEquipmentGraph();
  const edge = edges.find(
    (e) =>
      e.label === "equipInstanceOf" &&
      e.source === EQ_ID &&
      e.target === EC_ID,
  );
  assert.ok(edge, "equipInstanceOf edge must connect Equipment → EquipmentClass");
});

test("requiresEquipment edge links a skill-matched MaintenanceTaskDefinition to EquipmentClass", () => {
  // workPackageTask whose skillRequired matches equipmentClass.requiredForSkills[0]
  const matchingTask = {
    id: "task-1",
    workPackageId: "wp-1",
    ataCode: "72-00",
    taskTitle: "Borescope inspection HPC",
    taskType: "INSPECTION",
    skill: "Borescope inspection",
    estimatedHours: 2,
    sequenceOrder: 1,
    status: "PENDING",
    assignedPersonnelId: null,
    startedAt: null,
    completedAt: null,
    tcn: "TCN-0001",
    signOffRequired: false,
    signedOffAt: null,
    signedOffBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const graph = buildGraph(
    [engine],
    [],
    [],
    [],
    [],
    [matchingTask as never],
    [],
    new Date(),
    [workCentre],
    [],
    [],
    [workUnit],
    [equipmentClass],
    [equipment],
  );

  // slug("72-00") → "72-00"; projection uses `taskdef:` prefix
  const mtdId = `taskdef:${matchingTask.ataCode}`;
  const mtdNode = graph.nodes.find((n) => n.id === mtdId);
  assert.ok(mtdNode, `MaintenanceTaskDefinition node '${mtdId}' must be synthesised from workPackageTasks`);

  const edge = graph.edges.find(
    (e) =>
      e.label === "requiresEquipment" &&
      e.source === mtdId &&
      e.target === EC_ID,
  );
  assert.ok(edge, "requiresEquipment edge must link MaintenanceTaskDefinition → EquipmentClass when skills match");
});

test("no equipment nodes or edges when equipment inputs are omitted", () => {
  const graph = buildGraph([engine], [], []);
  const equipNodes = graph.nodes.filter((n) =>
    ["WorkUnit", "EquipmentClass", "Equipment"].includes(n.type),
  );
  const equipEdges = graph.edges.filter((e) =>
    ["hasWorkUnit", "equipmentInUnit", "equipInstanceOf", "requiresEquipment", "segmentUsesEquipment"].includes(
      e.label,
    ),
  );
  assert.equal(equipNodes.length, 0, "no WorkUnit/EquipmentClass/Equipment nodes without inputs");
  assert.equal(equipEdges.length, 0, "no equipment edges without inputs");
});
