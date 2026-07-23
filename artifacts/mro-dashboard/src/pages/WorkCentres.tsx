import React from 'react';
import { Link } from 'wouter';
import {
  Tile,
  SkeletonPlaceholder,
  Tag,
  StructuredListWrapper,
  StructuredListHead,
  StructuredListRow,
  StructuredListCell,
  StructuredListBody,
  InlineNotification,
} from '@carbon/react';

// Work-centre utilisation fetched from the new ISA-95 API endpoints.
// Until the codegen hook is available we call fetch directly.
interface WorkCentre {
  id: string;
  name: string;
  workCenterType: string;
  capacity: number;
  areaName: string;
  areaType: string;
  siteName: string;
  twinState: string;
  activeCount: number;
  utilisationPct: number;
  byStatus: Record<string, number>;
}

const TYPE_LABEL: Record<string, string> = {
  BORESCOPE: 'Borescope',
  BLADE_REPAIR: 'Blade Repair',
  COMBUSTION: 'Combustion',
  GEARBOX: 'Gearbox',
  ACCESSORIES: 'Accessories',
  TEST_CELL: 'Test Cell',
  NDT: 'NDT',
  BALANCING: 'Balancing',
  FINAL_TEST: 'Final Test',
};

const STATUS_COLOURS: Record<string, 'red' | 'magenta' | 'purple' | 'blue' | 'teal' | 'green' | 'cool-gray'> = {
  IN_PROGRESS: 'blue',
  HOLD_MATERIAL: 'red',
  HOLD_SKILL: 'magenta',
  HOLD_EQUIPMENT: 'purple',
  READY: 'teal',
  PENDING: 'cool-gray',
  COMPLETE: 'green',
};

