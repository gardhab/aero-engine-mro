import type {
  Engine,
  GraphData,
  GraphEdge,
  GraphNode,
  Recommendation,
  Rule,
} from "../types.js";
import { PARAMETERS, PARAMETER_BY_CODE } from "../data/parameters.js";

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

  // Global failure-mode and rule nodes.
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
      type: "Rule",
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

  // Per-engine nodes: engine, its modules, and monitoredBy links.
  const modulesUsed = Array.from(new Set(PARAMETERS.map((p) => p.module)));
  for (const eng of engines) {
    addNode({
      id: `engine:${eng.esn}`,
      type: "Engine",
      label: `${eng.model} · ${eng.esn}`,
      properties: {
        engineId: eng.esn,
        esn: eng.esn,
        model: eng.model,
        tailNumber: eng.tailNumber,
        status: eng.status,
        healthScore: eng.healthScore,
        csn: eng.csn,
      },
    });
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
  }

  // Recommendation nodes and their traceability edges.
  for (const rec of recommendations) {
    const recId = `rec:${rec.id}`;
    addNode({
      id: recId,
      type: "Recommendation",
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

  return { nodes, edges };
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
