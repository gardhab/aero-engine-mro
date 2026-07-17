import type {
  Engine,
  GraphData,
  GraphEdge,
  GraphNode,
  ParameterReading,
  Recommendation,
  Rule,
} from "../types.js";
import type { ShopVisitExchange } from "../exchange/types.js";
import type { EngineLlp } from "../llp.js";
import type { WorkPackageTask } from "../work-package.js";
import { PARAMETERS, PARAMETER_BY_CODE } from "../data/parameters.js";
import { piecePartsForComponent } from "../data/piece-parts.js";

export interface GraphFilter {
  engineId?: string;
  type?: string;
}

/**
 * Project the domain state into a property graph that instantiates the ontology.
 * Nodes carry an ontology class id in `type`; edges use ontology relationship ids
 * as labels, giving end-to-end traceability from engines to recommendations.
 */
export function buildGraph(
  engines: Engine[],
  recommendations: Recommendation[],
  rules: Rule[],
  exchanges: ShopVisitExchange[] = [],
  llps: EngineLlp[] = [],
  workPackageTasks: WorkPackageTask[] = [],
  /** Latest reading per engine+parameter, projected as MeasurementObservations. */
  latestReadings: ParameterReading[] = [],
): GraphData {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeIds = new Set<string>();

  const addNode = (n: GraphNode) => {
    if (nodeIds.has(n.id)) return;
    nodeIds.add(n.id);
    nodes.push(n);
  };
  const addEdge = (e: GraphEdge) => edges.push(e);

  // Global sensor nodes (one per ECTM parameter).
  for (const def of PARAMETERS) {
    addNode({
      id: `sensor:${def.code}`,
      type: "Sensor",
      label: def.label,
      properties: {
        code: def.code,
        unit: def.unit,
        baseline: def.baseline,
        limit: def.limit,
        module: def.module,
      },
    });
  }

  // Measurement observations: the latest reading per engine+parameter,
  // produced by the sensor. Diagnostic rules evaluate these observations,
  // not the physical sensor.
  const obsIdOf = (engineId: string, parameter: string) =>
    `obs:${engineId}:${parameter}`;
  const obsByParameter = new Map<string, ParameterReading[]>();
  for (const r of latestReadings) {
    const list = obsByParameter.get(r.parameter) ?? [];
    list.push(r);
    obsByParameter.set(r.parameter, list);
    addNode({
      id: obsIdOf(r.engineId, r.parameter),
      type: "MeasurementObservation",
      label: `${r.label} · ${r.engineId}`,
      properties: {
        engineId: r.engineId,
        parameter: r.parameter,
        value: r.value,
        unit: r.unit,
        cycle: r.cycle,
        timestamp: r.timestamp,
        status: r.status,
      },
    });
    addEdge({
      id: `e:${r.parameter}:${r.engineId}:produces`,
      source: `sensor:${r.parameter}`,
      target: obsIdOf(r.engineId, r.parameter),
      label: "produces",
    });
  }

  // Global failure-mode and rule-definition nodes.
  for (const rule of rules) {
    const fmId = `failuremode:${slug(rule.failureMode)}`;
    addNode({
      id: fmId,
      type: "FailureMode",
      label: rule.failureMode,
      properties: { name: rule.failureMode, component: rule.component },
    });
    addNode({
      id: `rule:${rule.id}`,
      type: "DiagnosticRuleDefinition",
      label: rule.name,
      properties: {
        operator: rule.operator,
        threshold: rule.threshold,
        parameter: rule.parameter,
        enabled: rule.enabled,
      },
    });
    addEdge({
      id: `e:${rule.id}:detects`,
      source: `rule:${rule.id}`,
      target: fmId,
      label: "detects",
    });
    const sensor = PARAMETER_BY_CODE[rule.parameter];
    if (sensor) {
      const observations = obsByParameter.get(rule.parameter) ?? [];
      if (observations.length > 0) {
        // Rules evaluate observations; observation trends indicate failure modes.
        for (const obs of observations) {
          addEdge({
            id: `e:${rule.id}:${obs.engineId}:evaluates`,
            source: `rule:${rule.id}`,
            target: obsIdOf(obs.engineId, rule.parameter),
            label: "evaluates",
          });
          addEdge({
            id: `e:${rule.parameter}:${obs.engineId}:${slug(rule.failureMode)}:indicates`,
            source: obsIdOf(obs.engineId, rule.parameter),
            target: fmId,
            label: "indicates",
          });
        }
      } else {
        // No observations projected (e.g. no readings supplied): keep the
        // sensor-level trace so the diagnostic chain stays connected.
        addEdge({
          id: `e:${rule.id}:evaluates`,
          source: `rule:${rule.id}`,
          target: `sensor:${rule.parameter}`,
          label: "evaluates",
        });
        addEdge({
          id: `e:${rule.parameter}:${slug(rule.failureMode)}:indicates`,
          source: `sensor:${rule.parameter}`,
          target: fmId,
          label: "indicates",
        });
      }
    }
  }

  // Per-engine nodes: engine, its modules, and monitoredBy links. Modules are
  // the union of ECTM-monitored modules and modules carrying tracked LLPs.
  const llpsByEngine = new Map<string, EngineLlp[]>();
  for (const p of llps) {
    const list = llpsByEngine.get(p.engineId) ?? [];
    list.push(p);
    llpsByEngine.set(p.engineId, list);
  }
  const modulesUsed = Array.from(
    new Set([
      ...PARAMETERS.map((p) => p.module),
      ...llps.map((p) => p.module),
    ]),
  );
  for (const eng of engines) {
    // Serialized asset: identity is the ESN alone. Design (model) and airframe
    // (tail number) are separate nodes linked by instanceOf / installation.
    addNode({
      id: `engine:${eng.esn}`,
      type: "Engine",
      label: `${eng.model} · ${eng.esn}`,
      properties: {
        engineId: eng.esn,
        esn: eng.esn,
        status: eng.status,
        healthScore: eng.healthScore,
        tsn: eng.tsn,
        csn: eng.csn,
      },
    });

    // Design definition: one EngineModel node per model/family.
    const modelId = `model:${slug(eng.model)}`;
    addNode({
      id: modelId,
      type: "EngineModel",
      label: eng.model,
      properties: { modelCode: eng.model },
    });
    addEdge({
      id: `e:${eng.esn}:instanceOf`,
      source: `engine:${eng.esn}`,
      target: modelId,
      label: "instanceOf",
    });

    // Airframe identity: Aircraft owns the tail number; the engine is linked
    // through a time-bounded EngineInstallation (currently installed → no
    // removedDate).
    if (eng.tailNumber) {
      const aircraftId = `aircraft:${slug(eng.tailNumber)}`;
      addNode({
        id: aircraftId,
        type: "Aircraft",
        label: eng.tailNumber,
        properties: {
          tailNumber: eng.tailNumber,
          operator: eng.operator ?? null,
        },
      });
      const installId = `install:${eng.esn}:${slug(eng.tailNumber)}`;
      addNode({
        id: installId,
        type: "EngineInstallation",
        label: `${eng.esn} on ${eng.tailNumber}`,
        properties: {
          engineId: eng.esn,
          tailNumber: eng.tailNumber,
          removedDate: null,
        },
      });
      addEdge({
        id: `e:${eng.esn}:hasInstallation`,
        source: `engine:${eng.esn}`,
        target: installId,
        label: "hasInstallation",
      });
      addEdge({
        id: `e:${eng.esn}:${slug(eng.tailNumber)}:onAircraft`,
        source: installId,
        target: aircraftId,
        label: "onAircraft",
      });
    }
    for (const module of modulesUsed) {
      const modId = `module:${eng.esn}:${slug(module)}`;
      addNode({
        id: modId,
        type: "EngineModule",
        label: module,
        properties: { engineId: eng.esn, name: module },
      });
      addEdge({
        id: `e:${eng.esn}:${slug(module)}:hasModule`,
        source: `engine:${eng.esn}`,
        target: modId,
        label: "hasModule",
      });
      for (const def of PARAMETERS.filter((p) => p.module === module)) {
        addEdge({
          id: `e:${modId}:${def.code}:monitoredBy`,
          source: modId,
          target: `sensor:${def.code}`,
          label: "monitoredBy",
        });
      }
    }

    // Life-limited parts installed on this engine, attached to their module.
    // The serialized part carries accumulated usage; certified life limits
    // live on the part-number LlpCategory design node it conforms to.
    for (const part of llpsByEngine.get(eng.esn) ?? []) {
      const catId = `llpcat:${slug(part.partNumber)}`;
      addNode({
        id: catId,
        type: "LlpCategory",
        label: `${part.partName} · ${part.partNumber}`,
        properties: {
          partNumber: part.partNumber,
          partName: part.partName,
          lifeLimitCycles: part.lifeLimitCycles,
          lifeLimitSource: "Engine Manual (Ch. 05 Airworthiness Limitations)",
        },
      });
      const llpId = `llp:${part.engineId}:${part.partNumber}`;
      addNode({
        id: llpId,
        type: "LifeLimitedPart",
        label: `${part.partName} · ${part.serialNumber}`,
        properties: {
          engineId: part.engineId,
          partNumber: part.partNumber,
          serialNumber: part.serialNumber,
          module: part.module,
          position: part.position,
          cyclesSinceNew: part.csn,
          remainingCycles: part.remainingCycles,
          lifeStatus: part.status,
        },
      });
      addEdge({
        id: `e:${part.engineId}:${part.partNumber}:conformsTo`,
        source: llpId,
        target: catId,
        label: "conformsTo",
      });
      addEdge({
        id: `e:${part.engineId}:${slug(part.module)}:${part.partNumber}:hasComponent`,
        source: `module:${part.engineId}:${slug(part.module)}`,
        target: llpId,
        label: "hasComponent",
      });

      // Piece parts under representative components, completing the
      // Engine → Module → Component → Piece-Part hierarchy.
      for (const pp of piecePartsForComponent(part.partNumber)) {
        const ppId = `piecepart:${part.engineId}:${pp.partNumber}`;
        addNode({
          id: ppId,
          type: "PiecePart",
          label: pp.name,
          properties: {
            engineId: part.engineId,
            name: pp.name,
            partNumber: pp.partNumber,
            quantity: pp.quantity,
            parentPartNumber: pp.parentPartNumber,
          },
        });
        addEdge({
          id: `e:${part.engineId}:${part.partNumber}:${pp.partNumber}:hasPiecePart`,
          source: llpId,
          target: ppId,
          label: "hasPiecePart",
        });
      }
    }
  }

  // Recommendation nodes and their traceability edges.
  for (const rec of recommendations) {
    const recId = `rec:${rec.id}`;
    addNode({
      id: recId,
      type: "MaintenanceRecommendation",
      label: `${rec.failureMode} (${rec.priority})`,
      properties: {
        engineId: rec.engineId,
        priority: rec.priority,
        status: rec.status,
        confidence: rec.confidence,
        workscopeLevel: rec.workscopeLevel,
      },
    });
    addEdge({
      id: `e:${rec.id}:appliesTo`,
      source: recId,
      target: `engine:${rec.engineId}`,
      label: "appliesTo",
    });
    if (nodeIds.has(`rule:${rec.ruleId}`)) {
      addEdge({
        id: `e:${rec.ruleId}:${rec.id}:generates`,
        source: `rule:${rec.ruleId}`,
        target: recId,
        label: "generates",
      });
    }
  }

  // TCN-tracked work-package tasks: MaintenanceTask instances spawned from an
  // approved recommendation, carrying their Task Control Number and status.
  for (const t of workPackageTasks) {
    const taskId = `tcn:${t.tcn}`;
    addNode({
      id: taskId,
      type: "MaintenanceTaskDefinition",
      label: `${t.tcn} · ${t.ataCode}`,
      properties: {
        engineId: t.engineId,
        tcn: t.tcn,
        status: t.status,
        ataCode: t.ataCode,
        s1000dCode: t.s1000dCode ?? null,
        skill: t.skill,
        module: t.module,
        sequence: t.sequence,
      },
    });
    if (nodeIds.has(`rec:${t.recommendationId}`)) {
      addEdge({
        id: `e:${t.recommendationId}:${t.tcn}:recommends`,
        source: `rec:${t.recommendationId}`,
        target: taskId,
        label: "recommends",
      });
    }
  }

  // Shop-visit exchange nodes: the dispatched TSR, its mandated compliance
  // directives, and (once acknowledged) the MRO's capacity commitment.
  for (const ex of exchanges) {
    const tsrId = `tsr:${ex.documentId}`;
    addNode({
      id: tsrId,
      type: "ServiceRequest",
      label: ex.documentId,
      properties: {
        engineId: ex.engineId,
        status: ex.status,
        mroProvider: ex.mroProvider,
        primaryReason: ex.request.workScope.primaryReason,
        targetTatDays: ex.targetTatDays,
      },
    });
    if (nodeIds.has(`rec:${ex.recommendationId}`)) {
      addEdge({
        id: `e:${ex.recommendationId}:${ex.documentId}:dispatchedAs`,
        source: `rec:${ex.recommendationId}`,
        target: tsrId,
        label: "dispatchedAs",
      });
    }
    if (nodeIds.has(`engine:${ex.engineId}`)) {
      addEdge({
        id: `e:${ex.documentId}:${ex.engineId}:concerns`,
        source: tsrId,
        target: `engine:${ex.engineId}`,
        label: "concerns",
      });
    }
    for (const dir of ex.request.workScope.complianceDirectives) {
      const cId = `compliance:${slug(dir.reference)}`;
      addNode({
        id: cId,
        type: "ComplianceDirective",
        label: dir.reference,
        properties: { reference: dir.reference, category: dir.category },
      });
      addEdge({
        id: `e:${ex.documentId}:${slug(dir.reference)}:mandates`,
        source: tsrId,
        target: cId,
        label: "mandates",
      });
    }
    if (ex.acknowledgement) {
      const commitId = `commitment:${ex.id}`;
      addNode({
        id: commitId,
        type: "MroCommitment",
        label: `${ex.mroProvider}${ex.shopOrder ? ` · ${ex.shopOrder}` : ""}`,
        properties: {
          engineId: ex.engineId,
          mroProvider: ex.mroProvider,
          shopOrder: ex.shopOrder,
          committedTatDays: ex.committedTatDays,
          tatDeviationDays: ex.tatDeviationDays,
          unscheduledCostCapUsd: ex.unscheduledCostCapUsd,
          inductionStatus: ex.acknowledgement.inductionStatus,
        },
      });
      addEdge({
        id: `e:${ex.documentId}:${ex.id}:acknowledgedBy`,
        source: tsrId,
        target: commitId,
        label: "acknowledgedBy",
      });
    }
  }

  return { nodes, edges };
}