function UtilisationBar({ pct, byStatus }: { pct: number; byStatus: Record<string, number> }) {
  const colour = pct >= 90 ? '#da1e28' : pct >= 70 ? '#f1c21b' : '#24a148';
  return (
    <div style={{ marginTop: '0.5rem' }}>
      <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', marginBottom: '0.25rem' }}>
        <div
          style={{
            flex: 1,
            height: '8px',
            background: 'var(--cds-layer-accent)',
            borderRadius: '4px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${Math.min(pct, 100)}%`,
              height: '100%',
              background: colour,
              borderRadius: '4px',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
        <span style={{ fontSize: '0.75rem', minWidth: '3rem', textAlign: 'right', fontWeight: 600 }}>
          {pct}%
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
        {Object.entries(byStatus)
          .filter(([, n]) => n > 0)
          .map(([status, n]) => (
            <Tag key={status} size="sm" type={STATUS_COLOURS[status] ?? 'cool-gray'}>
              {status.replace(/_/g, ' ')} ×{n}
            </Tag>
          ))}
      </div>
    </div>
  );
}

export default function WorkCentresPage() {
  const [workCentres, setWorkCentres] = React.useState<WorkCentre[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const BASE = import.meta.env.BASE_URL ?? '/';

  React.useEffect(() => {
    fetch(`${BASE}api/work-centres`)
      .then((r) => r.json())
      .then(setWorkCentres)
      .catch((e) => setError(String(e)));
  }, [BASE]);

  if (error) {
    return (
      <div className="page-container">
        <h1>Work Centres</h1>
        <InlineNotification kind="error" title="Failed to load" subtitle={error} hideCloseButton lowContrast />
      </div>
    );
  }

  if (!workCentres) {
    return (
      <div className="page-container">
        <h1>Work Centres</h1>
        <SkeletonPlaceholder style={{ width: '100%', height: '400px' }} />
      </div>
    );
  }

  const overCapacity = workCentres.filter((wc) => wc.utilisationPct >= 90);

  // Group by area
  const byArea = workCentres.reduce<Record<string, WorkCentre[]>>((acc, wc) => {
    (acc[wc.areaName] = acc[wc.areaName] ?? []).push(wc);
    return acc;
  }, {});

  return (
    <div className="page-container">
      <div className="flex justify-between items-center mb-4">
        <h1>Work Centres</h1>
        <span style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
          ISA-95 Equipment Hierarchy · {workCentres[0]?.siteName ?? '—'}
        </span>
      </div>

      {overCapacity.length > 0 && (
        <>
          {overCapacity.map((wc) => (
            <InlineNotification
              key={wc.id}
              kind="error"
              lowContrast
              hideCloseButton
              title={`${wc.name} at capacity`}
              subtitle={`${wc.activeCount}/${wc.capacity} active segments (${wc.utilisationPct}% utilisation)`}
              style={{ maxWidth: '100%', marginBottom: '0.5rem' }}
            />
          ))}
        </>
      )}

      {/* KPI row */}
      <div className="dashboard-grid mb-4">
        <div className="dashboard-col-3">
          <Tile className="card-tile">
            <div className="card-title">Work Centres</div>
            <div className="card-value">{workCentres.length}</div>
          </Tile>
        </div>
        <div className="dashboard-col-3">
          <Tile className="card-tile">
            <div className="card-title">Total Active Segments</div>
            <div className="card-value">{workCentres.reduce((s, wc) => s + wc.activeCount, 0)}</div>
          </Tile>
        </div>
        <div className="dashboard-col-3">
          <Tile className="card-tile">
            <div className="card-title">Avg Utilisation</div>
            <div className="card-value">
              {workCentres.length
                ? `${Math.round(workCentres.reduce((s, wc) => s + wc.utilisationPct, 0) / workCentres.length)}%`
                : '—'}
            </div>
          </Tile>
        </div>
        <div className="dashboard-col-3">
          <Tile className="card-tile">
            <div className="card-title">HOLD_MATERIAL Segments</div>
            <div
              className="card-value"
              style={{
                color: workCentres.some((wc) => (wc.byStatus['HOLD_MATERIAL'] ?? 0) > 0)
                  ? 'var(--cds-support-error)'
                  : undefined,
              }}
            >
              {workCentres.reduce((s, wc) => s + (wc.byStatus['HOLD_MATERIAL'] ?? 0), 0)}
            </div>
          </Tile>
        </div>
      </div>

      {/* Per-area work centre boards */}
      {Object.entries(byArea).map(([areaName, wcs]) => (
        <div key={areaName} style={{ marginBottom: '2rem' }}>
          <h2 className="section-title">{areaName}</h2>
          <div className="dashboard-grid">
            {wcs.map((wc) => (
              <div className="dashboard-col-3" key={wc.id}>
                <Tile
                  style={{
                    borderTop: `3px solid ${wc.utilisationPct >= 90 ? 'var(--cds-support-error)' : wc.utilisationPct >= 70 ? 'var(--cds-support-warning)' : 'var(--cds-interactive)'}`,
                    height: '100%',
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{wc.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', marginBottom: '0.5rem' }}>
                    {TYPE_LABEL[wc.workCenterType] ?? wc.workCenterType} · Capacity {wc.capacity}
                  </div>
                  <div style={{ fontSize: '0.875rem' }}>
                    <strong>{wc.activeCount}</strong> / {wc.capacity} active
                  </div>
                  <UtilisationBar pct={wc.utilisationPct} byStatus={wc.byStatus} />
                </Tile>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* All active segments across all centres */}
      {workCentres.some((wc) => wc.activeCount > 0) && (
        <>
          <h2 className="section-title">Active & Held Segments</h2>
          <StructuredListWrapper>
            <StructuredListHead>
              <StructuredListRow head>
                <StructuredListCell head>Work Centre</StructuredListCell>
                <StructuredListCell head>Area</StructuredListCell>
                <StructuredListCell head>Status Breakdown</StructuredListCell>
                <StructuredListCell head>Utilisation</StructuredListCell>
              </StructuredListRow>
            </StructuredListHead>
            <StructuredListBody>
              {workCentres
                .filter((wc) => wc.activeCount > 0)
                .sort((a, b) => b.utilisationPct - a.utilisationPct)
                .map((wc) => (
                  <StructuredListRow key={wc.id}>
                    <StructuredListCell>{wc.name}</StructuredListCell>
                    <StructuredListCell>{wc.areaName}</StructuredListCell>
                    <StructuredListCell>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                        {Object.entries(wc.byStatus)
                          .filter(([s, n]) => n > 0 && s !== 'COMPLETE' && s !== 'SKIPPED')
                          .map(([s, n]) => (
                            <Tag key={s} size="sm" type={STATUS_COLOURS[s] ?? 'cool-gray'}>
                              {s.replace(/_/g, ' ')} ×{n}
                            </Tag>
                          ))}
                      </div>
                    </StructuredListCell>
                    <StructuredListCell>
                      <strong>{wc.utilisationPct}%</strong>{' '}
                      <span style={{ color: 'var(--cds-text-secondary)', fontSize: '0.75rem' }}>
                        ({wc.activeCount}/{wc.capacity})
                      </span>
                    </StructuredListCell>
                  </StructuredListRow>
                ))}
            </StructuredListBody>
          </StructuredListWrapper>
        </>
      )}

      {workCentres.every((wc) => wc.activeCount === 0) && (
        <p style={{ color: 'var(--cds-text-secondary)', marginTop: '2rem' }}>
          No active segments. Approve a recommendation to induct an engine and create TCN work packages — they will appear here automatically.
        </p>
      )}
    </div>
  );
}
