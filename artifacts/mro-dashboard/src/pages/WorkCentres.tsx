import React from 'react';
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
  Accordion,
  AccordionItem,
} from '@carbon/react';

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

interface EquipmentItem {
  id: string;
  name: string;
  serialNumber: string | null;
  equipmentStatus: string;
  equipmentClassCode: string;
  equipmentClassName: string;
}

interface WorkUnit {
  id: string;
  name: string;
  workUnitType: string;
  equipment: EquipmentItem[];
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

const EQUIPMENT_STATUS_COLOURS: Record<string, 'red' | 'magenta' | 'purple' | 'blue' | 'teal' | 'green' | 'cool-gray' | 'orange'> = {
  AVAILABLE: 'green',
  IN_USE: 'blue',
  MAINTENANCE: 'cool-gray',
  CALIBRATION_DUE: 'red',
  OUT_OF_SERVICE: 'magenta',
};

const EQUIPMENT_STATUS_LABELS: Record<string, string> = {
  AVAILABLE: 'Available',
  IN_USE: 'In Use',
  MAINTENANCE: 'Maintenance',
  CALIBRATION_DUE: 'Calibration Due',
  OUT_OF_SERVICE: 'Out of Service',
};

function EquipmentBadge({ status }: { status: string }) {
  const colour = EQUIPMENT_STATUS_COLOURS[status] ?? 'cool-gray';
  const label = EQUIPMENT_STATUS_LABELS[status] ?? status;
  return (
    <Tag size="sm" type={colour as 'red' | 'magenta' | 'purple' | 'blue' | 'teal' | 'green' | 'cool-gray'}>
      {label}
    </Tag>
  );
}

function WorkUnitsPanel({ wcId, BASE }: { wcId: string; BASE: string }) {
  const [workUnits, setWorkUnits] = React.useState<WorkUnit[] | null>(null);

  React.useEffect(() => {
    fetch(`${BASE}api/work-centres/${wcId}/work-units`)
      .then((r) => r.json())
      .then(setWorkUnits)
      .catch(() => setWorkUnits([]));
  }, [wcId, BASE]);

  if (!workUnits) {
    return <SkeletonPlaceholder style={{ width: '100%', height: '60px', marginTop: '0.5rem' }} />;
  }

  if (workUnits.length === 0) {
    return (
      <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', marginTop: '0.5rem' }}>
        No work units recorded.
      </p>
    );
  }

  const hasCalibrationDue = workUnits.some((wu) =>
    wu.equipment.some((e) => e.equipmentStatus === 'CALIBRATION_DUE'),
  );

  return (
    <div style={{ marginTop: '0.75rem' }}>
      {hasCalibrationDue && (
        <div
          style={{
            background: 'var(--cds-support-error-background)',
            border: '1px solid var(--cds-support-error)',
            borderRadius: '4px',
            padding: '0.375rem 0.5rem',
            fontSize: '0.75rem',
            color: 'var(--cds-support-error)',
            marginBottom: '0.5rem',
            fontWeight: 600,
          }}
        >
          ⚠ Equipment calibration overdue — check before releasing work orders
        </div>
      )}
      {workUnits.map((wu) => (
        <div key={wu.id} style={{ marginBottom: '0.5rem' }}>
          <div
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: 'var(--cds-text-secondary)',
              marginBottom: '0.25rem',
              textTransform: 'uppercase',
              letterSpacing: '0.02em',
            }}
          >
            {wu.name}
            <span
              style={{
                fontWeight: 400,
                textTransform: 'none',
                letterSpacing: 0,
                marginLeft: '0.375rem',
                color: 'var(--cds-text-placeholder)',
              }}
            >
              {wu.workUnitType}
            </span>
          </div>
          {wu.equipment.length === 0 ? (
            <span style={{ fontSize: '0.75rem', color: 'var(--cds-text-placeholder)' }}>No equipment assigned</span>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
              {wu.equipment.map((e) => (
                <div
                  key={e.id}
                  title={`${e.name}${e.serialNumber ? ` · ${e.serialNumber}` : ''}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    background:
                      e.equipmentStatus === 'CALIBRATION_DUE' || e.equipmentStatus === 'OUT_OF_SERVICE'
                        ? 'var(--cds-support-error-background)'
                        : 'var(--cds-layer-accent)',
                    border:
                      e.equipmentStatus === 'CALIBRATION_DUE'
                        ? '1px solid var(--cds-support-error)'
                        : '1px solid transparent',
                    fontSize: '0.75rem',
                    cursor: 'default',
                  }}
                >
                  <span style={{ maxWidth: '14rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.name}
                  </span>
                  <EquipmentBadge status={e.equipmentStatus} />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

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

      {/* Per-area work centre boards — each card shows work units + equipment inline */}
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
                  {/* Work units + equipment panel */}
                  <WorkUnitsPanel wcId={wc.id} BASE={BASE} />
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
