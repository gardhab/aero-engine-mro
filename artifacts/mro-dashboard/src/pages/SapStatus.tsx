import React from 'react';
import { useGetSapStatus, useListSapNotifications } from '@workspace/api-client-react';
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
  CodeSnippet,
  SkeletonPlaceholder
} from '@carbon/react';

export default function SapStatus() {
  const { data: status, isLoading: isStatusLoading } = useGetSapStatus();
  const { data: notifications = [], isLoading: isNotificationsLoading } = useListSapNotifications();

  if (isStatusLoading) {
    return <div className="page-container"><SkeletonPlaceholder style={{ width: '100%', height: '400px' }} /></div>;
  }

  const headers = [
    { key: 'createdAt', header: 'Timestamp' },
    { key: 'recommendationId', header: 'Rec ID' },
    { key: 'notificationNumber', header: 'SAP Notification #' },
    { key: 'status', header: 'Status' },
    { key: 'mode', header: 'Mode' },
    { key: 'errorMessage', header: 'Error (if any)' }
  ];

  const rows = notifications.map(n => ({
    id: n.id,
    createdAt: new Date(n.createdAt).toLocaleString(),
    recommendationId: n.recommendationId.slice(0,8),
    notificationNumber: n.notificationNumber || '-',
    status: <Tag type={n.status === 'success' ? 'green' : 'red'}>{n.status.toUpperCase()}</Tag>,
    mode: n.mode ? <Tag type={n.mode === 'live' ? 'blue' : 'gray'}>{n.mode.toUpperCase()}</Tag> : '-',
    errorMessage: n.errorMessage || '-'
  }));

  return (
    <div className="page-container">
      <h1 className="mb-4">SAP S/4HANA Cloud Adapter</h1>

      <div className="dashboard-grid mb-4">
        <div className="dashboard-col-4">
          <Tile>
            <div className="card-title">Adapter Status</div>
            <div className="flex items-center gap-2">
              <div className={`card-value ${status?.configured ? 'text-green-600' : 'text-red-600'}`}>
                {status?.configured ? 'Configured' : 'Not Configured'}
              </div>
              <Tag type={status?.mode === 'live' ? 'blue' : 'gray'}>
                {status?.mode === 'live' ? 'LIVE MODE' : 'MOCK MODE'}
              </Tag>
            </div>
          </Tile>
        </div>
        <div className="dashboard-col-8">
          <Tile>
            <div className="card-title">Configuration</div>
            <div className="dashboard-grid">
              <div className="dashboard-col-6">
                <p><strong>Base URL:</strong> {status?.baseUrl || 'N/A'}</p>
              </div>
              <div className="dashboard-col-6">
                <p><strong>Notification Type:</strong> {status?.notificationType || 'M1 (Maintenance Request)'}</p>
              </div>
            </div>
          </Tile>
        </div>
      </div>

      <h2 className="section-title">Notification Queue</h2>
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
                {isNotificationsLoading ? (
                  <TableRow><TableCell colSpan={headers.length}>Loading...</TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={headers.length}>No notifications sent yet.</TableCell></TableRow>
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
