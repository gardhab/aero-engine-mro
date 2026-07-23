import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import {
  activityTable,
  db,
  recommendationsTable,
  workPackageTasksTable,
  type RecommendationRow,
  type WorkPackageTaskRow,
} from "@workspace/db";
import {
  computeProductionControl,
  formatTcn,
  rollupWorkPackageStatus,
  withBlockingFlags,
  WORK_PACKAGE_TASK_STATUSES,
  type WorkPackage,
  type WorkPackageTask,
  type WorkPackageTaskStatus,
} from "@workspace/mro-core";
import { logActivity } from "./activity";
import { logger } from "../logger";
import {
  ensureOperationsRequestForWorkPackage,
  syncSegmentStatus,
} from "./equipment-hierarchy";

function toWorkPackageTaskBase(row: WorkPackageTaskRow) {
  return {
    id: row.id,
    tcn: formatTcn(row.tcnSeq),
    workPackageId: row.workPackageId,
    recommendationId: row.recommendationId,
    engineId: row.engineId,
    module: row.module,
    sequence: row.sequence,
    description: row.description,
    ataCode: row.ataCode,
    s1000dCode: row.s1000dCode,
    skill: row.skill,
    estimatedHours: row.estimatedHours,
    status: row.status as WorkPackageTaskStatus,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Group task rows into WorkPackages with blocking flags and rolled-up status. */
export function toWorkPackages(
  taskRows: WorkPackageTaskRow[],
  recsById: Map<string, Pick<RecommendationRow, "failureMode" | "component">>,
): WorkPackage[] {
  const byPackage = new Map<string, WorkPackageTaskRow[]>();
  for (const row of taskRows) {
    const list = byPackage.get(row.workPackageId) ?? [];
    list.push(row);
    byPackage.set(row.workPackageId, list);
  }
  const packages: WorkPackage[] = [];
  for (const [workPackageId, rows] of byPackage) {
    const tasks: WorkPackageTask[] = withBlockingFlags(
      rows.map(toWorkPackageTaskBase),
    );
    const rec = recsById.get(rows[0].recommendationId);
    const statuses = tasks.map((t) => t.status);
    packages.push({
      id: workPackageId,
      recommendationId: rows[0].recommendationId,
      engineId: rows[0].engineId,
      failureMode: rec?.failureMode ?? "Unknown",
      component: rec?.component ?? "Unknown",
      status: rollupWorkPackageStatus(statuses),
      taskCount: tasks.length,
      completedTaskCount: statuses.filter((s) => s === "complete").length,
      createdAt: rows
        .map((r) => r.createdAt.toISOString())
        .sort()[0],
      tasks,
    });
  }
  return packages.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** All work-package tasks mapped to domain objects (for the graph projection). */
export async function loadAllWorkPackageTasks(): Promise<WorkPackageTask[]> {
  const rows = await db.select().from(workPackageTasksTable);
  const byPackage = new Map<string, WorkPackageTaskRow[]>();
  for (const row of rows) {
    const list = byPackage.get(row.workPackageId) ?? [];
    list.push(row);
    byPackage.set(row.workPackageId, list);
  }
  const out: WorkPackageTask[] = [];
  for (const group of byPackage.values()) {
    out.push(...withBlockingFlags(group.map(toWorkPackageTaskBase)));
  }
  return out;
}

/**
 * Spawn the TCN-tracked work package for an approved recommendation.
 * Idempotent: does nothing if the recommendation already has a package.
 * TCNs are allocated by the database identity column, so numbers are unique
 * across the whole shop (TCN-1001, TCN-1002, ...).
 */
export async function ensureWorkPackageForRecommendation(
  rec: Pick<
    RecommendationRow,
    "id" | "engineId" | "failureMode" | "tasks" | "affectedModules"
  >,
): Promise<boolean> {
  if (rec.tasks.length === 0) return false;

  const workPackageId = randomUUID();
  const module = rec.affectedModules[0] ?? "";
  // Idempotent under concurrency: the unique (recommendationId, sequence)
  // index makes a concurrent duplicate insert a no-op rather than a second
  // package. Values are inserted atomically, so a conflict skips them all.
  const inserted = await db
    .insert(workPackageTasksTable)
    .values(
      rec.tasks.map((t, i) => ({
        id: randomUUID(),
        workPackageId,
        recommendationId: rec.id,
        engineId: rec.engineId,
        module,
        sequence: i + 1,
        description: t.description,
        ataCode: t.ataCode,
        s1000dCode: t.s1000dCode ?? null,
        skill: t.skill,
        estimatedHours: t.estimatedHours,
        status: "not_started",
      })),
    )
    .onConflictDoNothing()
    .returning({ tcnSeq: workPackageTasksTable.tcnSeq });
  if (inserted.length === 0) return false;
  const tcns = inserted.map((r) => formatTcn(r.tcnSeq));
  await logActivity(
    "work_package",
    `Work package created for ${rec.engineId} (${rec.failureMode}): ${tcns.join(", ")}.`,
    { engineId: rec.engineId, recommendationId: rec.id },
  );
  logger.info({ recommendationId: rec.id, tcns }, "Created TCN work package");

  // Bridge to ISA-95 execution model: create matching OperationsRequest +
  // OperationSegments so the same work is visible in the ISA-95 layer.
  // Done asynchronously so it never blocks the TCN path.
  const freshTasks = await db
    .select()
    .from(workPackageTasksTable)
    .where(eq(workPackageTasksTable.workPackageId, workPackageId));
  await ensureOperationsRequestForWorkPackage(
    workPackageId,
    rec.id,
    rec.engineId,
    freshTasks.map((t) => ({
      id: t.id,
      tcn: formatTcn(t.tcnSeq),
      sequence: t.sequence,
      status: t.status,
      startedAt: t.startedAt,
      completedAt: t.completedAt,
      createdAt: t.createdAt,
    })),
  ).catch((e) =>
    logger.warn({ err: e }, "Failed to sync operations request for work package"),
  );

  return true;
}

/** Backfill work packages for recommendations approved before this feature. */
export async function ensureWorkPackagesSeeded(): Promise<void> {
  const rows = await db
    .select()
    .from(recommendationsTable)
    .where(inArray(recommendationsTable.status, ["approved", "pushed"]));
  let created = 0;
  for (const rec of rows) {
    if (await ensureWorkPackageForRecommendation(rec)) created += 1;
  }
  if (created > 0) {
    logger.info({ created }, "Backfilled work packages for approved recommendations");
  }
}

/**
 * One-time seeded execution history so TAT metrics are meaningful on a fresh
 * database: backdates package induction, completes and starts some TCNs with
 * realistic queue gaps, and leaves one TCN parked in Awaiting Parts.
 * Idempotent: skipped as soon as any task carries a completion timestamp or a
 * backdated creation date.
 */
const TAT_HISTORY_SEED_MARKER =
  "Seeded TCN execution history for TAT/production-control metrics.";

export async function ensureTatHistorySeeded(
  now: Date = new Date(),
): Promise<void> {
  // Persistent gate: the marker activity row proves seeding already ran once
  // on this database — never re-run, regardless of what the data looks like.
  const marker = await db
    .select({ id: activityTable.id })
    .from(activityTable)
    .where(eq(activityTable.description, TAT_HISTORY_SEED_MARKER))
    .limit(1);
  if (marker.length > 0) return;

  const rows = await db.select().from(workPackageTasksTable);
  if (rows.length === 0) return;
  const dayMs = 86_400_000;

  const byPackage = new Map<string, WorkPackageTaskRow[]>();
  for (const r of rows) {
    const list = byPackage.get(r.workPackageId) ?? [];
    list.push(r);
    byPackage.set(r.workPackageId, list);
  }

  let i = 0;
  for (const group of byPackage.values()) {
    const ordered = [...group].sort((a, b) => a.sequence - b.sequence);
    // Non-destructive: never rewrite a package that shows real progression
    // (any status change or execution timestamp) — only untouched packages
    // receive synthetic history.
    const progressed = ordered.some(
      (t) =>
        t.status !== "not_started" ||
        t.startedAt !== null ||
        t.completedAt !== null ||
        now.getTime() - t.createdAt.getTime() > 2 * dayMs,
    );
    if (progressed) {
      i += 1;
      continue;
    }
    // Stagger inductions: 16, 22, 28... days ago.
    const inducted = new Date(now.getTime() - (16 + i * 6) * dayMs);
    for (const t of ordered) {
      await db
        .update(workPackageTasksTable)
        .set({ createdAt: inducted, updatedAt: inducted })
        .where(eq(workPackageTasksTable.id, t.id));
    }
    const first = ordered[0];
    const second = ordered[1];
    if (i % 2 === 0 && first) {
      // First TCN done after a 2-day induction queue; follow-on task started
      // late after a 3-day hand-off queue and is now parked awaiting parts.
      const started = new Date(inducted.getTime() + 2 * dayMs);
      const completed = new Date(
        started.getTime() + first.estimatedHours * 3_600_000 * 2,
      );
      await db
        .update(workPackageTasksTable)
        .set({
          status: "complete",
          startedAt: started,
          completedAt: completed,
          updatedAt: completed,
        })
        .where(eq(workPackageTasksTable.id, first.id));
      if (second) {
        const secondStart = new Date(completed.getTime() + 3 * dayMs);
        const parked = new Date(secondStart.getTime() + 1 * dayMs);
        await db
          .update(workPackageTasksTable)
          .set({
            status: "awaiting_parts",
            startedAt: secondStart,
            updatedAt: parked,
          })
          .where(eq(workPackageTasksTable.id, second.id));
      }
    } else if (first) {
      // First TCN started after a 4-day induction queue, worked its estimate,
      // then parked in Awaiting Inspection — blocking every downstream TCN.
      const started = new Date(inducted.getTime() + 4 * dayMs);
      const parked = new Date(
        started.getTime() + first.estimatedHours * 3_600_000 + 5 * dayMs,
      );
      await db
        .update(workPackageTasksTable)
        .set({
          status: "awaiting_inspection",
          startedAt: started,
          updatedAt: parked,
        })
        .where(eq(workPackageTasksTable.id, first.id));
    }
    i += 1;
  }
  await logActivity("work_package", TAT_HISTORY_SEED_MARKER);
  logger.info("Seeded work-package execution history for TAT metrics");
}

/** Production-control view: KPI set, engine flow board and bottleneck TCNs. */
export async function getProductionControl(now: Date = new Date()) {
  const packages = await listWorkPackages({});
  const recIds = [...new Set(packages.map((p) => p.recommendationId))];
  const recs = recIds.length
    ? await db
        .select({
          id: recommendationsTable.id,
          turnaroundDays: recommendationsTable.turnaroundDays,
        })
        .from(recommendationsTable)
        .where(inArray(recommendationsTable.id, recIds))
    : [];
  const planned: Record<string, number> = {};
  for (const r of recs) planned[r.id] = r.turnaroundDays;
  return computeProductionControl(packages, planned, now);
}

export type UpdateTaskStatusResult =
  | { kind: "not_found" }
  | { kind: "invalid_status"; message: string }
  | { kind: "updated"; workPackage: WorkPackage };

/** Update one TCN's execution status, keeping the audit trail. */
export async function updateWorkPackageTaskStatus(
  taskId: string,
  status: string,
  updatedBy?: string,
): Promise<UpdateTaskStatusResult> {
  if (!WORK_PACKAGE_TASK_STATUSES.includes(status as WorkPackageTaskStatus)) {
    return {
      kind: "invalid_status",
      message: `Invalid status "${status}". Expected one of: ${WORK_PACKAGE_TASK_STATUSES.join(", ")}.`,
    };
  }
  const [row] = await db
    .select()
    .from(workPackageTasksTable)
    .where(eq(workPackageTasksTable.id, taskId));
  if (!row) return { kind: "not_found" };

  const now = new Date();
  await db
    .update(workPackageTasksTable)
    .set({
      status,
      startedAt:
        row.startedAt ?? (status !== "not_started" ? now : null),
      completedAt: status === "complete" ? (row.completedAt ?? now) : null,
      updatedAt: now,
    })
    .where(eq(workPackageTasksTable.id, taskId));

  const tcn = formatTcn(row.tcnSeq);
  await logActivity(
    "work_package",
    `${tcn} on ${row.engineId} set to ${status.replace(/_/g, " ")}${updatedBy ? ` by ${updatedBy}` : ""}.`,
    { engineId: row.engineId, recommendationId: row.recommendationId },
  );

  // Keep ISA-95 OperationSegment in sync with TCN status.
  const updatedRow = await db
    .select()
    .from(workPackageTasksTable)
    .where(eq(workPackageTasksTable.id, taskId))
    .then((r) => r[0]);
  if (updatedRow) {
    syncSegmentStatus(
      taskId,
      status,
      updatedRow.startedAt,
      updatedRow.completedAt,
    ).catch((e) => logger.warn({ err: e }, "Failed to sync segment status"));
  }

  const packageRows = await db
    .select()
    .from(workPackageTasksTable)
    .where(eq(workPackageTasksTable.workPackageId, row.workPackageId));
  const [rec] = await db
    .select({
      failureMode: recommendationsTable.failureMode,
      component: recommendationsTable.component,
    })
    .from(recommendationsTable)
    .where(eq(recommendationsTable.id, row.recommendationId));
  const recsById = new Map([[row.recommendationId, rec ?? { failureMode: "Unknown", component: "Unknown" }]]);
  return { kind: "updated", workPackage: toWorkPackages(packageRows, recsById)[0] };
}

/** List work packages, optionally filtered by engine or recommendation. */
export async function listWorkPackages(filter: {
  engineId?: string;
  recommendationId?: string;
}): Promise<WorkPackage[]> {
  const conditions = [];
  if (filter.engineId) {
    conditions.push(eq(workPackageTasksTable.engineId, filter.engineId));
  }
  if (filter.recommendationId) {
    conditions.push(
      eq(workPackageTasksTable.recommendationId, filter.recommendationId),
    );
  }
  const rows = await db
    .select()
    .from(workPackageTasksTable)
    .where(conditions.length ? and(...conditions) : undefined);
  const recIds = [...new Set(rows.map((r) => r.recommendationId))];
  const recs = recIds.length
    ? await db
        .select({
          id: recommendationsTable.id,
          failureMode: recommendationsTable.failureMode,
          component: recommendationsTable.component,
        })
        .from(recommendationsTable)
        .where(inArray(recommendationsTable.id, recIds))
    : [];
  const recsById = new Map(
    recs.map((r) => [r.id, { failureMode: r.failureMode, component: r.component }]),
  );
  return toWorkPackages(rows, recsById);
}
