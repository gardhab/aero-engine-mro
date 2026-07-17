import React, { useState } from 'react';
import { Link } from 'wouter';
import { useListExchanges, useGetExchange } from '@workspace/api-client-react';
import {
  Tile,
  Tag,
  DataTable,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  SkeletonPlaceholder,
  Modal,
  CodeSnippet,
  StructuredListWrapper,
  StructuredListHead,
  StructuredListRow,
  StructuredListCell,
  StructuredListBody,
} from '@carbon/react';

const STATUS_TAG: Record<string, 'gray' | 'blue' | 'teal' | 'purple' | 'green' | 'red'> = {
  recommended: 'gray',
  sent: 'blue',
  accepted: 'teal',
  in_work: 'purple',
  released: 'green',
  rejected: 'red',
};

const STATUS_LABEL: Record<string, string> = {
  recommended: 'Recommended',
  sent: 'Sent',
  accepted: 'Accepted',
  in_work: 'In Work',
  released: 'Released',
  rejected: 'Rejected',
};

const COMPLIANCE_TAG: Record<string, { type: 'green' | 'blue' | 'red' | 'gray' | 'cool-gray'; label: string }> = {
  compliant: { type: 'green', label: 'Compliant' },
  due: { type: 'blue', label: 'Due' },
  overdue: { type: 'red', label: 'Overdue' },
  not_applicable: { type: 'cool-gray', label: 'Not applicable' },
  pending_evidence: { type: 'gray', label: 'Pending evidence' },
};

function ExchangeDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: ex, isLoading } = useGetExchange(id);

  return (
    <Modal
      open
      passiveModal
      modalHeading={ex ? `Shop Visit — ${ex.documentId}` : 'Shop Visit'}
      onRequestClose={onClose}
      size="lg"
    >
      {isLoading || !ex ? (
        <SkeletonPlaceholder style={{ width: '100%', height: '300px' }} />
      ) : (
        <div>
          <div className="flex gap-2 items-center mb-4">
            <Tag type={STATUS_TAG[ex.status]}>{STATUS_LABEL[ex.status]}</Tag>
            <span>{ex.mroProvider}</span>
          </div>

          <StructuredListWrapper className="mb-4">
            <StructuredListHead>
              <StructuredListRow head>
                <StructuredListCell head>Field</StructuredListCell>
                <StructuredListCell head>Value</StructuredListCell>
              </StructuredListRow>
            </StructuredListHead>
            <StructuredListBody>
              <StructuredListRow>
                <StructuredListCell>Engine</StructuredListCell>
                <StructuredListCell>{ex.engineModel} • {ex.engineId} ({ex.tailNumber})</StructuredListCell>
              </StructuredListRow>
              <StructuredListRow>
                <StructuredListCell>Primary Reason</StructuredListCell>
                <StructuredListCell>{ex.request.workScope.primaryReason}</StructuredListCell>
              </StructuredListRow>
              <StructuredListRow>
                <StructuredListCell>Target TAT</StructuredListCell>
                <StructuredListCell>{ex.targetTatDays} days</StructuredListCell>
              </StructuredListRow>
              <StructuredListRow>
                <StructuredListCell>Committed TAT</StructuredListCell>
                <StructuredListCell>
                  {ex.committedTatDays != null ? `${ex.committedTatDays} days` : '—'}
                  {ex.tatDeviationDays != null && ex.tatDeviationDays !== 0 && (
                    <Tag type={ex.tatDeviationDays > 0 ? 'red' : 'green'} className="ml-2">
                      {ex.tatDeviationDays > 0 ? '+' : ''}{ex.tatDeviationDays}d vs target
                    </Tag>
                  )}
                </StructuredListCell>
              </StructuredListRow>
              <StructuredListRow>
                <StructuredListCell>Shop Order</StructuredListCell>
                <StructuredListCell>{ex.shopOrder || '—'}</StructuredListCell>
              </StructuredListRow>
              <StructuredListRow>
                <StructuredListCell>Unscheduled Cost Cap</StructuredListCell>
                <StructuredListCell>
                  {ex.unscheduledCostCapUsd != null ? `$${ex.unscheduledCostCapUsd.toLocaleString()}` : '—'}
                </StructuredListCell>
              </StructuredListRow>
              <StructuredListRow>
                <StructuredListCell>Recommendation</StructuredListCell>
                <StructuredListCell>
                  <Link href={`/recommendations/${ex.recommendationId}`}>{ex.recommendationId.slice(0, 8)}</Link>
                </StructuredListCell>
              </StructuredListRow>
            </StructuredListBody>
          </StructuredListWrapper>

          {ex.request.workScope.complianceDirectives.length > 0 && (
            <>
              <h4 className="mb-2">Mandated Compliance (ADs / SBs)</h4>
              <StructuredListWrapper className="mb-4">
                <StructuredListHead>
                  <StructuredListRow head>
                    <StructuredListCell head>Reference</StructuredListCell>
                    <StructuredListCell head>Category</StructuredListCell>
                    <StructuredListCell head>Description</StructuredListCell>
                    <StructuredListCell head>Feasibility</StructuredListCell>
                    <StructuredListCell head>Compliance</StructuredListCell>
                  </StructuredListRow>
                </StructuredListHead>
                <StructuredListBody>
                  {ex.request.workScope.complianceDirectives.map((c) => {
                    const fb = ex.acknowledgement?.feasibility.find((f) => f.reference === c.reference);
                    const assessment = ex.complianceAssessments?.find((a) => a.reference === c.reference);
                    const compliance = assessment ? COMPLIANCE_TAG[assessment.status] : undefined;
                    return (
                      <StructuredListRow key={c.reference}>
                        <StructuredListCell>{c.reference}</StructuredListCell>
                        <StructuredListCell>{c.category}</StructuredListCell>
                        <StructuredListCell>{c.description}</StructuredListCell>
                        <StructuredListCell>
                          {fb ? (
                            <Tag type={fb.feasible ? 'green' : 'red'}>
                              {fb.feasible ? 'Feasible' : 'Not feasible'}
                            </Tag>
                          ) : '—'}
                        </StructuredListCell>
                        <StructuredListCell>
                          {compliance ? (
                            <Tag type={compliance.type} title={assessment?.evidenceTcns.length ? `Evidence: ${assessment.evidenceTcns.join(', ')}` : undefined}>
                              {compliance.label}
                            </Tag>
                          ) : '—'}
                        </StructuredListCell>
                      </StructuredListRow>
                    );
                  })}
                </StructuredListBody>
              </StructuredListWrapper>
            </>
          )}

          <h4 className="mb-2">Engine Service Request (Spec 2000 TSR)</h4>
          <CodeSnippet type="multi" wrapText feedback="Copied">
            {ex.requestXml}
          </CodeSnippet>
        </div>
      )}
    </Modal>
  );
}

