// TAT & production-control metrics.
//
// Turnaround time in an engine shop is dominated by waiting, not processing.
// This module derives the production-control view from TCN work-package data:
// queue time vs value-added time, critical path, bottleneck TCNs, and the
// standard KPI set (Queue Time % of TAT, Schedule Adherence, Parts
// Availability, WIP, On-Time Delivery).

import type { WorkPackage, WorkPackageTask } from "./work-package.js";

/** Working hours assumed per calendar day when projecting completion. */
export const WORKING_HOURS_PER_DAY = 8;

const HOUR_MS = 3_600_000;

export interface TatKpis {
  /** Average turnaround (days) across all packages, in-shop and delivered. */
  avgTatDays: number | null;
  /** Share of elapsed shop time spent waiting rather than on value-added work. */
  queueTimePctOfTat: number | null;
  /** % of in-shop packages predicted to complete within their planned TAT. */
  scheduleAdherencePct: number | null;
  /** % of open TCNs not held for parts. */
  partsAvailabilityPct: number | null;
  /** Work packages currently in the shop (not complete). */
  wipCount: number;
  /** % of delivered packages that finished within planned TAT. */
  onTimeDeliveryPct: number | null;
}

export interface EngineFlowRow {
  engineId: string;
  workPackageId: string;
  recommendationId: string;
  failureMode: string;
  /** Current operation: the first incomplete TCN in sequence, if any. */
  currentTcn: string | null;
  currentOperation: string | null;
  currentStatus: string | null;
  /** Hours the package has been in the current operation. */
  timeInOperationHours: number;
  /** Cumulative waiting (non-value-added) hours since induction. */
  queueTimeHours: number;
  /** Cumulative value-added (processing) hours since induction. */
  valueAddedHours: number;
  elapsedDays: number;
  predictedCompletion: string | null;
  plannedCompletion: string | null;
  /** Incomplete TCNs in execution order — the package's critical path. */
  criticalPathTcns: string[];
  /** null when no planned TAT is known. */
  onSchedule: boolean | null;
  complete: boolean;
}

export interface BottleneckAlert {
  tcn: string;
  engineId: string;
  workPackageId: string;
  status: string;
  description: string;
  /** Hours elapsed since the TCN entered its waiting status. */
  waitHours: number;
  /** Downstream TCNs held up by this one. */
  blockedTcns: string[];
}

export interface ProductionControl {
  asOf: string;
  kpis: TatKpis;
  engines: EngineFlowRow[];
  bottlenecks: BottleneckAlert[];
}

