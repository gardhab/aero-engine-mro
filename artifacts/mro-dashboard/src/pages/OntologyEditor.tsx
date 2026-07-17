import React, { useMemo, useState } from 'react';
import { useGetOntologyDraft, useValidateOntology, usePublishOntology, useCreateOntologyClass, getGetOntologyDraftQueryKey } from '@workspace/api-client-react';
import {
  Button,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Modal,
  TextInput,
  InlineNotification,
  Tile,
  StructuredListWrapper,
  StructuredListHead,
  StructuredListRow,
  StructuredListCell,
  StructuredListBody,
  Tag
} from '@carbon/react';
import { Play, CheckmarkOutline, Warning } from '@carbon/icons-react';
import ReactFlow, { Background, Controls, MiniMap, useNodesState, useEdgesState, Handle, Position, Panel } from 'reactflow';
import { useQueryClient } from '@tanstack/react-query';

// ---------- UML class-diagram rendering ----------

/** Top-down layout layers: physical hierarchy Engine → Module → Component → PiecePart reads vertically. */
const UML_LAYERS: Record<string, number> = {
  ServiceRequest: 0, MroCommitment: 0, ComplianceDirective: 0,
  Engine: 1, Recommendation: 1, Rule: 1,
  EngineModule: 2, Sensor: 2, FailureMode: 2, MaintenanceTask: 2,
  Component: 3, RegulatoryReference: 3,
  LifeLimitedPart: 4, PiecePart: 4,
};

/** UML association multiplicities [domain, range] per relationship id. */
const UML_MULTIPLICITY: Record<string, [string, string]> = {
  hasModule: ['1', '1..*'],
  hasComponent: ['1', '0..*'],
  hasPiecePart: ['1', '0..*'],
  monitoredBy: ['1', '1..*'],
  indicates: ['0..*', '0..*'],
  affects: ['0..*', '1..*'],
  detects: ['1', '1'],
  evaluates: ['0..*', '1'],
  generates: ['1', '0..*'],
  appliesTo: ['0..*', '1'],
  recommends: ['1', '1..*'],
  governedBy: ['0..*', '1..*'],
  dispatchedAs: ['1', '0..1'],
  concerns: ['0..*', '1'],
  mandates: ['1', '0..*'],
  acknowledgedBy: ['1', '0..1'],
};

const UML_NODE_WIDTH = 230;

interface UmlAttr { name: string; type: string }

