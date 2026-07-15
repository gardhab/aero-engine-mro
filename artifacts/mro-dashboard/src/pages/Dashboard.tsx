import React from 'react';
import { 
  useGetDashboardSummary, 
  useGetActivity, 
  useRunPipeline 
} from '@workspace/api-client-react';
import { 
  Tile, 
  Button, 
  SkeletonPlaceholder, 
  StructuredListWrapper,
  StructuredListHead,
  StructuredListRow,
  StructuredListCell,
  StructuredListBody,
  Tag,
  ToastNotification
} from '@carbon/react';
import { Play } from '@carbon/icons-react';
import { useQueryClient } from '@tanstack/react-query';

export default function DashboardPage() {
  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary();
  const { data: activity, isLoading: isLoadingActivity } = useGetActivity();
  const runPipeline = useRunPipeline();
  const queryClient = useQueryClient();
  const [notification, setNotification] = React.useState<{title: string, subtitle: string, kind: any} | null>(null);

  const handleRunPipeline = () => {
    runPipeline.mutate(undefined, {
      onSuccess: (res) => {
        setNotification({
          kind: 'success',
          title: 'Pipeline Executed',
          subtitle: `Evaluated ${res.enginesEvaluated} engines. Fired ${res.rulesFired} rules. Created ${res.recommendationsCreated} recommendations.`
        });
        queryClient.invalidateQueries({ queryKey: ['/api/dashboard/summary'] });
        queryClient.invalidateQueries({ queryKey: ['/api/dashboard/activity'] });
      },
      onError: (err) => {
        setNotification({
          kind: 'error',
          title: 'Pipeline Failed',
          subtitle: err.error || 'Unknown error occurred'
        });
      }
    });
  };

  if (isLoadingSummary) {
    return (
      <div className="page-container">
        <h1 className="mb-4">Fleet Dashboard</h1>
        <SkeletonPlaceholder style={{ width: '100%', height: '400px' }} />
      </div>
    );
  }

  return (
    <div className="page-container">
      {notification && (
        <div style={{ position: 'fixed', top: '4rem', right: '1rem', zIndex: 9999 }}>
          <ToastNotification 
            kind={notification.kind} 
            title={notification.title} 
            subtitle={notification.subtitle}
            onClose={() => setNotification(null)}
            timeout={5000}
          />
        </div>
      )}

      <div className="flex justify-between items-center mb-4">
        <h1>Fleet Dashboard</h1>
        <Button 
          renderIcon={Play} 
          onClick={handleRunPipeline}
          disabled={runPipeline.isPending}
        >
          Run decision pipeline
        </Button>
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-col-3">
          <Tile className="card-tile">
            <div className="card-title">Fleet Size</div>
            <div className="card-value">{summary?.fleetSize || 0}</div>
          </Tile>
        </div>
        <div className="dashboard-col-3">
          <Tile className="card-tile">
            <div className="card-title">Avg Health Score</div>
            <div className="card-value">{summary?.avgHealthScore.toFixed(1) || 0}</div>
          </Tile>
        </div>
        <div className="dashboard-col-3">
          <Tile className="card-tile">
            <div className="card-title">Pending Recs</div>
            <div className="card-value">{summary?.pendingRecommendations || 0}</div>
          </Tile>
        </div>
        <div className="dashboard-col-3">
          <Tile className="card-tile">
            <div className="card-title">Pushed to SAP</div>
            <div className="card-value">{summary?.pushedToSap || 0}</div>
          </Tile>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-col-6">
          <h2 className="section-title">Status Counts</h2>
          <div className="dashboard-grid">
            <div className="dashboard-col-6"><Tile><div className="card-title">Operational</div><div className="card-value status-operational">{summary?.statusCounts.operational}</div></Tile></div>
            <div className="dashboard-col-6"><Tile><div className="card-title">Monitor</div><div className="card-value status-monitor">{summary?.statusCounts.monitor}</div></Tile></div>
            <div className="dashboard-col-6"><Tile><div className="card-title">Action Required</div><div className="card-value status-action_required">{summary?.statusCounts.actionRequired}</div></Tile></div>
            <div className="dashboard-col-6"><Tile><div className="card-title">Grounded</div><div className="card-value status-grounded">{summary?.statusCounts.grounded}</div></Tile></div>
          </div>
        </div>
        <div className="dashboard-col-6">
          <h2 className="section-title">Priority Counts</h2>
          <div className="dashboard-grid">
            <div className="dashboard-col-6"><Tile><div className="card-title">Routine</div><div className="card-value priority-routine">{summary?.priorityCounts.routine}</div></Tile></div>
            <div className="dashboard-col-6"><Tile><div className="card-title">Expedite</div><div className="card-value priority-expedite">{summary?.priorityCounts.expedite}</div></Tile></div>
            <div className="dashboard-col-6"><Tile><div className="card-title">Urgent</div><div className="card-value priority-urgent">{summary?.priorityCounts.urgent}</div></Tile></div>
            <div className="dashboard-col-6"><Tile><div className="card-title">AOG</div><div className="card-value priority-aog">{summary?.priorityCounts.aog}</div></Tile></div>
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-col-8">
          <h2 className="section-title">Top Risks</h2>
          <StructuredListWrapper>
            <StructuredListHead>
              <StructuredListRow head>
                <StructuredListCell head>ESN</StructuredListCell>
                <StructuredListCell head>Model</StructuredListCell>
                <StructuredListCell head>Health Score</StructuredListCell>
                <StructuredListCell head>Top Failure Mode</StructuredListCell>
              </StructuredListRow>
            </StructuredListHead>
            <StructuredListBody>
              {summary?.topRisks.map((risk, idx) => (
                <StructuredListRow key={idx}>
                  <StructuredListCell>{risk.esn}</StructuredListCell>
                  <StructuredListCell>{risk.model}</StructuredListCell>
                  <StructuredListCell>
                    <Tag type={risk.healthScore < 50 ? 'red' : risk.healthScore < 80 ? 'magenta' : 'green'}>
                      {risk.healthScore}
                    </Tag>
                  </StructuredListCell>
                  <StructuredListCell>{risk.topFailureMode}</StructuredListCell>
                </StructuredListRow>
              ))}
              {(!summary?.topRisks || summary.topRisks.length === 0) && (
                <StructuredListRow>
                  <StructuredListCell colSpan={4}>No current risks detected.</StructuredListCell>
                </StructuredListRow>
              )}
            </StructuredListBody>
          </StructuredListWrapper>
        </div>

        <div className="dashboard-col-4">
          <h2 className="section-title">Recent Activity</h2>
          {isLoadingActivity ? (
            <SkeletonPlaceholder />
          ) : (
            <div className="flex-col gap-2">
              {activity?.slice(0, 10).map((act) => (
                <Tile key={act.id} className="mb-1">
                  <div className="card-title">{new Date(act.timestamp).toLocaleString()} • {act.type.toUpperCase()}</div>
                  <div>{act.description}</div>
                  <div className="mt-1">
                    {act.engineId && <Tag size="sm" type="blue">{act.engineId}</Tag>}
                    {act.recommendationId && <Tag size="sm" type="cyan">Rec: {act.recommendationId.slice(0,8)}</Tag>}
                  </div>
                </Tile>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}