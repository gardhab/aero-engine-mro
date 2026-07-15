import React, { useState } from 'react';
import { useListRules, useUpdateRule, getListRulesQueryKey } from '@workspace/api-client-react';
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
  Toggle,
  Modal,
  NumberInput,
  InlineNotification
} from '@carbon/react';
import { Edit } from '@carbon/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import type { Rule } from '@workspace/api-client-react';

export default function RuleList() {
  const { data: rules = [], isLoading } = useListRules();
  const updateRule = useUpdateRule();
  const queryClient = useQueryClient();

  const [editRule, setEditRule] = useState<Rule | null>(null);
  const [formData, setFormData] = useState({ threshold: 0, consecutiveCycles: 0, severity: 0 });

  const handleEditClick = (rule: Rule) => {
    setEditRule(rule);
    setFormData({
      threshold: rule.threshold,
      consecutiveCycles: rule.consecutiveCycles,
      severity: rule.severity
    });
  };

  const handleToggleEnable = (rule: Rule, enabled: boolean) => {
    updateRule.mutate({ id: rule.id, data: { enabled } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListRulesQueryKey() })
    });
  };

  const handleToggleAutoApprove = (rule: Rule, autoApprove: boolean) => {
    updateRule.mutate({ id: rule.id, data: { autoApprove } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListRulesQueryKey() })
    });
  };

  const handleSaveEdit = () => {
    if (!editRule) return;
    updateRule.mutate({ id: editRule.id, data: formData }, {
      onSuccess: () => {
        setEditRule(null);
        queryClient.invalidateQueries({ queryKey: getListRulesQueryKey() });
      }
    });
  };

  const headers = [
    { key: 'name', header: 'Rule Name' },
    { key: 'parameter', header: 'Parameter / Component' },
    { key: 'condition', header: 'Condition' },
    { key: 'severity', header: 'Severity' },
    { key: 'autoApprove', header: 'Auto-Approve' },
    { key: 'enabled', header: 'Enabled' },
    { key: 'actions', header: '' }
  ];

  const rows = rules.map(r => ({
    id: r.id,
    name: (
      <div>
        <strong>{r.name}</strong>
        <div style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>{r.description}</div>
      </div>
    ),
    parameter: `${r.parameter} @ ${r.component}`,
    condition: `${r.operator} ${r.threshold} for ${r.consecutiveCycles} cycles`,
    severity: (
      <Tag type={r.severity >= 0.8 ? 'red' : r.severity >= 0.5 ? 'magenta' : 'blue'}>
        {r.severity}
      </Tag>
    ),
    autoApprove: (
      <Toggle 
        id={`auto-${r.id}`} 
        labelA="Off" labelB="On" 
        toggled={r.autoApprove} 
        size="sm"
        onToggle={(val) => handleToggleAutoApprove(r, val)}
      />
    ),
    enabled: (
      <Toggle 
        id={`en-${r.id}`} 
        labelA="Disabled" labelB="Enabled" 
        toggled={r.enabled} 
        size="sm"
        onToggle={(val) => handleToggleEnable(r, val)}
      />
    ),
    actions: (
      <Button kind="ghost" size="sm" renderIcon={Edit} iconDescription="Edit Thresholds" hasIconOnly onClick={() => handleEditClick(r)} />
    )
  }));

  return (
    <div className="page-container">
      <div className="flex justify-between items-center mb-4">
        <h1>Rules Engine</h1>
      </div>

      <DataTable rows={rows} headers={headers} isSortable>
        {({ rows, headers, getHeaderProps, getRowProps, getTableProps, onInputChange }) => (
          <TableContainer description="Manage ECTM thresholds and automated decision logic.">
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
                    <TableCell colSpan={headers.length} className="text-center">No rules found.</TableCell>
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

      <Modal
        open={!!editRule}
        modalHeading="Edit Rule Thresholds"
        primaryButtonText="Save Changes"
        secondaryButtonText="Cancel"
        onRequestClose={() => setEditRule(null)}
        onRequestSubmit={handleSaveEdit}
      >
        {editRule && (
          <div>
            <p className="mb-4">Editing <strong>{editRule.name}</strong></p>
            <div className="mb-4">
              <NumberInput
                id="threshold"
                label={`Threshold (${editRule.operator})`}
                value={formData.threshold}
                onChange={(e: any) => setFormData({...formData, threshold: Number(e.imaginaryTarget ? e.imaginaryTarget.value : e.target.value)})}
                step={1}
              />
            </div>
            <div className="mb-4">
              <NumberInput
                id="consecutive"
                label="Consecutive Cycles Required"
                value={formData.consecutiveCycles}
                min={1}
                max={50}
                onChange={(e: any) => setFormData({...formData, consecutiveCycles: Number(e.imaginaryTarget ? e.imaginaryTarget.value : e.target.value)})}
              />
            </div>
            <div className="mb-4">
              <NumberInput
                id="severity"
                label="Base Severity (0.0 - 1.0)"
                value={formData.severity}
                min={0.1}
                max={1.0}
                step={0.1}
                onChange={(e: any) => setFormData({...formData, severity: Number(e.imaginaryTarget ? e.imaginaryTarget.value : e.target.value)})}
              />
            </div>
            <InlineNotification
              kind="info"
              title="Impact Warning"
              subtitle="Changing thresholds applies to all future pipeline runs immediately."
              lowContrast
            />
          </div>
        )}
      </Modal>
    </div>
  );
}