export default function ShopVisits() {
  const { data: exchanges = [], isLoading } = useListExchanges();
  const [openId, setOpenId] = useState<string | null>(null);

  if (isLoading) {
    return <div className="page-container"><SkeletonPlaceholder style={{ width: '100%', height: '400px' }} /></div>;
  }

  const inFlight = exchanges.filter((e) => ['sent', 'accepted', 'in_work'].includes(e.status)).length;
  const released = exchanges.filter((e) => e.status === 'released').length;
  const deviations = exchanges.filter((e) => (e.tatDeviationDays ?? 0) > 0).length;

  const headers = [
    { key: 'documentId', header: 'TSR / Document' },
    { key: 'engine', header: 'Engine' },
    { key: 'mroProvider', header: 'MRO Shop' },
    { key: 'status', header: 'Status' },
    { key: 'tat', header: 'TAT (target → committed)' },
    { key: 'shopOrder', header: 'Shop Order' },
    { key: 'sentAt', header: 'Sent' },
  ];

  const rows = exchanges.map((e) => ({
    id: e.id,
    documentId: e.documentId,
    engine: `${e.engineId} (${e.tailNumber})`,
    mroProvider: e.mroProvider,
    status: <Tag type={STATUS_TAG[e.status]}>{STATUS_LABEL[e.status]}</Tag>,
    tat: (
      <span>
        {e.targetTatDays}d
        {e.committedTatDays != null ? ` → ${e.committedTatDays}d` : ''}
        {e.tatDeviationDays != null && e.tatDeviationDays !== 0 && (
          <Tag type={e.tatDeviationDays > 0 ? 'red' : 'green'} size="sm" className="ml-2">
            {e.tatDeviationDays > 0 ? '+' : ''}{e.tatDeviationDays}d
          </Tag>
        )}
      </span>
    ),
    shopOrder: e.shopOrder || '—',
    sentAt: e.sentAt ? new Date(e.sentAt).toLocaleDateString() : '—',
  }));

  return (
    <div className="page-container">
      <h1 className="mb-1">Shop Visits</h1>
      <p className="mb-4">OEM ↔ MRO exchange: Spec 2000 service requests dispatched to external shops and their induction acceptances.</p>

      <div className="dashboard-grid mb-4">
        <div className="dashboard-col-4">
          <Tile>
            <div className="card-title">In Flight</div>
            <div className="card-value">{inFlight}</div>
          </Tile>
        </div>
        <div className="dashboard-col-4">
          <Tile>
            <div className="card-title">Released</div>
            <div className="card-value">{released}</div>
          </Tile>
        </div>
        <div className="dashboard-col-4">
          <Tile>
            <div className="card-title">TAT Deviations</div>
            <div className={`card-value ${deviations > 0 ? 'text-red-600' : ''}`}>{deviations}</div>
          </Tile>
        </div>
      </div>

      <h2 className="section-title">Exchange Register</h2>
      <DataTable rows={rows} headers={headers}>
        {({ rows, headers, getHeaderProps, getRowProps, getTableProps }) => (
          <TableContainer>
            <Table {...getTableProps()}>
              <TableHead>
                <TableRow>
                  {headers.map((header) => (
                    <TableHeader {...getHeaderProps({ header })}>
                      {header.header}
                    </TableHeader>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow><TableCell colSpan={headers.length}>No shop visits dispatched yet. Approve a recommendation and dispatch it to an MRO shop.</TableCell></TableRow>
                ) : rows.map((row) => (
                  <TableRow {...getRowProps({ row })} onClick={() => setOpenId(row.id)} style={{ cursor: 'pointer' }}>
                    {row.cells.map((cell) => (
                      <TableCell key={cell.id}>{cell.value}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DataTable>

      {openId && <ExchangeDetailModal id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
