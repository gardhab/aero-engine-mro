// TCN-tracked shop-visit work packages.
//
// When a work recommendation is approved, its maintenance tasks are expanded
// into a work package: one execution record per task, each carrying a unique
// Task Control Number (TCN). TCNs give planned/tracked/controlled execution
// with full traceability back to the engine, module and source recommendation,
// mirroring real MRO production-control practice.

export type WorkPackageTaskStatus =
  | "not_started"
  | "in_progress"
  | "awaiting_parts"
  | "awaiting_inspection"
  | "complete";

export const WORK_PACKAGE_TASK_STATUSES: WorkPackageTaskStatus[] = [
  "not_started",
  "in_progress",
  "awaiting_parts",
  "awaiting_inspection",
  "complete",
];

export interface WorkPackageTask {
  id: string;
  tcn: string;
  workPackageId: string;
  recommendationId: string;
  engineId: string;
  module: string;
  sequence: number;
  description: string;
  ataCode: string;
  s1000dCode?: string | null;
  skill: string;
  estimatedHours: number;
  status: WorkPackageTaskStatus;
  /** TCN of the earlier incomplete task this one is waiting on, if any. */
  blockedByTcn?: string | null;
  /** True when this task is incomplete and later tasks in the package wait on it. */
  blocksDownstream: boolean;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type WorkPackageStatus =
  | "not_started"
  | "in_progress"
  | "complete";

export interface WorkPackage {
  id: string;
  recommendationId: string;
  engineId: string;
  failureMode: string;
  component: string;
  status: WorkPackageStatus;
  taskCount: number;
  completedTaskCount: number;
  createdAt: string;
  tasks: WorkPackageTask[];
}

/** Format a TCN from its allocated sequence number (e.g. 1 -> TCN-1001). */
export function formatTcn(tcnSeq: number): string {
  return `TCN-${1000 + tcnSeq}`;
}

/** Roll a package status up from its task statuses. */
export function rollupWorkPackageStatus(
  statuses: WorkPackageTaskStatus[],
): WorkPackageStatus {
  if (statuses.length > 0 && statuses.every((s) => s === "complete")) {
    return "complete";
  }
  if (statuses.some((s) => s !== "not_started")) return "in_progress";
  return "not_started";
}

/**
 * Compute blocking relations for a package's tasks, ordered by sequence.
 * A task is blocked by the nearest earlier incomplete task; an incomplete
 * task with later tasks behind it blocks downstream work (e.g. an
 * Awaiting Parts inspection holding up assembly).
 */
export function withBlockingFlags<
  T extends { sequence: number; status: WorkPackageTaskStatus; tcn: string },
>(tasks: T[]): (T & { blockedByTcn: string | null; blocksDownstream: boolean })[] {
  const ordered = [...tasks].sort((a, b) => a.sequence - b.sequence);
  return ordered.map((t, i) => {
    const priorIncomplete = ordered
      .slice(0, i)
      .filter((p) => p.status !== "complete")
      .at(-1);
    const blocksDownstream =
      t.status !== "complete" && i < ordered.length - 1;
    return {
      ...t,
      blockedByTcn: priorIncomplete?.tcn ?? null,
      blocksDownstream,
    };
  });
}
