import React, { useState } from 'react';
import { useRoute, Link } from 'wouter';
import {
  useGetRecommendation,
  useApproveRecommendation,
  useRejectRecommendation,
  usePushRecommendationToSap,
  useDispatchRecommendation,
  useGetRecommendationExchange,
  useIngestAcknowledgement,
  useAdvanceExchange,
  getGetRecommendationQueryKey,
  getGetRecommendationExchangeQueryKey
} from '@workspace/api-client-react';
import {
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Tile,
  Tag,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  SkeletonPlaceholder,
  Modal,
  TextInput,
  TextArea,
  StructuredListWrapper,
  StructuredListHead,
  StructuredListRow,
  StructuredListCell,
  StructuredListBody,
  ToastNotification,
  ProgressBar
} from '@carbon/react';
import { Checkmark, Close, Send, Printer } from '@carbon/icons-react';
import { useQueryClient } from '@tanstack/react-query';

export default function RecommendationDetail() {
  const [, params] = useRoute('/recommendations/:id');
  const id = params?.id || '';
  const queryClient = useQueryClient();

  const { data: rec, isLoading } = useGetRecommendation(id, { query: { enabled: !!id, queryKey: getGetRecommendationQueryKey(id) } });

  const approveMut = useApproveRecommendation();
  const rejectMut = useRejectRecommendation();
  const pushMut = usePushRecommendationToSap();
  const dispatchMut = useDispatchRecommendation();
  const ingestMut = useIngestAcknowledgement();
  const advanceMut = useAdvanceExchange();

  const { data: exchange } = useGetRecommendationExchange(id, {
    query: {
      enabled: !!id,
      queryKey: getGetRecommendationExchangeQueryKey(id),
      retry: false,
      throwOnError: false,
    },
  });

  const [reviewNotes, setReviewNotes] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showAckModal, setShowAckModal] = useState(false);
  const [ackDocument, setAckDocument] = useState('');
  const [notification, setNotification] = useState<{ kind: any, title: string, subtitle: string } | null>(null);

  const invalidateExchange = () => {
    queryClient.invalidateQueries({ queryKey: getGetRecommendationExchangeQueryKey(id) });
  };

  if (isLoading || !rec) {
    return <div className="page-container"><SkeletonPlaceholder style={{ width: '100%', height: '400px' }} /></div>;
  }

  const handleApprove = () => {
    approveMut.mutate({ id, data: { notes: reviewNotes, reviewedBy: 'Current User' } }, {
      onSuccess: () => {
        setNotification({ kind: 'success', title: 'Approved', subtitle: 'Recommendation approved.' });
        queryClient.invalidateQueries({ queryKey: getGetRecommendationQueryKey(id) });
      }
    });
  };

  const handleReject = () => {
    rejectMut.mutate({ id, data: { notes: reviewNotes, reviewedBy: 'Current User' } }, {
      onSuccess: () => {
        setShowRejectModal(false);
        setNotification({ kind: 'info', title: 'Rejected', subtitle: 'Recommendation rejected.' });
        queryClient.invalidateQueries({ queryKey: getGetRecommendationQueryKey(id) });
      }
    });
  };

  const handlePush = () => {
    pushMut.mutate({ id }, {
      onSuccess: (data) => {
        setNotification({ kind: 'success', title: 'Pushed to SAP', subtitle: `Notification ${data.sapNotificationNumber || 'created'}` });
        queryClient.invalidateQueries({ queryKey: getGetRecommendationQueryKey(id) });
      },
      onError: (err) => {
        setNotification({ kind: 'error', title: 'SAP Push Failed', subtitle: err.error || 'Unknown error' });
      }
    });
  };

  const handleDispatch = () => {
    dispatchMut.mutate({ id }, {
      onSuccess: (data) => {
        setNotification({ kind: 'success', title: 'Dispatched to MRO', subtitle: `Service request ${data.documentId} sent to ${data.mroProvider}.` });
        invalidateExchange();
      },
      onError: (err) => {
        setNotification({ kind: 'error', title: 'Dispatch Failed', subtitle: (err as any)?.data?.error || 'Unknown error' });
      }
    });
  };

  const handleIngest = () => {
    ingestMut.mutate({ id: exchange!.id, data: { document: ackDocument, format: 'auto' } }, {
      onSuccess: (data) => {
        setShowAckModal(false);
        setAckDocument('');
        setNotification({
          kind: data.status === 'accepted' ? 'success' : 'warning',
          title: data.status === 'accepted' ? 'Induction Accepted' : 'Induction Rejected',
          subtitle: data.status === 'accepted'
            ? `Committed ${data.committedTatDays}d TAT (${(data.tatDeviationDays ?? 0) >= 0 ? '+' : ''}${data.tatDeviationDays}d vs target).`
            : 'The MRO shop rejected the induction request.',
        });
        invalidateExchange();
      },
      onError: (err: any) => {
        const issues = err?.data?.issues as { field?: string; message: string }[] | undefined;
        setNotification({
          kind: 'error',
          title: 'Acknowledgement Rejected',
          subtitle: issues?.length ? issues.map((i) => i.message).join(' ') : (err?.data?.error || 'Validation failed'),
        });
      }
    });
  };

  const handleAdvance = (status: 'in_work' | 'released') => {
    advanceMut.mutate({ id: exchange!.id, data: { status } }, {
      onSuccess: () => {
        setNotification({ kind: 'success', title: 'Shop Visit Updated', subtitle: `Status advanced to ${status.replace('_', ' ')}.` });
        invalidateExchange();
      },
      onError: (err) => {
        setNotification({ kind: 'error', title: 'Update Failed', subtitle: (err as any)?.data?.error || 'Unknown error' });
      }
    });
  };

  const handlePrint = () => {
    window.print();
  };

  const canDispatch = (rec.status === 'approved' || rec.status === 'pushed') && !exchange;
  const EXCHANGE_TAG: Record<string, any> = {
    recommended: 'gray', sent: 'blue', accepted: 'teal', in_work: 'purple', released: 'green', rejected: 'red',
  };
  const EXCHANGE_LABEL: Record<string, string> = {
    recommended: 'Recommended', sent: 'Sent', accepted: 'Accepted', in_work: 'In Work', released: 'Released', rejected: 'Rejected',
  };

  return (
    <div className="page-container">
      {notification && (
        <div className="no-print" style={{ position: 'fixed', top: '4rem', right: '1rem', zIndex: 9999 }}>
          <ToastNotification 
            kind={notification.kind} 
            title={notification.title} 
            subtitle={notification.subtitle}
            onClose={() => setNotification(null)}
            timeout={5000}
          />
        </div>
      )}

      <Breadcrumb className="mb-2 no-print">
        <BreadcrumbItem><Link href="/recommendations">Recommendations</Link></BreadcrumbItem>
        <BreadcrumbItem isCurrentPage>{id.slice(0, 8)}</BreadcrumbItem>
      </Breadcrumb>

      <div className="flex justify-between items-start mb-4">
        <div>
          <h1 className="mb-1">Work Recommendation: {rec.component}</h1>
          <p className="text-lg">Engine: <Link href={`/engines/${rec.engineId}`}>{rec.engineModel} • {rec.engineId}</Link> | Tail: {rec.tailNumber}</p>
        </div>
        <div className="flex gap-2 items-center no-print">
          <Tag size="lg" type={
            rec.status === 'pending' ? 'blue' :
            rec.status === 'approved' ? 'cyan' :
            rec.status === 'rejected' ? 'red' :
            rec.status === 'pushed' ? 'green' : 'magenta'
          }>
            {rec.status.toUpperCase()}
          </Tag>
          {rec.status === 'pending' && (
            <>
              <Button kind="danger--tertiary" renderIcon={Close} onClick={() => setShowRejectModal(true)} disabled={approveMut.isPending || rejectMut.isPending}>Reject</Button>
              <Button kind="primary" renderIcon={Checkmark} onClick={handleApprove} disabled={approveMut.isPending || rejectMut.isPending}>Approve</Button>
            </>
          )}
          {rec.status === 'approved' && (
            <Button kind="primary" renderIcon={Send} onClick={handlePush} disabled={pushMut.isPending}>Push to SAP</Button>
          )}
          {canDispatch && (
            <Button kind="tertiary" renderIcon={Send} onClick={handleDispatch} disabled={dispatchMut.isPending}>Dispatch to MRO</Button>
          )}
          <Button kind="ghost" renderIcon={Printer} hasIconOnly iconDescription="Print Task Card" onClick={handlePrint} />
        </div>
      </div>

      <div className="dashboard-grid mb-4">
        <div className="dashboard-col-3">
          <Tile>
            <div className="card-title">Priority</div>
            <div className={`card-value priority-${rec.priority}`}>{rec.priority.toUpperCase()}</div>
          </Tile>
        </div>
        <div className="dashboard-col-3">
          <Tile>
            <div className="card-title">Severity Level</div>
            <ProgressBar label="" value={rec.severity * 100} />
            <div className="mt-1">{rec.severity.toFixed(2)}</div>
          </Tile>
        </div>
        <div className="dashboard-col-3">
          <Tile>
            <div className="card-title">Confidence</div>
            <ProgressBar label="" value={rec.confidence * 100} helperText="Rule Engine Assessment" />
            <div className="mt-1">{(rec.confidence * 100).toFixed(0)}%</div>
          </Tile>
        </div>
        <div className="dashboard-col-3">
          <Tile>
            <div className="card-title">Est. Duration</div>
            <div className="card-value">{rec.estimatedDurationHours} hrs</div>
            <div className="card-title mt-1">Turnaround: {rec.turnaroundDays} days</div>
          </Tile>
        </div>
      </div>

      <Tile className="mb-4">
        <h3 className="mb-2">Fault Description</h3>
        <p className="mb-2 text-lg">{rec.faultDescription}</p>
        <p className="mb-1"><strong>Failure Mode:</strong> {rec.failureMode}</p>
        <p className="mb-1"><strong>Workscope Level:</strong> {rec.workscopeLevel}</p>
        <p className="mb-1"><strong>Affected Modules:</strong> {rec.affectedModules.join(', ')}</p>
        {rec.sapNotificationNumber && (
          <p className="mt-2 text-green-600"><strong>SAP Notification:</strong> {rec.sapNotificationNumber}</p>
        )}
      </Tile>

      {exchange && (
        <Tile className="mb-4">
          <div className="flex justify-between items-start mb-2">
            <div>
              <h3 className="mb-1">MRO Shop Visit</h3>
              <p><strong>{exchange.documentId}</strong> → {exchange.mroProvider}</p>
            </div>
            <div className="flex gap-2 items-center no-print">
              <Tag size="lg" type={EXCHANGE_TAG[exchange.status]}>{EXCHANGE_LABEL[exchange.status]}</Tag>
              {exchange.status === 'sent' && (
                <Button kind="primary" size="sm" onClick={() => setShowAckModal(true)} disabled={ingestMut.isPending}>
                  Ingest Acceptance
                </Button>
              )}
              {exchange.status === 'accepted' && (
                <Button kind="tertiary" size="sm" onClick={() => handleAdvance('in_work')} disabled={advanceMut.isPending}>
                  Mark In Work
                </Button>
              )}
              {exchange.status === 'in_work' && (
                <Button kind="tertiary" size="sm" onClick={() => handleAdvance('released')} disabled={advanceMut.isPending}>
                  Mark Released
                </Button>
              )}
            </div>
          </div>
          <div className="dashboard-grid">
            <div className="dashboard-col-3">
              <div className="card-title">Target TAT</div>
              <div>{exchange.targetTatDays} days</div>
            </div>
            <div className="dashboard-col-3">
              <div className="card-title">Committed TAT</div>
              <div>
                {exchange.committedTatDays != null ? `${exchange.committedTatDays} days` : '—'}
                {exchange.tatDeviationDays != null && exchange.tatDeviationDays !== 0 && (
                  <Tag type={exchange.tatDeviationDays > 0 ? 'red' : 'green'} size="sm" className="ml-2">
                    {exchange.tatDeviationDays > 0 ? '+' : ''}{exchange.tatDeviationDays}d
                  </Tag>
                )}
              </div>
            </div>
            <div className="dashboard-col-3">
              <div className="card-title">Shop Order</div>
              <div>{exchange.shopOrder || '—'}</div>
            </div>
            <div className="dashboard-col-3">
              <div className="card-title">Unscheduled Cost Cap</div>
              <div>{exchange.unscheduledCostCapUsd != null ? `${exchange.unscheduledCostCapUsd.toLocaleString()}` : '—'}</div>
            </div>
          </div>
          <p className="mt-3 no-print"><Link href="/exchanges">View all shop visits →</Link></p>
        </Tile>
      )}

      <Tabs>
        <TabList aria-label="Recommendation Details">
          <Tab>Traceability Evidence</Tab>
          <Tab>Maintenance Tasks</Tab>
          <Tab>Parts & Regulations</Tab>
        </TabList>
        <TabPanels>
          <TabPanel>
            <div className="mt-4">
              <h3 className="mb-2">Rule Triggered</h3>
              <Tile className="mb-4">
                <p><strong>Rule Name:</strong> {rec.ruleName}</p>
                <p><strong>Rule ID:</strong> {rec.ruleId}</p>
              </Tile>
              
              <h3 className="mb-2">Sensor Evidence</h3>
              <StructuredListWrapper>
                <StructuredListHead>
                  <StructuredListRow head>
                    <StructuredListCell head>Parameter</StructuredListCell>
                    <StructuredListCell head>Value</StructuredListCell>
                    <StructuredListCell head>Threshold</StructuredListCell>
                    <StructuredListCell head>Cycle</StructuredListCell>
                    <StructuredListCell head>Description</StructuredListCell>
                  </StructuredListRow>
                </StructuredListHead>
                <StructuredListBody>
                  {rec.evidence.map((e, idx) => (
                    <StructuredListRow key={idx}>
                      <StructuredListCell>{e.label} ({e.parameter})</StructuredListCell>
                      <StructuredListCell className="font-bold">{e.value} {e.unit}</StructuredListCell>
                      <StructuredListCell>{e.threshold ? `${e.threshold} ${e.unit}` : '-'}</StructuredListCell>
                      <StructuredListCell>{e.cycle}</StructuredListCell>
                      <StructuredListCell>{e.description}</StructuredListCell>
                    </StructuredListRow>
                  ))}
                </StructuredListBody>
              </StructuredListWrapper>
            </div>
          </TabPanel>

          <TabPanel>
            <div className="mt-4">
              <h3 className="mb-2">Required Skills</h3>
              <div className="mb-4">
                {rec.requiredSkills.map(s => <Tag type="outline" key={s}>{s}</Tag>)}
              </div>

              <h3 className="mb-2">Task Cards</h3>
              <StructuredListWrapper>
                <StructuredListHead>
                  <StructuredListRow head>
                    <StructuredListCell head>ATA Code</StructuredListCell>
                    <StructuredListCell head>S1000D Code</StructuredListCell>
                    <StructuredListCell head>Description</StructuredListCell>
                    <StructuredListCell head>Skill</StructuredListCell>
                    <StructuredListCell head>Est. Hours</StructuredListCell>
                  </StructuredListRow>
                </StructuredListHead>
                <StructuredListBody>
                  {rec.tasks.map((t, idx) => (
                    <StructuredListRow key={idx}>
                      <StructuredListCell>{t.ataCode}</StructuredListCell>
                      <StructuredListCell>{t.s1000dCode || '-'}</StructuredListCell>
                      <StructuredListCell>{t.description}</StructuredListCell>
                      <StructuredListCell>{t.skill}</StructuredListCell>
                      <StructuredListCell>{t.estimatedHours}</StructuredListCell>
                    </StructuredListRow>
                  ))}
                </StructuredListBody>
              </StructuredListWrapper>
            </div>
          </TabPanel>

          <TabPanel>
            <div className="mt-4">
              <h3 className="mb-2">Life Limited Parts to Inspect/Replace</h3>
              {rec.lifeLimitedParts && rec.lifeLimitedParts.length > 0 ? (
                <StructuredListWrapper className="mb-4">
                  <StructuredListHead>
                    <StructuredListRow head>
                      <StructuredListCell head>Part Number</StructuredListCell>
                      <StructuredListCell head>Description</StructuredListCell>
                      <StructuredListCell head>Cycles Remaining</StructuredListCell>
                    </StructuredListRow>
                  </StructuredListHead>
                  <StructuredListBody>
                    {rec.lifeLimitedParts.map((p, idx) => (
                      <StructuredListRow key={idx}>
                        <StructuredListCell>{p.partNumber}</StructuredListCell>
                        <StructuredListCell>{p.description}</StructuredListCell>
                        <StructuredListCell>{p.cyclesRemaining ?? 'N/A'}</StructuredListCell>
                      </StructuredListRow>
                    ))}
                  </StructuredListBody>
                </StructuredListWrapper>
              ) : (
                <p className="mb-4">No LLPs identified for this recommendation.</p>
              )}

              <h3 className="mb-2">Regulatory References</h3>
              <div className="flex flex-col gap-1">
                {rec.regulatoryRefs.map((ref, i) => (
                  <div key={i}>• {ref}</div>
                ))}
              </div>
            </div>
          </TabPanel>
        </TabPanels>
      </Tabs>

      <Modal
        open={showRejectModal}
        modalHeading="Reject Recommendation"
        primaryButtonText="Confirm Reject"
        secondaryButtonText="Cancel"
        onRequestClose={() => setShowRejectModal(false)}
        onRequestSubmit={handleReject}
        danger
      >
        <p className="mb-4">Are you sure you want to reject this recommendation? This will remove it from the active work queue.</p>
        <TextInput
          id="reject-reason"
          labelText="Reason for rejection (required)"
          value={reviewNotes}
          onChange={(e) => setReviewNotes(e.target.value)}
          placeholder="e.g. False positive, manual inspection cleared..."
        />
      </Modal>

      <Modal
        open={showAckModal}
        modalHeading="Ingest MRO Induction Acceptance"
        primaryButtonText={ingestMut.isPending ? 'Validating...' : 'Ingest & Validate'}
        secondaryButtonText="Cancel"
        primaryButtonDisabled={!ackDocument.trim() || ingestMut.isPending}
        onRequestClose={() => setShowAckModal(false)}
        onRequestSubmit={handleIngest}
        size="lg"
      >
        <p className="mb-4">
          Paste the MRO shop's Induction Acceptance document (JSON or Spec 2000 XML). It will be strictly
          validated against the dispatched service request {exchange ? exchange.documentId : ''} before the
          shop visit advances.
        </p>
        <TextArea
          id="ack-document"
          labelText="Acceptance document (JSON or XML)"
          rows={12}
          value={ackDocument}
          onChange={(e) => setAckDocument(e.target.value)}
          placeholder='{ "documentId": "...", "associatedRequestId": "...", "inductionStatus": "accepted", ... }'
        />
      </Modal>
    </div>
  );
}
