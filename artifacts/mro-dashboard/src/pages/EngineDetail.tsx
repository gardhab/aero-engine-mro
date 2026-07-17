import React, { useState } from 'react';
import { useRoute } from 'wouter';
import { 
  useGetEngine, 
  useGetEngineHealth, 
  useGetEngineReadings,
  useGetEngineLlps,
  useListRecommendations,
  getGetEngineQueryKey,
  getGetEngineHealthQueryKey,
  getGetEngineLlpsQueryKey
} from '@workspace/api-client-react';
import {
  Breadcrumb,
  BreadcrumbItem,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Tile,
  Tag,
  StructuredListWrapper,
  StructuredListHead,
  StructuredListRow,
  StructuredListCell,
  StructuredListBody,
  Dropdown,
  SkeletonPlaceholder,
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer
} from '@carbon/react';
import { LineChart } from '@carbon/charts-react';
import { Link } from 'wouter';

export default function EngineDetail() {
  const [, params] = useRoute('/engines/:esn');
  const esn = params?.esn || '';
  
  const { data: engine, isLoading: isEngineLoading } = useGetEngine(esn, { query: { enabled: !!esn, queryKey: getGetEngineQueryKey(esn) } });
  const { data: health, isLoading: isHealthLoading } = useGetEngineHealth(esn, { query: { enabled: !!esn, queryKey: getGetEngineHealthQueryKey(esn) } });
  const { data: recs, isLoading: isRecsLoading } = useListRecommendations({ engineId: esn });
  const { data: llpSheet, isLoading: isLlpLoading } = useGetEngineLlps(esn, { query: { enabled: !!esn, queryKey: getGetEngineLlpsQueryKey(esn) } });

  const parameters = health?.parameters.map(p => p.parameter) || [];
  const [selectedParam, setSelectedParam] = useState<string>('');

  // Auto-select first parameter when health data loads
  React.useEffect(() => {
    if (parameters.length > 0 && !selectedParam) {
      setSelectedParam(parameters[0]);
    }
  }, [parameters, selectedParam]);

  const { data: readings, isLoading: isReadingsLoading } = useGetEngineReadings({ engineId: esn, parameter: selectedParam || undefined });

  if (isEngineLoading || isHealthLoading) {
    return <div className="page-container"><SkeletonPlaceholder style={{ width: '100%', height: '400px' }} /></div>;
  }

  if (!engine || !health) {
    return <div className="page-container">Engine not found.</div>;
  }

  const openRecs = (recs ?? []).filter(r => r.status === 'pending' || r.status === 'approved' || r.status === 'failed');
  const openRedItems = openRecs.filter(r => r.ragBucket === 'red');
  const releaseBlocked = openRedItems.some(r => r.releaseHold);

  const chartData = readings ? readings.map(r => ({
    group: r.label || r.parameter,
    cycle: r.cycle,
    value: r.value
  })) : [];

  const chartOptions = {
    title: `${selectedParam} Trend`,
    axes: {
      bottom: { title: 'Cycles', mapsTo: 'cycle', scaleType: 'linear' },
      left: { title: 'Value', mapsTo: 'value', scaleType: 'linear' }
    },
    height: '400px',
    theme: 'g10'
  };

  return (
    <div className="page-container">
      <Breadcrumb className="mb-2">
        <BreadcrumbItem><Link href="/engines">Engines</Link></BreadcrumbItem>
        <BreadcrumbItem isCurrentPage>{esn}</BreadcrumbItem>
      </Breadcrumb>

      <div className="flex justify-between items-center mb-4">
        <div>
          <h1>{engine.model} • {engine.esn}</h1>
          <p className="mt-1">Tail: {engine.tailNumber} {engine.operator ? `| Operator: ${engine.operator}` : ''}</p>
        </div>
        <div className="flex gap-2 items-center">
          <Tile>
            <div className="card-title">Health Score</div>
            <div className={`card-value ${engine.healthScore < 50 ? 'status-grounded' : engine.healthScore < 80 ? 'status-action_required' : 'status-operational'}`}>
              {engine.healthScore}
            </div>
          </Tile>
          <Tag size="lg" type={engine.status === 'operational' ? 'green' : engine.status === 'monitor' ? 'blue' : engine.status === 'action_required' ? 'magenta' : 'red'}>
            {engine.status.replace('_', ' ').toUpperCase()}
          </Tag>
          {!isRecsLoading && (
            <Tag
              size="lg"
              type={releaseBlocked ? 'red' : 'green'}
              title={releaseBlocked
                ? `${openRedItems.length} open RED (Must Do) item(s) block release to service`
                : 'No open Red (Must Do) items blocking release'}
            >
              {releaseBlocked ? `RELEASE HOLD · ${openRedItems.length} RED OPEN` : 'RELEASE READY'}
            </Tag>
          )}
        </div>
      </div>

      <Tabs>
        <TabList aria-label="Engine Details">
          <Tab>Overview & Health</Tab>
          <Tab>Parameter Trends</Tab>
          <Tab>Open Recommendations ({engine.openRecommendations})</Tab>
          <Tab>LLP Status{llpSheet ? ` (${llpSheet.parts.filter(p => p.status !== 'ok').length} flagged)` : ''}</Tab>
        </TabList>
        <TabPanels>
          <TabPanel>
            <div className="dashboard-grid mt-4">
              <div className="dashboard-col-4">
                <Tile className="mb-2">
                  <h3 className="mb-2">Metrics</h3>
                  <p><strong>TSN:</strong> {engine.tsn}</p>
                  <p><strong>CSN:</strong> {engine.csn}</p>
                  <p><strong>TSO:</strong> {engine.tso}</p>
                  <p><strong>CSO:</strong> {engine.cso}</p>
                  <p><strong>EGT Margin:</strong> {engine.egtMargin}°C</p>
                  <p><strong>Last Updated:</strong> {new Date(engine.lastUpdated).toLocaleString()}</p>
                </Tile>
              </div>
              <div className="dashboard-col-8">
                <h3 className="mb-2">Module Health</h3>
                <StructuredListWrapper>
                  <StructuredListHead>
                    <StructuredListRow head>
                      <StructuredListCell head>Module</StructuredListCell>
                      <StructuredListCell head>Status</StructuredListCell>
                      <StructuredListCell head>Note</StructuredListCell>
                    </StructuredListRow>
                  </StructuredListHead>
                  <StructuredListBody>
                    {health.moduleHealth.map((m, i) => (
                      <StructuredListRow key={i}>
                        <StructuredListCell>{m.module}</StructuredListCell>
                        <StructuredListCell>
                          <Tag type={m.status === 'normal' ? 'green' : m.status === 'caution' ? 'magenta' : 'red'}>{m.status}</Tag>
                        </StructuredListCell>
                        <StructuredListCell>{m.note || '-'}</StructuredListCell>
                      </StructuredListRow>
                    ))}
                  </StructuredListBody>
                </StructuredListWrapper>
              </div>
            </div>
            
            <h3 className="mt-4 mb-2">Parameter Status</h3>
            <StructuredListWrapper>
              <StructuredListHead>
                <StructuredListRow head>
                  <StructuredListCell head>Parameter</StructuredListCell>
                  <StructuredListCell head>Value</StructuredListCell>
                  <StructuredListCell head>Limit</StructuredListCell>
                  <StructuredListCell head>Trend</StructuredListCell>
                  <StructuredListCell head>Status</StructuredListCell>
                </StructuredListRow>
              </StructuredListHead>
              <StructuredListBody>
                {health.parameters.map((p, i) => (
                  <StructuredListRow key={i}>
                    <StructuredListCell><strong>{p.label}</strong> ({p.parameter})</StructuredListCell>
                    <StructuredListCell>{p.value.toFixed(2)} {p.unit}</StructuredListCell>
                    <StructuredListCell>{p.limit !== null ? `${p.limit} ${p.unit}` : '-'}</StructuredListCell>
                    <StructuredListCell>{p.trend || '-'}</StructuredListCell>
                    <StructuredListCell>
                      <Tag type={p.status === 'normal' ? 'green' : p.status === 'caution' ? 'magenta' : 'red'}>{p.status}</Tag>
                    </StructuredListCell>
                  </StructuredListRow>
                ))}
              </StructuredListBody>
            </StructuredListWrapper>
          </TabPanel>

          <TabPanel>
            <div className="mt-4 mb-4" style={{ width: '300px' }}>
              <Dropdown
                id="param-select"
                titleText="Select Parameter"
                label="Select a parameter"
                items={parameters}
                selectedItem={selectedParam}
                onChange={({ selectedItem }) => setSelectedParam(selectedItem)}
              />
            </div>
            {isReadingsLoading ? <SkeletonPlaceholder style={{ height: '400px', width: '100%' }} /> : 
              readings && readings.length > 0 ? (
                <div style={{ height: '400px' }}>
                  {/* @ts-ignore - carbon charts types are sometimes slightly off */}
                  <LineChart data={chartData} options={chartOptions as any} />
                </div>
              ) : (
                <Tile>No data available for this parameter.</Tile>
              )
            }
          </TabPanel>

          <TabPanel>
            <div className="mt-4">
              <StructuredListWrapper>
                <StructuredListHead>
                  <StructuredListRow head>
                    <StructuredListCell head>ID</StructuredListCell>
                    <StructuredListCell head>Component</StructuredListCell>
                    <StructuredListCell head>Failure Mode</StructuredListCell>
                    <StructuredListCell head>Category</StructuredListCell>
                    <StructuredListCell head>RAG</StructuredListCell>
                    <StructuredListCell head>Priority</StructuredListCell>
                    <StructuredListCell head>Status</StructuredListCell>
                  </StructuredListRow>
                </StructuredListHead>
                <StructuredListBody>
                  {isRecsLoading ? (
                    <StructuredListRow><StructuredListCell colSpan={7}>Loading...</StructuredListCell></StructuredListRow>
                  ) : openRecs.length === 0 ? (
                    <StructuredListRow><StructuredListCell colSpan={7}>No open recommendations.</StructuredListCell></StructuredListRow>
                  ) : [...openRecs].sort((a, b) =>
                    ({ red: 0, amber: 1, green: 2 }[a.ragBucket] - { red: 0, amber: 1, green: 2 }[b.ragBucket]) ||
                    a.repairCategory - b.repairCategory
                  ).map(r => (
                    <StructuredListRow key={r.id}>
                      <StructuredListCell><Link href={`/recommendations/${r.id}`}>{r.id.slice(0,8)}</Link></StructuredListCell>
                      <StructuredListCell>{r.component}</StructuredListCell>
                      <StructuredListCell>{r.failureMode}</StructuredListCell>
                      <StructuredListCell>
                        Cat {r.repairCategory} · {r.repairCategoryName}{r.releaseHold ? <strong> · HOLD</strong> : null}
                      </StructuredListCell>
                      <StructuredListCell>
                        <Tag type={r.ragBucket === 'red' ? 'red' : r.ragBucket === 'amber' ? 'magenta' : 'green'}>
                          {r.ragBucket.toUpperCase()}
                        </Tag>
                      </StructuredListCell>
                      <StructuredListCell>
                        <span className={`priority-${r.priority}`}>{r.priority.toUpperCase()}</span>
                      </StructuredListCell>
                      <StructuredListCell>{r.status}</StructuredListCell>
                    </StructuredListRow>
                  ))}
                </StructuredListBody>
              </StructuredListWrapper>
            </div>
          </TabPanel>

          <TabPanel>
            <div className="mt-4">
              {isLlpLoading || !llpSheet ? (
                <SkeletonPlaceholder style={{ width: '100%', height: '300px' }} />
              ) : (
                <>
                  <div className="dashboard-grid mb-4">
                    {llpSheet.moduleRollup.map(m => (
                      <div className="dashboard-col-4" key={m.module}>
                        <Tile>
                          <div className="card-title">{m.module}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <Tag type={m.status === 'critical' ? 'red' : m.status === 'warning' ? 'magenta' : 'green'}>
                              {m.minRemainingCycles.toLocaleString()} cyc
                            </Tag>
                            <span>{m.limitingPartName} · {m.limitingSerialNumber}</span>
                          </div>
                          <p className="mt-1" style={{ fontSize: '0.75rem' }}>{m.partCount} tracked parts</p>
                        </Tile>
                      </div>
                    ))}
                  </div>
                  <DataTable
                    rows={llpSheet.parts.map(p => ({
                      id: `${p.engineId}:${p.partNumber}`,
                      module: p.module,
                      partName: p.partName,
                      partNumber: p.partNumber,
                      serialNumber: p.serialNumber,
                      position: p.position,
                      lifeLimitCycles: p.lifeLimitCycles,
                      csn: p.csn,
                      remainingCycles: p.remainingCycles,
                      status: p.status
                    }))}
                    headers={[
                      { key: 'module', header: 'Module' },
                      { key: 'partName', header: 'Part' },
                      { key: 'partNumber', header: 'Part No.' },
                      { key: 'serialNumber', header: 'Serial No.' },
                      { key: 'position', header: 'Position' },
                      { key: 'lifeLimitCycles', header: 'Life Limit (cyc)' },
                      { key: 'csn', header: 'Part CSN' },
                      { key: 'remainingCycles', header: 'Remaining (cyc)' },
                      { key: 'status', header: 'Status' }
                    ]}
                    isSortable
                  >
                    {({ rows, headers, getTableProps, getHeaderProps, getRowProps }) => (
                      <TableContainer
                        title="LLP Status Sheet"
                        description={`Engine CSN ${llpSheet.engineCsn.toLocaleString()} · warning below ${llpSheet.warningThresholdCycles.toLocaleString()} cyc remaining, critical below ${llpSheet.criticalThresholdCycles.toLocaleString()} cyc. Life limits are illustrative, not certified data.`}
                      >
                        <Table {...getTableProps()}>
                          <TableHead>
                            <TableRow>
                              {headers.map(header => (
                                <TableHeader {...getHeaderProps({ header })} key={header.key}>
                                  {header.header}
                                </TableHeader>
                              ))}
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {rows.map(row => {
                              const status = String(row.cells.find(c => c.info.header === 'status')?.value ?? 'ok');
                              return (
                                <TableRow {...getRowProps({ row })} key={row.id}>
                                  {row.cells.map(cell => (
                                    <TableCell key={cell.id}>
                                      {cell.info.header === 'status' ? (
                                        <Tag type={status === 'critical' ? 'red' : status === 'warning' ? 'magenta' : 'green'}>
                                          {status.toUpperCase()}
                                        </Tag>
                                      ) : cell.info.header === 'remainingCycles' ? (
                                        <span className={status === 'critical' ? 'status-grounded' : status === 'warning' ? 'status-action_required' : ''}>
                                          {Number(cell.value).toLocaleString()}
                                        </span>
                                      ) : typeof cell.value === 'number' ? (
                                        cell.value.toLocaleString()
                                      ) : (
                                        cell.value
                                      )}
                                    </TableCell>
                                  ))}
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                  </DataTable>
                </>
              )}
            </div>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </div>
  );
}
