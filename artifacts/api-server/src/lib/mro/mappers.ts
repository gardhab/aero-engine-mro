import type {
  ActivityRow,
  BacktestRunRow,
  EngineRow,
  OntologyVersionRow,
  ReadingRow,
  RecommendationRow,
  RuleRow,
  SapNotificationRow,
} from "@workspace/db";
import type {
  ActivityEvent,
  ActivityType,
  BacktestRun,
  Engine,
  EngineStatus,
  Ontology,
  ParameterReading,
  Priority,
  Recommendation,
  RecommendationStatus,
  Rule,
  RuleOperator,
  SapNotification,
} from "@workspace/mro-core";

export function toEngine(row: EngineRow, openRecommendations: number): Engine {
  return {
    esn: row.esn,
    model: row.model,
    tailNumber: row.tailNumber,
    operator: row.operator,
    status: row.status as EngineStatus,
    healthScore: row.healthScore,
    tsn: row.tsn,
    csn: row.csn,
    tso: row.tso,
    cso: row.cso,
    egtMargin: row.egtMargin,
    openRecommendations,
    lastUpdated: row.lastUpdated.toISOString(),
  };
}

export function toReading(row: ReadingRow): ParameterReading {
  return {
    engineId: row.engineId,
    parameter: row.parameter,
    label: row.label,
    value: row.value,
    unit: row.unit,
    cycle: row.cycle,
    timestamp: row.timestamp.toISOString(),
    status: row.status as ParameterReading["status"],
  };
}

export function toRule(row: RuleRow): Rule {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    failureMode: row.failureMode,
    parameter: row.parameter,
    operator: row.operator as RuleOperator,
    threshold: row.threshold,
    consecutiveCycles: row.consecutiveCycles,
    severity: row.severity,
    enabled: row.enabled,
    autoApprove: row.autoApprove,
    component: row.component,
    recommendedTaskCode: row.recommendedTaskCode,
    regulatoryRefs: row.regulatoryRefs,
  };
}

export function toRecommendation(row: RecommendationRow): Recommendation {
  return {
    id: row.id,
    engineId: row.engineId,
    engineModel: row.engineModel,
    tailNumber: row.tailNumber,
    component: row.component,
    failureMode: row.failureMode,
    faultDescription: row.faultDescription,
    priority: row.priority as Priority,
    severity: row.severity,
    confidence: row.confidence,
    status: row.status as RecommendationStatus,
    tasks: row.tasks,
    requiredSkills: row.requiredSkills,
    estimatedDurationHours: row.estimatedDurationHours,
    turnaroundDays: row.turnaroundDays,
    workscopeLevel: row.workscopeLevel,
    affectedModules: row.affectedModules,
    lifeLimitedParts: row.lifeLimitedParts,
    evidence: row.evidence,
    regulatoryRefs: row.regulatoryRefs,
    ruleId: row.ruleId,
    ruleName: row.ruleName,
    recommendedInductionDate: row.recommendedInductionDate,
    recommendedCompletionDate: row.recommendedCompletionDate,
    sapNotificationNumber: row.sapNotificationNumber,
    reviewedBy: row.reviewedBy,
    reviewNotes: row.reviewNotes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toSapNotification(row: SapNotificationRow): SapNotification {
  return {
    id: row.id,
    recommendationId: row.recommendationId,
    notificationNumber: row.notificationNumber,
    status: row.status as SapNotification["status"],
    mode: (row.mode ?? undefined) as SapNotification["mode"],
    errorMessage: row.errorMessage,
    payload: row.payload,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toBacktestRun(row: BacktestRunRow): BacktestRun {
  return {
    id: row.id,
    name: row.name,
    engineId: row.engineId,
    failureMode: row.failureMode,
    totalCycles: row.totalCycles,
    recommendationsGenerated: row.recommendationsGenerated ?? undefined,
    recordedActions: row.recordedActions ?? undefined,
    leadTimeCycles: row.leadTimeCycles,
    precision: row.precision,
    recall: row.recall,
    createdAt: row.createdAt.toISOString(),
    rows: row.rows,
  };
}

export function toActivity(row: ActivityRow): ActivityEvent {
  return {
    id: row.id,
    timestamp: row.timestamp.toISOString(),
    type: row.type as ActivityType,
    description: row.description,
    engineId: row.engineId,
    recommendationId: row.recommendationId,
  };
}

export function toOntology(row: OntologyVersionRow): Ontology {
  return {
    version: row.version,
    status: row.status as Ontology["status"],
    classes: row.classes,
    relationships: row.relationships,
    updatedAt: row.createdAt.toISOString(),
  };
}
