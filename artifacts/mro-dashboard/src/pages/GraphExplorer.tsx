import React, { useMemo, useState } from 'react';
import { useGetGraph, useUpdateGraphNode, getGetGraphQueryKey } from '@workspace/api-client-react';
import {
  TextInput,
  Dropdown,
  Tile,
  Button,
  InlineNotification,
  SkeletonPlaceholder,
  Tag,
} from '@carbon/react';
import { Save } from '@carbon/icons-react';
import ReactFlow, { Background, Controls, MiniMap, MarkerType, useNodesState, useEdgesState } from 'reactflow';
import { useQueryClient } from '@tanstack/react-query';

// Minimal graph types (mirrors mro-core — kept local to avoid a cross-package dep)
interface GraphNode { id: string; type: string; label: string; properties: Record<string, unknown> }
interface GraphEdge { id: string; source: string; target: string; label: string }

/**
 * Node styling per ontology class. Lifecycle-event classes (ShopVisit,
 * WorkOrder, MaintenanceTaskExecution, MeasurementObservation,
 * ComplianceAssessment) share a warm palette so time-bound events read
 * distinctly from structural/design nodes.
 */
const NODE_STYLE: Record<string, { background: string; color: string; group: 'asset' | 'event' | 'compliance' | 'isa95' | 'other' }> = {
  Engine: { background: '#0f62fe', color: '#fff', group: 'asset' },
  EngineModule: { background: '#d0e2ff', color: '#161616', group: 'asset' },
  Component: { background: '#8a3ffc', color: '#fff', group: 'asset' },
  LifeLimitedPart: { background: '#8a3ffc', color: '#fff', group: 'asset' },
  PiecePart: { background: '#e8daff', color: '#161616', group: 'asset' },
  // Lifecycle events
  ShopVisit: { background: '#ff832b', color: '#161616', group: 'event' },
  WorkOrder: { background: '#ffb784', color: '#161616', group: 'event' },
  MaintenanceTaskExecution: { background: '#fff1e5', color: '#161616', group: 'event' },
  MeasurementObservation: { background: '#fcf4d6', color: '#161616', group: 'event' },
  // Compliance
  ComplianceDirective: { background: '#da1e28', color: '#fff', group: 'compliance' },
  ComplianceAssessment: { background: '#ffd7d9', color: '#161616', group: 'compliance' },
  MaintenanceRecommendation: { background: '#24a148', color: '#fff', group: 'other' },
  // ISA-95 Equipment Hierarchy & Execution
  WorkCenter: { background: '#005d5d', color: '#fff', group: 'isa95' },
  OperationSegment: { background: '#9ef0f0', color: '#161616', group: 'isa95' },
  PersonnelClass: { background: '#007d79', color: '#fff', group: 'isa95' },
};

const LEGEND: { label: string; color: string }[] = [
  { label: 'Engine / structure', color: '#0f62fe' },
  { label: 'Shop visit', color: '#ff832b' },
  { label: 'Work order', color: '#ffb784' },
  { label: 'Task execution', color: '#fff1e5' },
  { label: 'Measurement', color: '#fcf4d6' },
  { label: 'Directive', color: '#da1e28' },
  { label: 'Compliance assessment', color: '#ffd7d9' },
  { label: 'Recommendation', color: '#24a148' },
  { label: 'Work Centre (ISA-95)', color: '#005d5d' },
  { label: 'Operation Segment (ISA-95)', color: '#9ef0f0' },
  { label: 'Personnel Class (ISA-95)', color: '#007d79' },
];

// ── Grouped type-filter items ─────────────────────────────────────────────────
// Each entry is either a selectable type string or a group-header marker.
// Group headers are prefixed with "§" so we can identify them in onChange.
const HEADER_PREFIX = '§';

interface TypeFilterItem {
  id: string;   // the displayed/stored value (or header label prefixed with §)
  label: string; // human-readable label shown in the list
  isHeader: boolean;
}

