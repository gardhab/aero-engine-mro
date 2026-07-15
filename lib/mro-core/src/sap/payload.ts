import type { Priority, Recommendation } from "../types.js";

// Maps our canonical Work Recommendation to an SAP S/4HANA Cloud Maintenance
// Notification (type M2 - maintenance request) payload, following the
// Maintenance Notification OData API shape (API_MAINTENANCENOTIFICATION).

const PRIORITY_MAP: Record<Priority, { code: string; text: string }> = {
  aog: { code: "1", text: "Very high (AOG)" },
  urgent: { code: "2", text: "High" },
  expedite: { code: "3", text: "Medium" },
  routine: { code: "4", text: "Low" },
};

export interface SapNotificationPayload {
  NotificationType: string;
  NotificationText: string;
  Priority: string;
  PriorityText: string;
  TechnicalObjectType: string;
  EquipmentName: string;
  MalfunctionEffectText: string;
  RequiredStartDate?: string;
  RequiredEndDate?: string;
  to_NotificationLongText: { LongText: string }[];
  to_MaintNotifItem: {
    MaintNotifItemText: string;
    to_MaintNotifItemCause: { CauseText: string }[];
    to_MaintNotifActivity: {
      ActivityText: string;
      ActivityCode: string;
    }[];
  }[];
  _mro: {
    recommendationId: string;
    ruleId: string;
    confidence: number;
    severity: number;
    regulatoryRefs: string[];
  };
}

export function toSapPayload(rec: Recommendation): SapNotificationPayload {
  const pr = PRIORITY_MAP[rec.priority];
  return {
    NotificationType: "M2",
    NotificationText:
      `${rec.failureMode} - ${rec.engineModel} ESN ${rec.engineId}`.slice(0, 40),
    Priority: pr.code,
    PriorityText: pr.text,
    TechnicalObjectType: "EQUI",
    EquipmentName: `ESN-${rec.engineId}`,
    MalfunctionEffectText: rec.faultDescription,
    RequiredStartDate: rec.recommendedInductionDate ?? undefined,
    RequiredEndDate: rec.recommendedCompletionDate ?? undefined,
    to_NotificationLongText: [
      {
        LongText:
          `${rec.faultDescription}\n\nWorkscope: ${rec.workscopeLevel}\n` +
          `Confidence: ${(rec.confidence * 100).toFixed(0)}% | Severity: ${(rec.severity * 100).toFixed(0)}%\n` +
          `Detected by rule: ${rec.ruleName} (${rec.ruleId})\n` +
          `Regulatory: ${rec.regulatoryRefs.join(", ")}`,
      },
    ],
    to_MaintNotifItem: rec.tasks.map((t) => ({
      MaintNotifItemText: t.description.slice(0, 40),
      to_MaintNotifItemCause: [{ CauseText: rec.failureMode }],
      to_MaintNotifActivity: [
        { ActivityText: t.description.slice(0, 40), ActivityCode: t.ataCode },
      ],
    })),
    _mro: {
      recommendationId: rec.id,
      ruleId: rec.ruleId,
      confidence: rec.confidence,
      severity: rec.severity,
      regulatoryRefs: rec.regulatoryRefs,
    },
  };
}
