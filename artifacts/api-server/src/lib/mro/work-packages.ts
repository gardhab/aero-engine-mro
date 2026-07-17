import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  recommendationsTable,
  workPackageTasksTable,
  type RecommendationRow,
  type WorkPackageTaskRow,
} from "@workspace/db";
import {
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
  logger.info(
    { recommendationId: rec.id, tcns },
    "Created TCN work package",
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