function buildTypeFilterItems(): TypeFilterItem[] {
  const groups: { label: string; types: string[] }[] = [
    {
      label: 'Asset',
      types: ['Engine', 'EngineModule', 'Component', 'LifeLimitedPart', 'PiecePart',
              'Aircraft', 'EngineInstallation', 'EngineModel', 'LlpCategory'],
    },
    {
      label: 'Lifecycle',
      types: ['ShopVisit', 'WorkOrder', 'MaintenanceTaskExecution',
              'MeasurementObservation', 'ServiceRequest', 'MaintenanceRecommendation'],
    },
    {
      label: 'Compliance',
      types: ['ComplianceDirective', 'ComplianceAssessment'],
    },
    {
      label: 'ISA-95',
      types: ['WorkCenter', 'OperationSegment', 'PersonnelClass'],
    },
  ];
  const items: TypeFilterItem[] = [
    { id: 'All types', label: 'All types', isHeader: false },
  ];
  for (const g of groups) {
    items.push({ id: `${HEADER_PREFIX}${g.label}`, label: `── ${g.label} ──`, isHeader: true });
    for (const t of g.types) {
      items.push({ id: t, label: t, isHeader: false });
    }
  }
  return items;
}

const TYPE_FILTER_ITEMS = buildTypeFilterItems();

// ── Depth options ─────────────────────────────────────────────────────────────
const DEPTH_OPTIONS = ['1-hop', '2-hop', 'full'] as const;
type DepthOption = typeof DEPTH_OPTIONS[number];

const MAX_NODES_WARN = 200;

/**
 * BFS-limit a graph: starting from `engineNodeId`, collect all node ids reachable
 * within `maxHops` hops. Pass Infinity for unlimited depth.
 */
function bfsLimit(
  nodes: GraphNode[],
  edges: GraphEdge[],
  engineNodeId: string,
  maxHops: number,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  if (!nodes.find(n => n.id === engineNodeId)) {
    // Engine node not in set — return as-is (type-only filter or no ESN)
    return { nodes, edges };
  }

  const adjacency = new Map<string, string[]>();
  for (const e of edges) {
    const s = adjacency.get(e.source) ?? [];
    s.push(e.target);
    adjacency.set(e.source, s);
    const t = adjacency.get(e.target) ?? [];
    t.push(e.source);
    adjacency.set(e.target, t);
  }

  const visited = new Map<string, number>(); // id → depth at which first visited
  const queue: Array<{ id: string; depth: number }> = [{ id: engineNodeId, depth: 0 }];
  visited.set(engineNodeId, 0);

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (depth >= maxHops) continue;
    for (const neighbour of adjacency.get(id) ?? []) {
      if (!visited.has(neighbour)) {
        visited.set(neighbour, depth + 1);
        queue.push({ id: neighbour, depth: depth + 1 });
      }
    }
  }

  const keepIds = new Set(visited.keys());
  const filteredNodes = nodes.filter(n => keepIds.has(n.id));
  const filteredEdges = edges.filter(e => keepIds.has(e.source) && keepIds.has(e.target));
  return { nodes: filteredNodes, edges: filteredEdges };
}

