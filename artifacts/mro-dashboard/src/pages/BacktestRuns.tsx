import React, { useState } from 'react';
import { useListBacktestRuns, useRunBacktest, getListBacktestRunsQueryKey } from '@workspace/api-client-react';
import {
  Tile,
  Button,
  DataTable,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  Modal,
  TextInput,
  Tag,
  ProgressBar
} from '@carbon/react';
import { Play } from '@carbon/icons-react';
import { useQueryClient } from '@tanstack/react-query';

export default function BacktestRuns() {
  const { data: runs = [], isLoading } = useListBacktestRuns();
  const runBacktestMut = useRunBacktest();
  const queryClient = useQueryClient();

  const [showRunModal, setShowRunModal] = useState(false);
  const [engineId, setEngineId] = useState('');
  const [runName, setRunName] = useState('');

  const handleRun = () => {
    runBacktestMut.mutate({ data: { engineId, name: runName } }, {
      onSuccess: () => {
        setShowRunModal(false);
        setEngineId('');
        setRunName('');
        queryClient.invalidateQueries({ queryKey: getListBacktestRunsQueryKey() });
      }
    });
  };

  const headers = [
    { key: 'name', header: 'Run Name' },
    { key: 'engineId', header: 'Engine' },
    { key: 'failureMode', header: 'Target Mode' },
    { key: 'leadTime', header: 'Lead Time (Cycles)' },
    { key: 'precision', header: 'Precision' },
    { key: 'recall', header: 'Recall' },
    { key: 'date', header: 'Date' }
  ];

  const tableRows = runs.map(r => ({
    id: r.id,
    name: <strong>{r.name}</strong>,
    engineId: r.engineId,
    failureMode: r.failureMode,
    leadTime: r.leadTimeCycles,
    precision: `${(r.precision * 100).toFixed(1)}%`,
    recall: `${(r.recall * 100).toFixed(1)}%`,
    date: new Date(r.createdAt).toLocaleDateString()
  }));

  return (
    <div className="page-container">
      <div className="flex justify-between items-end mb-4">
        <div>
          <h1 className="mb-1">Algorithm Backtesting</h1>
          <p>Replay historical engine data through the current rules engine to measure predictive performance.</p>
        </div>
        <Button renderIcon={Play} onClick={() => setShowRunModal(true)}>New Backtest Run</Button>
      </div>

      <div className="dashboard-grid mb-4">
        <div className="dashboard-col-4">
          <Tile>
            <div className="card-title">Total Runs</div>
            <div className="card-value">{runs.length}</div>
          </Tile>
        </div>
        <div className="dashboard-col-4">
          <Tile>
            <div className="card-title">Average Precision</div>
            <div className="card-value">
              {runs.length ? (runs.reduce((a, b) => a + b.precision, 0) / runs.length * 100).toFixed(1) : 0}%
            </div>
          </Tile>
        </div>
        <div className="dashboard-col-4">
          <Tile>
            <div className="card-title">Average Recall</div>
            <div className="card-value">
              {runs.length ? (runs.reduce((a, b) => a + b.recall, 0) / runs.length * 100).toFixed(1) : 0}%
            </div>
          </Tile>
        </div>
      </div>

      <DataTable rows={tableRows} headers={headers}>
        {({ rows, headers, getHeaderProps, getRowProps, getTableProps }) => (
          <TableContainer title="Historical Runs">
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
                {isLoading ? (
                  <TableRow><TableCell colSpan={headers.length}>Loading...</TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={headers.length}>No backtests run yet.</TableCell></TableRow>
                ) : rows.map((row) => (
                  <TableRow {...getRowProps({ row })}>
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

      <Modal
        open={showRunModal}
        modalHeading="Run Backtest"
        primaryButtonText="Start Backtest"
        secondaryButtonText="Cancel"
        onRequestClose={() => setShowRunModal(false)}
        onRequestSubmit={handleRun}
        primaryButtonDisabled={!engineId || runBacktestMut.isPending}
      >
        <p className="mb-4">Select a historical engine dataset to replay.</p>
        <TextInput
          id="run-name"
          labelText="Run Name (optional)"
          placeholder="e.g. Test new EGT threshold"
          value={runName}
          onChange={(e) => setRunName(e.target.value)}
          className="mb-4"
        />
        <TextInput
          id="bt-engine"
          labelText="Engine Serial Number (required)"
          placeholder="e.g. ESN-1001"
          value={engineId}
          onChange={(e) => setEngineId(e.target.value)}
        />
        {runBacktestMut.isPending && (
          <div className="mt-4"><ProgressBar label="Running backtest simulation..." /></div>
        )}
      </Modal>
    </div>
  );
}