/**
 * Superseded sensor-level diagnostic edges: the sensor/observation split moved
 * `evaluates` / `indicates` from the physical Sensor onto MeasurementObservation
 * nodes, but graph *merge* never deletes, so pre-split edges survive. Returns
 * the ids of sensor-level edges that have been replaced by an observation-level
 * edge in the SAME context — a rule's `evaluates` is stale only if that rule
 * now evaluates an observation, and a sensor's `indicates` to a failure mode is
 * stale only if an observation of that sensor's parameter now indicates that
 * same failure mode. Rules/parameters without projected observations keep
 * their sensor-level fallback edges so their diagnostic chain stays connected.
 */
export function supersededSensorEdgeIds(data: GraphData): string[] {
  const typeById = new Map(data.nodes.map((n) => [n.id, n.type]));
  const paramOfObs = new Map(
    data.nodes
      .filter((n) => n.type === "MeasurementObservation")
      .map((n) => [n.id, String(n.properties.parameter ?? "")]),
  );
  const codeOfSensor = new Map(
    data.nodes
      .filter((n) => n.type === "Sensor")
      .map((n) => [n.id, String(n.properties.code ?? "")]),
  );
  // Rules that evaluate at least one observation.
  const rulesWithObsEvaluates = new Set(
    data.edges
      .filter((e) => e.label === "evaluates" && paramOfObs.has(e.target))
      .map((e) => e.source),
  );
  // parameter → failure-mode targets indicated at observation level.
  const obsIndicated = new Set(
    data.edges
      .filter((e) => e.label === "indicates" && paramOfObs.has(e.source))
      .map((e) => `${paramOfObs.get(e.source)}→${e.target}`),
  );
  return data.edges
    .filter((e) => {
      if (e.label === "evaluates" && typeById.get(e.target) === "Sensor") {
        return rulesWithObsEvaluates.has(e.source);
      }
      if (e.label === "indicates" && typeById.get(e.source) === "Sensor") {
        return obsIndicated.has(`${codeOfSensor.get(e.source)}→${e.target}`);
      }
      return false;
    })
    .map((e) => e.id);
}

