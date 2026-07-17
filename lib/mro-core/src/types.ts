// Canonical domain types for the aircraft-engine MRO decision-support system.
// These mirror the OpenAPI contract (lib/api-spec/openapi.yaml) so that objects
// produced by the domain layer validate cleanly against the generated Zod schemas.

export type EngineStatus =
  | "operational"
  | "monitor"
  | "action_required"
  | "grounded";

export type RecommendationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "pushed"
  | "failed";

export type Priority = "routine" | "expedite" | "urgent" | "aog";

export type RagBucketType = "red" | "amber" | "green";

export type ReadingStatus = "normal" | "caution" | "warning";

export type Trend = "stable" | "rising" | "falling";

export interface Engine {
  esn: string;
  model: string;
  tailNumber: string;
  operator?: string | null;
  status: EngineStatus;
  healthScore: number;
  tsn: number;
  csn: number;
  tso: number;
  cso: number;
  egtMargin?: number | null;
  openRecommendations: number;
  lastUpdated: string;
}

export interface ParameterReading {
  engineId: string;
  parameter: string;
  label: string;
  value: number;
  unit: string;
  cycle: number;
  timestamp: string;
  status: ReadingStatus;
}

export interface ParameterHealth {
  parameter: string;
  label: string;
  value: number;
  unit: string;
  baseline?: number | null;
  limit?: number | null;
  trend: Trend;
  status: ReadingStatus;
}

export interface ModuleHealth {
  module: string;
  status: ReadingStatus;
  note?: string | null;
}

export interface EngineHealth {
  esn: string;
  model: string;
  healthScore: number;
  status: EngineStatus;
  parameters: ParameterHealth[];
  moduleHealth: ModuleHealth[];
}

export interface Evidence {
  parameter: string;
  label: string;
  value: number;
  unit: string;
  cycle: number;
  timestamp: string;
  threshold?: number | null;
  description: string;
}

export interface MaintenanceTask {
  ataCode: string;
  s1000dCode?: string | null;
  description: string;
  skill: string;
  estimatedHours: number;
}

export interface LifeLimitedPart {
  partNumber: string;
  description: string;
  cyclesRemaining?: number | null;
}

export interface Recommendation {
  id: string;
  engineId: string;
  engineModel: string;
  tailNumber: string;
  component: string;
  failureMode: string;
  faultDescription: string;
  priority: Priority;
  /** Repair category 1 (Airworthiness Mandatory) … 7 (Cosmetic). */
  repairCategory: number;
  repairCategoryName: string;
  /** Operational bucket: red = Must Do, amber = Should Do, green = Could Do. */
  ragBucket: RagBucketType;
  /** True when the engine cannot be released to service without this repair. */
  releaseHold: boolean;
  severity: number;
  confidence: number;
  status: RecommendationStatus;
  tasks: MaintenanceTask[];
  requiredSkills: string[];
  estimatedDurationHours: number;
  turnaroundDays: number;
  workscopeLevel: string;
  affectedModules: string[];
  lifeLimitedParts: LifeLimitedPart[];
  evidence: Evidence[];
  regulatoryRefs: string[];
  ruleId: string;
  ruleName: string;
  recommendedInductionDate?: string | null;
  recommendedCompletionDate?: string | null;
  sapNotificationNumber?: string | null;
  reviewedBy?: string | null;
  reviewNotes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type RuleOperator = "lt" | "gt" | "trend_down" | "trend_up";

export interface Rule {
  id: string;
  name: string;
  description: string;
  failureMode: string;
  parameter: string;
  operator: RuleOperator;
  threshold: number;
  consecutiveCycles: number;
  severity: number;
  enabled: boolean;
  autoApprove: boolean;
  component: string;
  recommendedTaskCode?: string | null;
  regulatoryRefs: string[];
}

export interface OntologyAttribute {
  name: string;
  type: string;
  description?: string | null;
}

export interface OntologyClass {
  id: string;
  label: string;
  description: string;
  parentClass?: string | null;
  deprecated: boolean;
  attributes: OntologyAttribute[];
  instanceCount: number;
  ruleCount: number;
}

export interface OntologyRelationship {
  id: string;
  label: string;
  domain: string;
  range: string;
  description?: string | null;
  deprecated: boolean;
}

export interface Ontology {
  version: string;
  status: "draft" | "published";
  classes: OntologyClass[];
  relationships: OntologyRelationship[];
  updatedAt: string;
}

export interface OntologyValidationIssue {
  severity: "error" | "warning";
  message: string;
  target?: string | null;
}

export interface OntologyImpact {
  target: string;
  ruleCount: number;
  nodeCount: number;
  message: string;
}

export interface OntologyValidationResult {
  valid: boolean;
  issues: OntologyValidationIssue[];
  impacts: OntologyImpact[];
}

export interface GraphNode {
  id: string;
  type: string;
  label: string;
  properties: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export type SapMode = "mock" | "live";

export interface SapStatus {
  mode: SapMode;
  configured: boolean;
  baseUrl?: string | null;
  notificationType: string;
}

export interface SapNotification {
  id: string;
  recommendationId: string;
  notificationNumber?: string | null;
  status: "success" | "failed";
  mode?: SapMode;
  errorMessage?: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface BacktestResultRow {
  cycle: number;
  predicted: boolean;
  actual: boolean;
  outcome:
    | "true_positive"
    | "false_positive"
    | "true_negative"
    | "false_negative";
  note?: string | null;
}

export interface BacktestRun {
  id: string;
  name: string;
  engineId: string;
  failureMode: string;
  totalCycles: number;
  recommendationsGenerated?: number;
  recordedActions?: number;
  leadTimeCycles: number;
  precision: number;
  recall: number;
  createdAt: string;
  rows: BacktestResultRow[];
}

export type ActivityType =
  | "recommendation"
  | "approval"
  | "rejection"
  | "sap_push"
  | "pipeline"
  | "ontology"
  | "backtest"
  | "exchange"
  | "work_package";

export interface ActivityEvent {
  id: string;
  timestamp: string;
  type: ActivityType;
  description: string;
  engineId?: string | null;
  recommendationId?: string | null;
}

export interface PipelineResult {
  enginesEvaluated: number;
  rulesFired: number;
  recommendationsCreated: number;
  newRecommendationIds: string[];
}

export interface DashboardStatusCounts {
  operational: number;
  monitor: number;
  actionRequired: number;
  grounded: number;
}

export interface DashboardPriorityCounts {
  routine: number;
  expedite: number;
  urgent: number;
  aog: number;
}

export interface FleetRisk {
  esn: string;
  model: string;
  healthScore: number;
  topFailureMode: string;
}

export interface DashboardSummary {
  fleetSize: number;
  statusCounts: DashboardStatusCounts;
  priorityCounts: DashboardPriorityCounts;
  pendingRecommendations: number;
  approvedRecommendations?: number;
  pushedToSap: number;
  avgHealthScore: number;
  topRisks: FleetRisk[];
}