export default function GraphExplorer() {
  const [engineFilter, setEngineFilter] = useState<string>('');
  const [typeFilterItem, setTypeFilterItem] = useState<TypeFilterItem>(TYPE_FILTER_ITEMS[0]);
  const [depth, setDepth] = useState<DepthOption>('2-hop');

  // Debounce ESN input
  const [debouncedFilter, setDebouncedFilter] = useState('');
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedFilter(engineFilter), 500);
    return () => clearTimeout(t);
  }, [engineFilter]);

  const typeFilter = typeFilterItem.isHeader ? 'All types' : typeFilterItem.id;

  const { data: graphData, isLoading } = useGetGraph(
    debouncedFilter || typeFilter !== 'All types'
      ? {
          ...(debouncedFilter ? { engineId: debouncedFilter } : {}),
          ...(typeFilter !== 'All types' ? { type: typeFilter } : {}),
        }
      : undefined
  );

  const updateNode = useUpdateGraphNode();
  const queryClient = useQueryClient();

  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [propertiesEdit, setPropertiesEdit] = useState<any>({});

  // Show max-nodes warning when the graph is large and no filter is active
  const totalNodes = graphData?.nodes.length ?? 0;
  const noFilterActive = !debouncedFilter && typeFilter === 'All types';
  const showMaxNodesWarning = noFilterActive && totalNodes > MAX_NODES_WARN;

  // Depth-limited graph (only applied when ESN filter is active)
  const depthLimitedGraph = useMemo(() => {
    if (!graphData) return { nodes: [], edges: [] };
    if (!debouncedFilter) return graphData;

    const engineNodeId = `engine:${debouncedFilter}`;
    const maxHops = depth === '1-hop' ? 1 : depth === '2-hop' ? 2 : Infinity;
    return bfsLimit(graphData.nodes, graphData.edges, engineNodeId, maxHops);
  }, [graphData, debouncedFilter, depth]);

  // Layout: group nodes by type for a readable grid
  const { initialNodes, initialEdges } = useMemo(() => {
    const { nodes: visibleNodes, edges: visibleEdges } = depthLimitedGraph;
    if (!visibleNodes.length) return { initialNodes: [], initialEdges: [] };

    const types = Array.from(new Set(visibleNodes.map(n => n.type)));
    const nodes = visibleNodes.map((n) => {
      const typeIndex = types.indexOf(n.type);
      const nodesOfThisType = visibleNodes.filter(x => x.type === n.type);
      const myIndexInType = nodesOfThisType.findIndex(x => x.id === n.id);

      const styleDef = NODE_STYLE[n.type];
      return {
        id: n.id,
        position: { x: typeIndex * 300, y: myIndexInType * 100 },
        data: { label: `${n.label}\n(${n.type})`, fullNode: n },
        style: {
          background: styleDef?.background ?? '#ffffff',
          color: styleDef?.color ?? '#161616',
          border: '1px solid #8d8d8d',
          borderRadius: '2px',
          padding: '10px',
          width: 200,
          fontFamily: 'IBM Plex Sans',
        },
      };
    });

    const edges = visibleEdges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      animated: false,
      markerEnd: { type: MarkerType.ArrowClosed },
    }));

    return { initialNodes: nodes, initialEdges: edges };
  }, [depthLimitedGraph]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  React.useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const onNodeClick = (_event: any, node: any) => {
    setSelectedNode(node.data.fullNode);
    setPropertiesEdit(JSON.parse(JSON.stringify(node.data.fullNode.properties)));
  };

  const handleSaveProperties = () => {
    if (!selectedNode) return;
    updateNode.mutate({ id: selectedNode.id, data: { properties: propertiesEdit } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetGraphQueryKey() });
        setSelectedNode(null);
      },
    });
  };

  return (
    <div className="page-container" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 4rem)' }}>
      {/* Header row */}
      <div className="flex justify-between items-end mb-3 shrink-0">
        <div>
          <h1 className="mb-1">Knowledge Graph Explorer</h1>
          <p>Explore instance data and relationships.</p>
        </div>
        <div className="flex gap-3 items-end" style={{ flexWrap: 'wrap' }}>
          {/* Grouped type filter */}
          <div style={{ width: '220px' }}>
            <Dropdown
              id="type-filter"
              titleText="Node Type"
              label="All types"
              items={TYPE_FILTER_ITEMS}
              selectedItem={typeFilterItem}
              itemToString={(item) => (item ? (item.isHeader ? item.label : item.id) : 'All types')}
              itemToElement={(item) =>
                item.isHeader ? (
                  <span
                    style={{
                      display: 'block',
                      padding: '0.25rem 0',
                      fontSize: '0.6875rem',
                      fontWeight: 600,
                      letterSpacing: '0.08em',
                      color: 'var(--cds-text-helper)',
                      textTransform: 'uppercase',
                      pointerEvents: 'none',
                      userSelect: 'none',
                    }}
                  >
                    {item.label}
                  </span>
                ) : (
                  <span style={{ paddingLeft: item.id === 'All types' ? 0 : '0.75rem' }}>
                    {item.id}
                  </span>
                )
              }
              onChange={({ selectedItem }) => {
                if (!selectedItem || selectedItem.isHeader) return; // ignore header clicks
                setTypeFilterItem(selectedItem);
              }}
            />
          </div>

          {/* ESN filter */}
          <div style={{ width: '220px' }}>
            <TextInput
              id="engine-filter"
              labelText="Filter by ESN"
              placeholder="e.g. ESN-1001"
              value={engineFilter}
              onChange={(e) => setEngineFilter(e.target.value)}
            />
          </div>

          {/* Depth dropdown — only meaningful when ESN is active */}
          <div style={{ width: '160px' }}>
            <Dropdown
              id="depth-filter"
              titleText="Depth"
              label="2-hop"
              items={[...DEPTH_OPTIONS]}
              selectedItem={depth}
              onChange={({ selectedItem }) => {
                if (selectedItem) setDepth(selectedItem as DepthOption);
              }}
              disabled={!debouncedFilter}
            />
          </div>
        </div>
      </div>

      {/* Max-nodes warning */}
      {showMaxNodesWarning && (
        <div className="shrink-0 mb-2">
          <InlineNotification
            kind="warning"
            title={`Large graph: ${totalNodes} nodes`}
            subtitle="Apply an ESN or node-type filter to focus the view and reduce edge crossings."
            lowContrast
            hideCloseButton
          />
        </div>
      )}

      {/* Node count badge when filter is active */}
      {!noFilterActive && graphData && (
        <div className="shrink-0 mb-2 flex gap-2 items-center">
          <Tag type="blue" size="sm">{nodes.length} nodes</Tag>
          <Tag type="gray" size="sm">{edges.length} edges</Tag>
          {debouncedFilter && (
            <span style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
              Depth: <strong>{depth}</strong> — change to reveal more connections
            </span>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex gap-4 items-center mb-2 shrink-0" style={{ flexWrap: 'wrap' }}>
        {LEGEND.map((item) => (
          <span key={item.label} className="flex gap-1 items-center" style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
            <span style={{ width: 12, height: 12, background: item.color, border: '1px solid #8d8d8d', borderRadius: 2, display: 'inline-block' }} />
            {item.label}
          </span>
        ))}
      </div>

      {/* Graph canvas + property panel */}
      <div className="flex-1 flex gap-4 min-h-0">
        <div className="flex-1 react-flow-wrapper h-full">
          {isLoading ? (
            <SkeletonPlaceholder style={{ width: '100%', height: '100%' }} />
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              fitView
            >
              <Background color="#ccc" gap={16} />
              <Controls />
              <MiniMap />
            </ReactFlow>
          )}
        </div>

        {selectedNode && (
          <div style={{ width: '350px' }} className="shrink-0 overflow-y-auto">
            <Tile>
              <h3 className="mb-1">{selectedNode.label}</h3>
              <p className="mb-4 text-sm" style={{ color: 'var(--cds-text-secondary)' }}>Type: {selectedNode.type}</p>

              <h4 className="mb-2">Properties</h4>
              <div className="flex-col gap-2 mb-4">
                {Object.keys(propertiesEdit).map(key => (
                  <TextInput
                    key={key}
                    id={`prop-${key}`}
                    labelText={key}
                    value={String(propertiesEdit[key] ?? '')}
                    onChange={(e) => setPropertiesEdit({ ...propertiesEdit, [key]: e.target.value })}
                  />
                ))}
                {Object.keys(propertiesEdit).length === 0 && <p>No properties.</p>}
              </div>

              <Button
                renderIcon={Save}
                onClick={handleSaveProperties}
                disabled={updateNode.isPending}
                className="w-full"
              >
                Save Changes
              </Button>
            </Tile>
          </div>
        )}
      </div>
    </div>
  );
}
