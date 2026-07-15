import React from 'react';
import { useListEngines } from '@workspace/api-client-react';
import { Link } from 'wouter';
import {
  DataTable,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  Tag,
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  Button
} from '@carbon/react';
import { ArrowRight } from '@carbon/icons-react';

export default function EngineList() {
  const { data: engines = [], isLoading } = useListEngines();

  const headers = [
    { key: 'esn', header: 'ESN' },
    { key: 'model', header: 'Model' },
    { key: 'tailNumber', header: 'Tail' },
    { key: 'status', header: 'Status' },
    { key: 'healthScore', header: 'Health' },
    { key: 'metrics', header: 'TSN / CSN' },
    { key: 'egtMargin', header: 'EGT Margin' },
    { key: 'openRecommendations', header: 'Open Recs' },
    { key: 'actions', header: '' }
  ];

  const rows = engines.map(e => ({
    id: e.esn,
    esn: e.esn,
    model: e.model,
    tailNumber: e.tailNumber,
    status: (
      <Tag type={
        e.status === 'operational' ? 'green' :
        e.status === 'monitor' ? 'blue' :
        e.status === 'action_required' ? 'magenta' : 'red'
      }>
        {e.status.replace('_', ' ').toUpperCase()}
      </Tag>
    ),
    healthScore: e.healthScore,
    metrics: `${e.tsn} / ${e.csn}`,
    egtMargin: e.egtMargin ? `${e.egtMargin}°C` : '-',
    openRecommendations: e.openRecommendations,
    actions: (
      <Link href={`/engines/${e.esn}`} asChild>
        <Button kind="ghost" size="sm" renderIcon={ArrowRight} iconDescription="Details" hasIconOnly />
      </Link>
    )
  }));

  return (
    <div className="page-container">
      <DataTable rows={rows} headers={headers} isSortable>
        {({ rows, headers, getHeaderProps, getRowProps, getTableProps, onInputChange }) => (
          <TableContainer title="Monitored Engines" description="Fleet condition tracking and engine status.">
            <TableToolbar>
              <TableToolbarContent>
                <TableToolbarSearch onChange={onInputChange} />
              </TableToolbarContent>
            </TableToolbar>
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
                  <TableRow>
                    <TableCell colSpan={headers.length} className="text-center">Loading...</TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={headers.length} className="text-center">No engines found.</TableCell>
                  </TableRow>
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
    </div>
  );
}
