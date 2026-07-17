import React, { useMemo, useState } from 'react';
import { useGetOntologyDraft, useValidateOntology, usePublishOntology, useCreateOntologyClass, useCreateOntologyRelationship, useUpdateOntologyRelationship, getGetOntologyDraftQueryKey } from '@workspace/api-client-react';
import {
  Button,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Modal,
  TextInput,
  Select,
  SelectItem,
  InlineNotification,
  Tile,
  StructuredListWrapper,
  StructuredListHead,
  StructuredListRow,
  StructuredListCell,
  StructuredListBody,
  Tag
} from '@carbon/react';
import { Play, CheckmarkOutline, Warning, Edit } from '@carbon/icons-react';
import ReactFlow, { Background, Controls, MiniMap, useNodesState, useEdgesState, Handle, Position, Panel, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from 'reactflow';
import { useQueryClient } from '@tanstack/react-query';

// ---------- UML class-diagram rendering ----------

/** Top-down layout layers: physical hierarchy Engine → Module → Component → PiecePart reads vertically. */
const UML_LAYERS: Record<string, number> = {
  ServiceRequest: 0, MroCommitment: 0, ComplianceDirective: 0, EngineModel: 0, Aircraft: 0,
  Engine: 1, MaintenanceRecommendation: 1, DiagnosticRuleDefinition: 1, EngineInstallation: 1,
  EngineModule: 2, Sensor: 2, FailureMode: 2, MaintenanceTaskDefinition: 2, MeasurementObservation: 2,
  Component: 3, RegulatoryRequirement: 3, LlpCategory: 3,
  LifeLimitedPart: 4, PiecePart: 4,
};

const UML_NODE_WIDTH = 230;

const EDGE_LABEL_STYLE: React.CSSProperties = {
  position: 'absolute',
  fontFamily: 'IBM Plex Sans',
  fontSize: 11,
  color: '#161616',
  background: 'rgba(255,255,255,0.9)',
  padding: '0 3px',
  pointerEvents: 'none',
};

/**
 * UML association edge: directional verb name at the midpoint and the stored
 * multiplicities rendered at both ends (near the source and target classes).
 */
function UmlAssociationEdge({
  sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data,
}: EdgeProps<{ label: string; sourceMultiplicity: string; targetMultiplicity: string }>) {
  const [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  // Offset the end labels a little along the edge so they clear the class boxes.
  const srcLX = sourceX + (targetX - sourceX) * 0.06 + 10;
  const srcLY = sourceY + (targetY - sourceY) * 0.06 + 4;
  const tgtLX = targetX + (sourceX - targetX) * 0.06 + 10;
  const tgtLY = targetY + (sourceY - targetY) * 0.06 - 4;
  return (
    <>
      <path d={path} fill="none" stroke="#525252" strokeWidth={1.2} markerEnd="url(#uml-association)" />
      <EdgeLabelRenderer>
        <div style={{ ...EDGE_LABEL_STYLE, transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, fontStyle: 'italic' }}>
          {data?.label} ▸
        </div>
        <div style={{ ...EDGE_LABEL_STYLE, transform: `translate(-50%, -50%) translate(${srcLX}px, ${srcLY}px)` }}>
          {data?.sourceMultiplicity}
        </div>
        <div style={{ ...EDGE_LABEL_STYLE, transform: `translate(-50%, -50%) translate(${tgtLX}px, ${tgtLY}px)` }}>
          {data?.targetMultiplicity}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const umlEdgeTypes = { umlAssociation: UmlAssociationEdge };

interface UmlAttr { name: string; type: string; enumValues?: string[] | null }

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
          <div
            key={a.name}
            style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
            title={a.enumValues?.length ? `«enumeration» ${a.enumValues.join(' | ')}` : undefined}
          >
            + {a.name}: {a.enumValues?.length ? '«enum»' : a.type}
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
  const createRelMut = useCreateOntologyRelationship();
  const updateRelMut = useUpdateOntologyRelationship();
  const [showAddRel, setShowAddRel] = useState(false);
  const [newRel, setNewRel] = useState({ label: '', domain: '', range: '', sourceMultiplicity: '1', targetMultiplicity: '0..*', description: '' });
  const [editRel, setEditRel] = useState<null | { id: string; label: string; sourceMultiplicity: string; targetMultiplicity: string; description: string }>(null);
  const [relError, setRelError] = useState<string | null>(null);

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
        attributes: (c.attributes ?? []).map(a => ({ name: a.name, type: a.type, enumValues: (a as any).enumValues })),
      },
    }));

    // Associations: solid directed lines with the stored directional name and
    // both-end multiplicities rendered by the custom edge.
    const classIds = new Set(ontology.classes.map(c => c.id));
    const edges: any[] = ontology.relationships
      .filter(r => classIds.has(r.domain) && classIds.has(r.range))
      .map(r => ({
        id: r.id,
        source: r.domain,
        target: r.range,
        type: 'umlAssociation',
        data: {
          label: r.label,
          sourceMultiplicity: r.sourceMultiplicity,
          targetMultiplicity: r.targetMultiplicity,
        },
      }));

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

  const refreshDraft = () => queryClient.invalidateQueries({ queryKey: getGetOntologyDraftQueryKey() });

  const handleAddRel = () => {
    setRelError(null);
    createRelMut.mutate({ data: newRel }, {
      onSuccess: () => {
        setShowAddRel(false);
        setNewRel({ label: '', domain: '', range: '', sourceMultiplicity: '1', targetMultiplicity: '0..*', description: '' });
        refreshDraft();
      },
      onError: (e: any) => setRelError(e?.response?.data?.error ?? 'Failed to create relationship'),
    });
  };

  const handleUpdateRel = () => {
    if (!editRel) return;
    setRelError(null);
    const { id, ...data } = editRel;
    updateRelMut.mutate({ id, data }, {
      onSuccess: () => { setEditRel(null); refreshDraft(); },
      onError: (e: any) => setRelError(e?.response?.data?.error ?? 'Failed to update relationship'),
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
          <Tab>Relationships ({ontology?.relationships.length || 0})</Tab>
        </TabList>
        <TabPanels className="flex-1 min-h-0 relative">
          <TabPanel className="h-full p-0 pt-4">
            <div className="react-flow-wrapper h-full">
              <UmlMarkerDefs />
              <ReactFlow 
                nodes={nodes} 
                edges={edges} 
                nodeTypes={umlNodeTypes}
                edgeTypes={umlEdgeTypes}
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
          <TabPanel className="h-full overflow-y-auto pt-4">
            <div className="flex justify-end mb-4">
              <Button size="sm" onClick={() => { setRelError(null); setShowAddRel(true); }}>Add Relationship</Button>
            </div>
            <StructuredListWrapper>
              <StructuredListHead>
                <StructuredListRow head>
                  <StructuredListCell head>Name</StructuredListCell>
                  <StructuredListCell head>Association</StructuredListCell>
                  <StructuredListCell head>Multiplicity</StructuredListCell>
                  <StructuredListCell head>Description</StructuredListCell>
                  <StructuredListCell head></StructuredListCell>
                </StructuredListRow>
              </StructuredListHead>
              <StructuredListBody>
                {ontology?.relationships.map(r => (
                  <StructuredListRow key={r.id}>
                    <StructuredListCell><strong>{r.label}</strong><br /><small>{r.id}</small></StructuredListCell>
                    <StructuredListCell>{r.domain} → {r.range}</StructuredListCell>
                    <StructuredListCell><code>{r.sourceMultiplicity}</code> → <code>{r.targetMultiplicity}</code></StructuredListCell>
                    <StructuredListCell>{r.description}</StructuredListCell>
                    <StructuredListCell>
                      <Button
                        kind="ghost" size="sm" renderIcon={Edit} iconDescription="Edit"
                        onClick={() => { setRelError(null); setEditRel({ id: r.id, label: r.label, sourceMultiplicity: r.sourceMultiplicity, targetMultiplicity: r.targetMultiplicity, description: r.description ?? '' }); }}
                      >Edit</Button>
                    </StructuredListCell>
                  </StructuredListRow>
                ))}
              </StructuredListBody>
            </StructuredListWrapper>
          </TabPanel>
        </TabPanels>
      </Tabs>

      <Modal
        open={showAddRel}
        modalHeading="Add Ontology Relationship"
        primaryButtonText="Create"
        secondaryButtonText="Cancel"
        onRequestClose={() => setShowAddRel(false)}
        onRequestSubmit={handleAddRel}
        primaryButtonDisabled={!newRel.label || !newRel.domain || !newRel.range || createRelMut.isPending}
      >
        {relError && <InlineNotification kind="error" title="Error" subtitle={relError} lowContrast className="mb-4" />}
        <TextInput id="rel-label" labelText="Directional name (verb, read source → target)" placeholder="e.g. recommends"
          value={newRel.label} onChange={(e) => setNewRel({ ...newRel, label: e.target.value })} className="mb-4" />
        <div className="flex gap-4 mb-4">
          <Select id="rel-domain" labelText="Source class" value={newRel.domain} onChange={(e) => setNewRel({ ...newRel, domain: e.target.value })}>
            <SelectItem value="" text="Choose…" />
            {ontology?.classes.map(c => <SelectItem key={c.id} value={c.id} text={c.label} />)}
          </Select>
          <Select id="rel-range" labelText="Target class" value={newRel.range} onChange={(e) => setNewRel({ ...newRel, range: e.target.value })}>
            <SelectItem value="" text="Choose…" />
            {ontology?.classes.map(c => <SelectItem key={c.id} value={c.id} text={c.label} />)}
          </Select>
        </div>
        <div className="flex gap-4 mb-4">
          <TextInput id="rel-src-mult" labelText="Source-end multiplicity" placeholder="1, 0..1, 0..*, 1..*"
            value={newRel.sourceMultiplicity} onChange={(e) => setNewRel({ ...newRel, sourceMultiplicity: e.target.value })} />
          <TextInput id="rel-tgt-mult" labelText="Target-end multiplicity" placeholder="1, 0..1, 0..*, 1..*"
            value={newRel.targetMultiplicity} onChange={(e) => setNewRel({ ...newRel, targetMultiplicity: e.target.value })} />
        </div>
        <TextInput id="rel-desc" labelText="Description"
          value={newRel.description} onChange={(e) => setNewRel({ ...newRel, description: e.target.value })} />
      </Modal>

      <Modal
        open={editRel !== null}
        modalHeading={`Edit Relationship "${editRel?.id ?? ''}"`}
        primaryButtonText="Save"
        secondaryButtonText="Cancel"
        onRequestClose={() => setEditRel(null)}
        onRequestSubmit={handleUpdateRel}
        primaryButtonDisabled={!editRel?.label || updateRelMut.isPending}
      >
        {relError && <InlineNotification kind="error" title="Error" subtitle={relError} lowContrast className="mb-4" />}
        {editRel && (
          <>
            <TextInput id="edit-rel-label" labelText="Directional name (verb, read source → target)"
              value={editRel.label} onChange={(e) => setEditRel({ ...editRel, label: e.target.value })} className="mb-4" />
            <div className="flex gap-4 mb-4">
              <TextInput id="edit-rel-src-mult" labelText="Source-end multiplicity"
                value={editRel.sourceMultiplicity} onChange={(e) => setEditRel({ ...editRel, sourceMultiplicity: e.target.value })} />
              <TextInput id="edit-rel-tgt-mult" labelText="Target-end multiplicity"
                value={editRel.targetMultiplicity} onChange={(e) => setEditRel({ ...editRel, targetMultiplicity: e.target.value })} />
            </div>
            <TextInput id="edit-rel-desc" labelText="Description"
              value={editRel.description} onChange={(e) => setEditRel({ ...editRel, description: e.target.value })} />
          </>
        )}
      </Modal>

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