function hoursBetween(fromIso: string, to: Date): number {
  return Math.max(0, (to.getTime() - new Date(fromIso).getTime()) / HOUR_MS);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Value-added hours accrued so far on one task. */
function taskValueAddedHours(t: WorkPackageTask, now: Date): number {
  if (t.status === "complete") {
    if (t.startedAt && t.completedAt) {
      // Actual processing time, capped by the work content estimate — time
      // beyond the estimate is treated as waiting, not value-add.
      return Math.min(
        t.estimatedHours,
        hoursBetween(t.startedAt, new Date(t.completedAt)),
      );
    }
    return t.estimatedHours;
  }
  if (t.startedAt && t.status === "in_progress") {
    return Math.min(t.estimatedHours, hoursBetween(t.startedAt, now));
  }
  if (
    t.startedAt &&
    (t.status === "awaiting_parts" || t.status === "awaiting_inspection")
  ) {
    // Work performed before the task parked; updatedAt marks the transition.
    return Math.min(
      t.estimatedHours,
      hoursBetween(t.startedAt, new Date(t.updatedAt)),
    );
  }
  return 0;
}

/** Remaining work content (hours) on one task. */
function taskRemainingHours(t: WorkPackageTask, now: Date): number {
  if (t.status === "complete") return 0;
  return Math.max(0, t.estimatedHours - taskValueAddedHours(t, now));
}

export function computeEngineFlowRow(
  wp: WorkPackage,
  plannedTurnaroundDays: number | null,
  now: Date,
): EngineFlowRow {
  const ordered = [...wp.tasks].sort((a, b) => a.sequence - b.sequence);
  const current = ordered.find((t) => t.status !== "complete") ?? null;
  const lastCompleted = [...ordered]
    .filter((t) => t.status === "complete" && t.completedAt)
    .sort((a, b) => (a.completedAt! < b.completedAt! ? -1 : 1))
    .at(-1);

  const complete = wp.status === "complete";
  const endOfClock = complete && lastCompleted?.completedAt
    ? new Date(lastCompleted.completedAt)
    : now;
  const elapsedHours = hoursBetween(wp.createdAt, endOfClock);
  const valueAddedHours = ordered.reduce(
    (sum, t) => sum + taskValueAddedHours(t, now),
    0,
  );
  const queueTimeHours = Math.max(0, elapsedHours - valueAddedHours);

  const timeInOperationHours = current
    ? hoursBetween(
        current.startedAt ??
          lastCompleted?.completedAt ??
          wp.createdAt,
        now,
      )
    : 0;

  const remainingHours = ordered.reduce(
    (sum, t) => sum + taskRemainingHours(t, now),
    0,
  );
  const predictedCompletion = complete
    ? (lastCompleted?.completedAt ?? null)
    : new Date(
        now.getTime() +
          (remainingHours / WORKING_HOURS_PER_DAY) * 24 * HOUR_MS,
      ).toISOString();
  const plannedCompletion =
    plannedTurnaroundDays != null
      ? new Date(
          new Date(wp.createdAt).getTime() +
            plannedTurnaroundDays * 24 * HOUR_MS,
        ).toISOString()
      : null;

  const onSchedule =
    plannedCompletion && predictedCompletion
      ? predictedCompletion <= plannedCompletion
      : null;

  return {
    engineId: wp.engineId,
    workPackageId: wp.id,
    recommendationId: wp.recommendationId,
    failureMode: wp.failureMode,
    currentTcn: current?.tcn ?? null,
    currentOperation: current?.description ?? null,
    currentStatus: current?.status ?? null,
    timeInOperationHours: round1(timeInOperationHours),
    queueTimeHours: round1(queueTimeHours),
    valueAddedHours: round1(valueAddedHours),
    elapsedDays: round1(elapsedHours / 24),
    predictedCompletion,
    plannedCompletion,
    criticalPathTcns: ordered
      .filter((t) => t.status !== "complete")
      .map((t) => t.tcn),
    onSchedule,
    complete,
  };
}

const WAITING_STATUSES = new Set(["awaiting_parts", "awaiting_inspection"]);

export function computeBottlenecks(
  packages: WorkPackage[],
  now: Date,
): BottleneckAlert[] {
  const alerts: BottleneckAlert[] = [];
  for (const wp of packages) {
    const ordered = [...wp.tasks].sort((a, b) => a.sequence - b.sequence);
    for (const t of ordered) {
      if (!WAITING_STATUSES.has(t.status) || !t.blocksDownstream) continue;
      alerts.push({
        tcn: t.tcn,
        engineId: t.engineId,
        workPackageId: wp.id,
        status: t.status,
        description: t.description,
        // updatedAt marks the last status transition — when the wait began.
        waitHours: round1(hoursBetween(t.updatedAt, now)),
        blockedTcns: ordered
          .filter((o) => o.sequence > t.sequence && o.status !== "complete")
          .map((o) => o.tcn),
      });
    }
  }
  return alerts.sort((a, b) => b.waitHours - a.waitHours);
}

export function computeProductionControl(
  packages: WorkPackage[],
  plannedTurnaroundDaysByRec: Record<string, number>,
  now: Date = new Date(),
): ProductionControl {
  const engines = packages
    .map((wp) =>
      computeEngineFlowRow(
        wp,
        plannedTurnaroundDaysByRec[wp.recommendationId] ?? null,
        now,
      ),
    )
    .sort((a, b) => b.queueTimeHours - a.queueTimeHours);

  const wipRows = engines.filter((r) => !r.complete);
  const deliveredRows = engines.filter((r) => r.complete);

  const totalElapsed = engines.reduce(
    (s, r) => s + r.queueTimeHours + r.valueAddedHours,
    0,
  );
  const totalQueue = engines.reduce((s, r) => s + r.queueTimeHours, 0);

  const allTasks = packages.flatMap((p) => p.tasks);
  const openTasks = allTasks.filter((t) => t.status !== "complete");
  const awaitingParts = openTasks.filter(
    (t) => t.status === "awaiting_parts",
  ).length;

  const wipWithPlan = wipRows.filter((r) => r.onSchedule !== null);
  const deliveredWithPlan = deliveredRows.filter(
    (r) => r.plannedCompletion && r.predictedCompletion,
  );
  const deliveredOnTime = deliveredWithPlan.filter(
    (r) => r.predictedCompletion! <= r.plannedCompletion!,
  ).length;

  const kpis: TatKpis = {
    avgTatDays: engines.length
      ? round1(engines.reduce((s, r) => s + r.elapsedDays, 0) / engines.length)
      : null,
    queueTimePctOfTat:
      totalElapsed > 0 ? round1((totalQueue / totalElapsed) * 100) : null,
    scheduleAdherencePct: wipWithPlan.length
      ? round1(
          (wipWithPlan.filter((r) => r.onSchedule).length /
            wipWithPlan.length) *
            100,
        )
      : null,
    partsAvailabilityPct: openTasks.length
      ? round1((1 - awaitingParts / openTasks.length) * 100)
      : null,
    wipCount: wipRows.length,
    onTimeDeliveryPct: deliveredWithPlan.length
      ? round1((deliveredOnTime / deliveredWithPlan.length) * 100)
      : null,
  };

  return {
    asOf: now.toISOString(),
    kpis,
    engines,
    bottlenecks: computeBottlenecks(packages, now),
  };
}
