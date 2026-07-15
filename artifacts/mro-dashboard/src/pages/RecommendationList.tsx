import React, { useState } from 'react';
import { useListRecommendations } from '@workspace/api-client-react';
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
  Button,
  Dropdown
} from '@carbon/react';
import { ArrowRight } from '@carbon/icons-react';
import type { RecommendationStatus } from '@workspace/api-client-react';

export default function RecommendationList() {
  const [statusFilter, setStatusFilter] = useState<RecommendationStatus | 'all'>('all');
  const { data: recs = [], isLoading } = useListRecommendations(
    statusFilter === 'all' ? {} : { status: statusFilter }
  );

  const headers = [
    { key: 'engine', header: 'Engine' },
    { key: 'component', header: 'Component' },
    { key: 'failureMode', header: 'Failure Mode' },
    { key: 'priority', header: 'Priority' },
    { key: 'confidence', header: 'Confidence' },
    { key: 'status', header: 'Status' },
    { key: 'actions', header: '' }
  ];

  const rows = recs.map(r => ({
    id: r.id,
    engine: `${r.engineModel} • ${r.engineId}`,
    component: r.component,
    failureMode: r.failureMode,
    priority: (
      <span className={`priority-${r.priority} font-bold`}>
        {r.priority.toUpperCase()}
      </span>
    ),
    confidence: `${(r.confidence * 100).toFixed(0)}%`,
    status: (
      <Tag type={
        r.status === 'pending' ? 'blue' :
        r.status === 'approved' ? 'cyan' :
        r.status === 'rejected' ? 'red' :
        r.status === 'pushed' ? 'green' : 'magenta'
      }>
        {r.status.toUpperCase()}
      </Tag>
    ),
    actions: (
      <Link href={`/recommendations/${r.id}`} asChild>
        <Button kind="ghost" size="sm" renderIcon={ArrowRight} iconDescription="Review" hasIconOnly />
      </Link>
    )
  }));

  const statuses = ['all', 'pending', 'approved', 'rejected', 'pushed', 'failed'];

  return (
    <div className="page-container">
      <div className="flex justify-between items-end mb-4">
        <h1>Work Recommendations</h1>
        <div style={{ width: '200px' }}>
          <Dropdown
            id="status-filter"
            titleText="Filter by Status"
            label="Status"
            items={statuses}
            selectedItem={statusFilter}
            onChange={({ selectedItem }) => setStatusFilter(selectedItem as RecommendationStatus | 'all')}
          />
        </div>
      </div>

      <DataTable rows={rows} headers={headers} isSortable>
        {({ rows, headers, getHeaderProps, getRowProps, getTableProps, onInputChange }) => (
          <TableContainer>
            <TableToolbar>
              <TableToolbarContent>
                <TableToolbarSearch onChange={onInputChange} persistent />
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
                    <TableCell colSpan={headers.length} className="text-center">No recommendations found.</TableCell>
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