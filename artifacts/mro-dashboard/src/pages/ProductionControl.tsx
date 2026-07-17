import React from 'react';
import { Link } from 'wouter';
import { useGetProductionControl } from '@workspace/api-client-react';
import {
  Tile,
  SkeletonPlaceholder,
  StructuredListWrapper,
  StructuredListHead,
  StructuredListRow,
  StructuredListCell,
  StructuredListBody,
  Tag,
  InlineNotification
} from '@carbon/react';

const STATUS_LABEL: Record<string, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  awaiting_parts: 'Awaiting Parts',
  awaiting_inspection: 'Awaiting Inspection',
  complete: 'Complete',
};

function fmtPct(v: number | null | undefined) {
  return v == null ? '—' : `${v.toFixed(1)}%`;
}
function fmtDays(v: number | null | undefined) {
  return v == null ? '—' : `${v.toFixed(1)} d`;
}
function fmtHours(h: number) {
  return h >= 48 ? `${(h / 24).toFixed(1)} d` : `${h.toFixed(1)} h`;
}
function fmtDate(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleDateString() : '—';
}

interface KpiTileProps { title: string; value: string; note?: string; good?: boolean | null }
function KpiTile({ title, value, note, good }: KpiTileProps) {
  return (
    <Tile className="card-tile">
      <div className="card-title">{title}</div>
      <div className="card-value" style={good == null ? undefined : { color: good ? 'var(--cds-support-success, #24a148)' : 'var(--cds-support-error, #da1e28)' }}>{value}</div>
      {note && <div style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>{note}</div>}
    </Tile>
  );
}

// Static TAT value tree: which lever each KPI pulls on.
const VALUE_TREE = [
  {
    driver: 'Reduce Waiting',
    detail: 'Queue time between operations dominates TAT — engines wait far longer than they are worked on.',
    kpis: ['Queue Time % of TAT', 'Parts Availability'],
  },
  {
    driver: 'Reduce Processing',
    detail: 'Value-added time on critical-path TCNs sets the floor for turnaround.',
    kpis: ['Total TAT'],
  },
  {
    driver: 'Reduce Rework',
    detail: 'Work done right the first time avoids repeat inspection loops.',
    kpis: ['Right First Time'],
  },
  {
    driver: 'Improve Planning',
    detail: 'Realistic schedules and controlled WIP keep flow predictable.',
    kpis: ['Schedule Adherence', 'WIP', 'On-Time Delivery'],
  },
];

