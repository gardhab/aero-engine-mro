import React, { useMemo, useState } from 'react';
import { useGetGraph, useUpdateGraphNode, getGetGraphQueryKey } from '@workspace/api-client-react';
import {
  TextInput,
  Dropdown,
  Tile,
  Button,
  InlineNotification,
  SkeletonPlaceholder
} from '@carbon/react';
import { Save } from '@carbon/icons-react';
import ReactFlow, { Background, Controls, MiniMap, MarkerType, useNodesState, useEdgesState } from 'reactflow';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Node styling per ontology class. Lifecycle-event classes (ShopVisit,
 * WorkOrder, MaintenanceTaskExecution, MeasurementObservation,
 * ComplianceAssessment) share a warm palette so time-bound events read
 * distinctly from structural/design nodes.
 */
const NODE_STYLE: Record<string, { background: string; color: string; group: 'asset' | 'event' | 'compliance' | 'other' }> = {
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
};

const LEGEND: { label: string; types: string[]; color: string }[] = [
  { label: 'Engine / structure', types: ['Engine', 'EngineModule', 'Component'], color: '#0f62fe' },
  { label: 'Shop visit', types: ['ShopVisit'], color: '#ff832b' },
  { label: 'Work order', types: ['WorkOrder'], color: '#ffb784' },
  { label: 'Task execution', types: ['MaintenanceTaskExecution'], color: '#fff1e5' },
  { label: 'Measurement', types: ['MeasurementObservation'], color: '#fcf4d6' },
  { label: 'Directive', types: ['ComplianceDirective'], color: '#da1e28' },
  { label: 'Compliance assessment', types: ['ComplianceAssessment'], color: '#ffd7d9' },
  { label: 'Recommendation', types: ['MaintenanceRecommendation'], color: '#24a148' },
];

const TYPE_FILTER_OPTIONS = [
  'All types',
  'Engine',
  'ShopVisit',
  'WorkOrder',
  'MaintenanceTaskExecution',
  'MeasurementObservation',
  'ComplianceDirective',
  'ComplianceAssessment',
  'MaintenanceRecommendation',
  'ServiceRequest',
  'LifeLimitedPart',
];

export default function GraphExplorer() {
  const [engineFilter, setEngineFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('All types');

  // Use debounced value for query to avoid spamming
  const [debouncedFilter, setDebouncedFilter] = useState('');
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedFilter(engineFilter), 500);
    return () => clearTimeout(t);
  }, [engineFilter]);

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

  // Layout the graph using a simple grid or let react-flow handle it if coordinates are missing.
  // In a real app we'd use d3-force or dagre. We'll do a basic grid layout here.
  const { initialNodes, initialEdges } = useMemo(() => {
    if (!graphData) return { initialNodes: [], initialEdges: [] };

    // Group nodes by type for basic layout
    const types = Array.from(new Set(graphData.nodes.map(n => n.type)));
    const nodes = graphData.nodes.map((n, i) => {
      const typeIndex = types.indexOf(n.type);
      const nodesOfThisType = graphData.nodes.filter(x => x.type === n.type);
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
          fontFamily: 'IBM Plex Sans'
        }
      };
    });

    const edges = graphData.edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      animated: false,
      markerEnd: { type: MarkerType.ArrowClosed }
    }));

    return { initialNodes: nodes, initialEdges: edges };
  }, [graphData]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  React.useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const onNodeClick = (event: any, node: any) => {
    setSelectedNode(node.data.fullNode);
    setPropertiesEdit(JSON.parse(JSON.stringify(node.data.fullNode.properties)));
  };

  const handleSaveProperties = () => {
    if (!selectedNode) return;
    updateNode.mutate({ id: selectedNode.id, data: { properties: propertiesEdit } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetGraphQueryKey() });
        setSelectedNode(null);
      }
    });
  };

  return (
    <div className="page-container" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 4rem)' }}>
      <div className="flex justify-between items-end mb-4 shrink-0">
        <div>
          <h1 className="mb-1">Knowledge Graph Explorer</h1>
          <p>Explore instance data and relationships.</p>
        </div>
        <div className="flex gap-4 items-end">
          <div style={{ width: '260px' }}>
            <Dropdown
              id="type-filter"
              titleText="Filter by Node Type"
              label="All types"
              items={TYPE_FILTER_OPTIONS}
              selectedItem={typeFilter}
              onChange={({ selectedItem }) => setTypeFilter(selectedItem ?? 'All types')}
            />
          </div>
          <div style={{ width: '260px' }}>
            <TextInput
              id="engine-filter"
              labelText="Filter Subgraph by ESN"
              placeholder="e.g. ESN-1001"
              value={engineFilter}
              onChange={(e) => setEngineFilter(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="flex gap-4 items-center mb-2 shrink-0" style={{ flexWrap: 'wrap' }}>
        {LEGEND.map((item) => (
          <span key={item.label} className="flex gap-1 items-center" style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
            <span style={{ width: 12, height: 12, background: item.color, border: '1px solid #8d8d8d', borderRadius: 2, display: 'inline-block' }} />
            {item.label}
          </span>
        ))}
      </div>

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
                    value={String(propertiesEdit[key])}
                    onChange={(e) => setPropertiesEdit({...propertiesEdit, [key]: e.target.value})}
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
