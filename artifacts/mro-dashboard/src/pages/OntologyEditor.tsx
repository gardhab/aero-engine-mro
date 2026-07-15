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
import ReactFlow, { Background, Controls, MiniMap, useNodesState, useEdgesState, MarkerType } from 'reactflow';
import { useQueryClient } from '@tanstack/react-query';

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

  // Map ontology to react-flow
  const { initialNodes, initialEdges } = useMemo(() => {
    if (!ontology) return { initialNodes: [], initialEdges: [] };
    
    const nodes = ontology.classes.map((c, i) => ({
      id: c.id,
      position: { x: (i % 4) * 250, y: Math.floor(i / 4) * 150 },
      data: { label: c.label },
      style: { 
        background: c.deprecated ? '#f4f4f4' : '#ffffff', 
        border: '1px solid #8d8d8d', 
        borderRadius: '4px',
        padding: '10px',
        width: 180,
        color: c.deprecated ? '#8d8d8d' : '#161616',
        fontFamily: 'IBM Plex Sans'
      }
    }));

    const edges = ontology.relationships.map(r => ({
      id: r.id,
      source: r.domain,
      target: r.range,
      label: r.label,
      type: 'smoothstep',
      animated: true,
      markerEnd: { type: MarkerType.ArrowClosed }
    }));

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
              <ReactFlow 
                nodes={nodes} 
                edges={edges} 
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                fitView
              >
                <Background color="#ccc" gap={16} />
                <Controls />
                <MiniMap />
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