export default function ProductionControlPage() {
  const { data, isLoading } = useGetProductionControl();

  if (isLoading || !data) {
    return (
      <div className="page-container">
        <h1 className="mb-4">Production Control</h1>
        <SkeletonPlaceholder style={{ width: '100%', height: '400px' }} />
      </div>
    );
  }

  const { kpis, engines, bottlenecks } = data;

  return (
    <div className="page-container">
      <div className="flex justify-between items-center mb-4">
        <h1>Production Control</h1>
        <span style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
          Computed from TCN work-package data · as of {new Date(data.asOf).toLocaleString()}
        </span>
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-col-2"><KpiTile title="Total TAT (avg)" value={fmtDays(kpis.avgTatDays)} note="Induction to delivery" /></div>
        <div className="dashboard-col-2"><KpiTile title="Queue Time % of TAT" value={fmtPct(kpis.queueTimePctOfTat)} note="Waiting, not working" good={kpis.queueTimePctOfTat != null ? kpis.queueTimePctOfTat < 50 : null} /></div>
        <div className="dashboard-col-2"><KpiTile title="Schedule Adherence" value={fmtPct(kpis.scheduleAdherencePct)} note="WIP predicted on plan" good={kpis.scheduleAdherencePct != null ? kpis.scheduleAdherencePct >= 80 : null} /></div>
        <div className="dashboard-col-2"><KpiTile title="Parts Availability" value={fmtPct(kpis.partsAvailabilityPct)} note="Open TCNs not held for parts" good={kpis.partsAvailabilityPct != null ? kpis.partsAvailabilityPct >= 90 : null} /></div>
        <div className="dashboard-col-2"><KpiTile title="WIP" value={String(kpis.wipCount)} note="Engines in shop" /></div>
        <div className="dashboard-col-2"><KpiTile title="On-Time Delivery" value={fmtPct(kpis.onTimeDeliveryPct)} note="Delivered within planned TAT" good={kpis.onTimeDeliveryPct != null ? kpis.onTimeDeliveryPct >= 80 : null} /></div>
      </div>

      {bottlenecks.length > 0 && (
        <>
          <h2 className="section-title">Bottleneck Alerts</h2>
          {bottlenecks.map(b => (
            <InlineNotification
              key={b.tcn}
              kind="warning"
              lowContrast
              hideCloseButton
              title={`${b.tcn} · ${STATUS_LABEL[b.status] ?? b.status}`}
              subtitle={`${b.engineId}: "${b.description}" waiting ${fmtHours(b.waitHours)} and blocking ${b.blockedTcns.join(', ') || 'no downstream TCNs'}.`}
              style={{ maxWidth: '100%', marginBottom: '0.5rem' }}
            />
          ))}
        </>
      )}

      <h2 className="section-title">Engine Flow Board</h2>
      <StructuredListWrapper>
        <StructuredListHead>
          <StructuredListRow head>
            <StructuredListCell head>Engine</StructuredListCell>
            <StructuredListCell head>Work Package</StructuredListCell>
            <StructuredListCell head>Current Operation</StructuredListCell>
            <StructuredListCell head>Time in Op</StructuredListCell>
            <StructuredListCell head>Queue Time</StructuredListCell>
            <StructuredListCell head>Value-Added</StructuredListCell>
            <StructuredListCell head>Predicted Completion</StructuredListCell>
            <StructuredListCell head>Critical Path</StructuredListCell>
          </StructuredListRow>
        </StructuredListHead>
        <StructuredListBody>
          {engines.map(row => (
            <StructuredListRow key={row.workPackageId}>
              <StructuredListCell>
                <Link href={`/engines/${row.engineId}`}>{row.engineId}</Link>
              </StructuredListCell>
              <StructuredListCell>{row.failureMode}</StructuredListCell>
              <StructuredListCell>
                {row.complete ? (
                  <Tag type="green">Delivered</Tag>
                ) : (
                  <>
                    <strong>{row.currentTcn}</strong> {row.currentOperation}
                    <div>
                      <Tag size="sm" type={row.currentStatus === 'awaiting_parts' || row.currentStatus === 'awaiting_inspection' ? 'red' : row.currentStatus === 'in_progress' ? 'blue' : 'cool-gray'}>
                        {STATUS_LABEL[row.currentStatus ?? ''] ?? row.currentStatus}
                      </Tag>
                    </div>
                  </>
                )}
              </StructuredListCell>
              <StructuredListCell>{row.complete ? '—' : fmtHours(row.timeInOperationHours)}</StructuredListCell>
              <StructuredListCell>{fmtHours(row.queueTimeHours)}</StructuredListCell>
              <StructuredListCell>{fmtHours(row.valueAddedHours)}</StructuredListCell>
              <StructuredListCell>
                {fmtDate(row.predictedCompletion)}
                {row.onSchedule != null && (
                  <div><Tag size="sm" type={row.onSchedule ? 'green' : 'red'}>{row.onSchedule ? 'ON PLAN' : `LATE vs ${fmtDate(row.plannedCompletion)}`}</Tag></div>
                )}
              </StructuredListCell>
              <StructuredListCell>{row.criticalPathTcns.join(' → ') || '—'}</StructuredListCell>
            </StructuredListRow>
          ))}
          {engines.length === 0 && (
            <StructuredListRow>
              <StructuredListCell>No engines in shop. Approving a recommendation inducts a TCN work package.</StructuredListCell>
            </StructuredListRow>
          )}
        </StructuredListBody>
      </StructuredListWrapper>

      <h2 className="section-title">TAT Value Tree</h2>
      <p className="mb-2" style={{ maxWidth: '48rem' }}>
        Turnaround time is dominated by waiting, not processing. Each KPI above pulls on one of four levers:
      </p>
      <div className="dashboard-grid">
        <div className="dashboard-col-12">
          <Tile style={{ textAlign: 'center', fontWeight: 600 }}>Reduce Turnaround Time</Tile>
        </div>
        {VALUE_TREE.map(branch => (
          <div className="dashboard-col-3" key={branch.driver}>
            <Tile style={{ height: '100%', borderTop: '3px solid var(--cds-interactive, #0f62fe)' }}>
              <div className="card-title" style={{ fontWeight: 600 }}>{branch.driver}</div>
              <p style={{ fontSize: '0.8125rem', margin: '0.5rem 0' }}>{branch.detail}</p>
              {branch.kpis.map(k => <Tag key={k} size="sm" type="cyan" style={{ marginRight: '0.25rem' }}>{k}</Tag>)}
            </Tile>
          </div>
        ))}
      </div>
    </div>
  );
}