function UmlClassNode({ data }: { data: { label: string; deprecated: boolean; attributes: UmlAttr[] } }) {
  const fg = data.deprecated ? '#8d8d8d' : '#161616';
  return (
    <div style={{
      border: `1.5px solid ${fg}`,
      background: data.deprecated ? '#f4f4f4' : '#ffffff',
      width: UML_NODE_WIDTH,
      fontFamily: 'IBM Plex Sans',
      fontSize: 12,
      color: fg,
    }}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div style={{ borderBottom: `1px solid ${fg}`, padding: '6px 8px', textAlign: 'center' }}>
        {data.deprecated && <div style={{ fontStyle: 'italic' }}>«deprecated»</div>}
        <strong>{data.label}</strong>
      </div>
      <div style={{ padding: '4px 8px', minHeight: 16 }}>
        {data.attributes.length === 0 && <span style={{ color: '#8d8d8d' }}>&nbsp;</span>}
        {data.attributes.map(a => (
          <div key={a.name} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            + {a.name}: {a.type}
          </div>
        ))}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

const umlNodeTypes = { umlClass: UmlClassNode };

/** Hollow-triangle (generalization) and open-arrow (association) UML markers. */
function UmlMarkerDefs() {
  return (
    <svg style={{ position: 'absolute', width: 0, height: 0 }}>
      <defs>
        <marker id="uml-generalization" viewBox="0 0 20 20" markerWidth="18" markerHeight="18" refX="18" refY="10" orient="auto-start-reverse">
          <path d="M2,2 L18,10 L2,18 Z" fill="#ffffff" stroke="#161616" strokeWidth="1.5" />
        </marker>
        <marker id="uml-association" viewBox="0 0 12 12" markerWidth="14" markerHeight="14" refX="10" refY="6" orient="auto-start-reverse">
          <path d="M2,2 L10,6 L2,10" fill="none" stroke="#525252" strokeWidth="1.5" />
        </marker>
      </defs>
    </svg>
  );
}

function UmlLegend() {
  const line = (marker: string, dashed = false) => (
    <svg width="70" height="14">
      <line x1="2" y1="7" x2="52" y2="7" stroke="#161616" strokeWidth="1.5" strokeDasharray={dashed ? '4 3' : undefined} />
      {marker === 'triangle'
        ? <path d="M52,2 L66,7 L52,12 Z" fill="#ffffff" stroke="#161616" strokeWidth="1.5" />
        : <path d="M54,2 L66,7 L54,12" fill="none" stroke="#161616" strokeWidth="1.5" />}
    </svg>
  );
  return (
    <div style={{ background: '#ffffff', border: '1px solid #8d8d8d', padding: '8px 12px', fontSize: 12, fontFamily: 'IBM Plex Sans' }}>
      <strong>UML notation</strong>
      <div className="flex items-center gap-2" style={{ marginTop: 4 }}>{line('arrow')} <span>association (label, multiplicities)</span></div>
      <div className="flex items-center gap-2">{line('triangle')} <span>generalization (inherits from)</span></div>
      <div style={{ marginTop: 4, color: '#525252' }}>Class box: name + attribute compartment</div>
    </div>
  );
}

export default function OntologyEditor() {
  const { data: ontology, isLoading } = useGetOntologyDraft();
  const validateMut = useValidateOntology();
  const publishMut = usePublishOntology();
  const createClassMut = useCreateOntologyClass();
  const queryClient = useQueryClient();

  const [validationResult, setValidationResult] = useState<any>(null);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishNote, setPublishNote] = useState('');
  const [showAddClass, setShowAddClass] = useState(false);
  const [newClass, setNewClass] = useState({ label: '', description: '' });

  // Map ontology to a UML class diagram: layered top-down layout so the
  // physical hierarchy Engine → Module → Component → PiecePart reads vertically.
  const { initialNodes, initialEdges } = useMemo(() => {
    if (!ontology) return { initialNodes: [], initialEdges: [] };

    const layerOf = (id: string) => UML_LAYERS[id] ?? 5;
    const byLayer = new Map<number, typeof ontology.classes>();
    for (const c of ontology.classes) {
      const l = layerOf(c.id);
      byLayer.set(l, [...(byLayer.get(l) ?? []), c]);
    }
    const positions = new Map<string, { x: number; y: number }>();
    for (const [layer, classes] of byLayer) {
      classes.forEach((c, i) => {
        positions.set(c.id, { x: i * (UML_NODE_WIDTH + 70), y: layer * 240 });
      });
    }

    const nodes = ontology.classes.map(c => ({
      id: c.id,
      type: 'umlClass',
      position: positions.get(c.id) ?? { x: 0, y: 0 },
      data: {
        label: c.label,
        deprecated: c.deprecated,
        attributes: (c.attributes ?? []).map(a => ({ name: a.name, type: a.type })),
      },
    }));

    // Associations: solid directed lines with role label + multiplicities.
    const classIds = new Set(ontology.classes.map(c => c.id));
    const edges = ontology.relationships
      .filter(r => classIds.has(r.domain) && classIds.has(r.range))
      .map(r => {
        const [m0, m1] = UML_MULTIPLICITY[r.id] ?? ['1', '0..*'];
        return {
          id: r.id,
          source: r.domain,
          target: r.range,
          label: `${r.label}  ${m0} → ${m1}`,
          type: 'smoothstep',
          style: { stroke: '#525252', strokeWidth: 1.2 },
          labelStyle: { fontFamily: 'IBM Plex Sans', fontSize: 11, fill: '#161616' },
          labelBgStyle: { fill: '#ffffff', fillOpacity: 0.9 },
          markerEnd: 'url(#uml-association)',
        };
      });

    // Generalizations: hollow-triangle arrows from subclass to superclass.
    for (const c of ontology.classes) {
      if (c.parentClass && classIds.has(c.parentClass)) {
        edges.push({
          id: `gen:${c.id}`,
          source: c.id,
          target: c.parentClass,
          label: '',
          type: 'straight',
          style: { stroke: '#161616', strokeWidth: 1.5 },
          labelStyle: { fontFamily: 'IBM Plex Sans', fontSize: 11, fill: '#161616' },
          labelBgStyle: { fill: '#ffffff', fillOpacity: 0.9 },
          markerEnd: 'url(#uml-generalization)',
        });
      }
    }

    return { initialNodes: nodes, initialEdges: edges };
  }, [ontology]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync graph when data changes
  React.useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const handleValidate = () => {
    validateMut.mutate(undefined, {
      onSuccess: (res) => setValidationResult(res)
    });
  };

  const handlePublish = () => {
    publishMut.mutate({ data: { note: publishNote, author: 'Admin' } }, {
      onSuccess: () => {
        setShowPublishModal(false);
        setPublishNote('');
        queryClient.invalidateQueries({ queryKey: getGetOntologyDraftQueryKey() });
        setValidationResult(null);
      }
    });
  };

  const handleAddClass = () => {
    createClassMut.mutate({ data: newClass }, {
      onSuccess: () => {
        setShowAddClass(false);
        setNewClass({ label: '', description: '' });
        queryClient.invalidateQueries({ queryKey: getGetOntologyDraftQueryKey() });
      }
    });
  };

  if (isLoading) return <div className="page-container">Loading...</div>;

  return (
    <div className="page-container" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 4rem)' }}>
      <div className="flex justify-between items-center mb-4 shrink-0">
        <div>
          <h1 className="mb-1">Domain Ontology Editor</h1>
          <p>Draft Version: {ontology?.version}</p>
        </div>
        <div className="flex gap-2">
          <Button kind="secondary" renderIcon={Play} onClick={handleValidate} disabled={validateMut.isPending}>
            Validate Model
          </Button>
          <Button kind="primary" renderIcon={CheckmarkOutline} onClick={() => setShowPublishModal(true)}>
            Publish Draft
          </Button>
        </div>
      </div>

      {validationResult && (
        <InlineNotification
          kind={validationResult.valid ? 'success' : 'error'}
          title={validationResult.valid ? 'Validation Passed' : 'Validation Failed'}
          subtitle={
            validationResult.issues.length > 0 
              ? validationResult.issues.map((i: any) => i.message).join(' | ') 
              : 'No issues found.'
          }
          onCloseButtonClick={() => setValidationResult(null)}
          className="shrink-0 mb-4"
        />
      )}

      <Tabs className="flex-1 flex flex-col min-h-0">
        <TabList aria-label="Ontology views">
          <Tab>Visual Map</Tab>
          <Tab>Classes ({ontology?.classes.length || 0})</Tab>
        </TabList>
        <TabPanels className="flex-1 min-h-0 relative">
          <TabPanel className="h-full p-0 pt-4">
            <div className="react-flow-wrapper h-full">
              <UmlMarkerDefs />
              <ReactFlow 
                nodes={nodes} 
                edges={edges} 
                nodeTypes={umlNodeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                fitView
              >
                <Background color="#ccc" gap={16} />
                <Controls />
                <MiniMap />
                <Panel position="top-right"><UmlLegend /></Panel>
              </ReactFlow>
            </div>
          </TabPanel>
          <TabPanel className="h-full overflow-y-auto pt-4">
            <div className="flex justify-end mb-4">
              <Button size="sm" onClick={() => setShowAddClass(true)}>Add Class</Button>
            </div>
            <StructuredListWrapper>
              <StructuredListHead>
                <StructuredListRow head>
                  <StructuredListCell head>Label</StructuredListCell>
                  <StructuredListCell head>Description</StructuredListCell>
                  <StructuredListCell head>Status</StructuredListCell>
                  <StructuredListCell head>Instances</StructuredListCell>
                  <StructuredListCell head>Rules</StructuredListCell>
                </StructuredListRow>
              </StructuredListHead>
              <StructuredListBody>
                {ontology?.classes.map(c => (
                  <StructuredListRow key={c.id}>
                    <StructuredListCell><strong>{c.label}</strong> <br/><small>{c.id}</small></StructuredListCell>
                    <StructuredListCell>{c.description}</StructuredListCell>
                    <StructuredListCell>
                      {c.deprecated ? <Tag type="gray">Deprecated</Tag> : <Tag type="green">Active</Tag>}
                    </StructuredListCell>
                    <StructuredListCell>{c.instanceCount}</StructuredListCell>
                    <StructuredListCell>{c.ruleCount}</StructuredListCell>
                  </StructuredListRow>
                ))}
              </StructuredListBody>
            </StructuredListWrapper>
          </TabPanel>
        </TabPanels>
      </Tabs>

      <Modal
        open={showPublishModal}
        modalHeading="Publish Ontology Version"
        primaryButtonText="Publish"
        secondaryButtonText="Cancel"
        onRequestClose={() => setShowPublishModal(false)}
        onRequestSubmit={handlePublish}
        primaryButtonDisabled={!publishNote}
      >
        <p className="mb-4">This will make the draft ontology active for the reasoning engine.</p>
        <TextInput
          id="publish-note"
          labelText="Release Note (required)"
          value={publishNote}
          onChange={(e) => setPublishNote(e.target.value)}
        />
        {validationResult?.valid === false && (
          <div className="mt-4 text-red-600 flex items-center gap-2">
            <Warning /> Warning: Draft has validation errors.
          </div>
        )}
      </Modal>

      <Modal
        open={showAddClass}
        modalHeading="Add Ontology Class"
        primaryButtonText="Create"
        secondaryButtonText="Cancel"
        onRequestClose={() => setShowAddClass(false)}
        onRequestSubmit={handleAddClass}
        primaryButtonDisabled={!newClass.label}
      >
        <TextInput
          id="class-label"
          labelText="Class Label"
          value={newClass.label}
          onChange={(e) => setNewClass({...newClass, label: e.target.value})}
          className="mb-4"
        />
        <TextInput
          id="class-desc"
          labelText="Description"
          value={newClass.description}
          onChange={(e) => setNewClass({...newClass, description: e.target.value})}
        />
      </Modal>
    </div>
  );
}