/** Filter a graph by ontology type and/or engine, expanding one hop to keep context. */
export function filterGraph(data: GraphData, filter?: GraphFilter): GraphData {
  let nodes = data.nodes;
  if (filter?.engineId) {
    const eid = filter.engineId;
    const seed = new Set(
      data.nodes
        .filter(
          (n) =>
            (n.type === "Engine" && n.properties.engineId === eid) ||
            n.properties.engineId === eid,
        )
        .map((n) => n.id),
    );
    // Expand one hop across edges to include connected global nodes.
    const keep = new Set(seed);
    for (const e of data.edges) {
      if (seed.has(e.source)) keep.add(e.target);
      if (seed.has(e.target)) keep.add(e.source);
    }
    nodes = data.nodes.filter((n) => keep.has(n.id));
  }
  if (filter?.type) {
    nodes = nodes.filter((n) => n.type === filter.type);
  }
  const keepIds = new Set(nodes.map((n) => n.id));
  const filteredEdges = data.edges.filter(
    (e) => keepIds.has(e.source) && keepIds.has(e.target),
  );
  return { nodes, edges: filteredEdges };
}

export function nodeCountByClass(data: GraphData): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const n of data.nodes) counts[n.type] = (counts[n.type] ?? 0) + 1;
  return counts;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
