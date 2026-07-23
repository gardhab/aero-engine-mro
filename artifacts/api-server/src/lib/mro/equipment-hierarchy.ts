/**
 * ISA-95 Equipment Hierarchy — seed and query helpers.
 * Idempotent seed: one MRO Enterprise → Site → MRO Areas → Work Centres.
 * The TCN ↔ OperationSegment bridge: ensureOperationSegmentsForWorkPackage
 * keeps the two execution systems in sync.
 */
import { eq, inArray, sql } from "drizzle-orm";
import {
  db,
  enterprisesTable,
  sitesTable,
  areasTable,
  workCentersTable,
  workUnitsTable,
  operationsRequestsTable,
  operationSegmentsTable,
  personnelClassesTable,
  type WorkCenterRow,
} from "@workspace/db";
import { logger } from "../logger";
import { logActivity } from "./activity";

const HIERARCHY_SEED_MARKER = "ISA-95 equipment hierarchy seeded";

export async function ensureEquipmentHierarchySeeded(): Promise<void> {
  // Persistent gate — skip if already run on this database.
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(enterprisesTable);
  if (n > 0) return;

  logger.info("Seeding ISA-95 equipment hierarchy");

  // Enterprise
  const [enterprise] = await db
    .insert(enterprisesTable)
    .values({ name: "Aero Engine MRO Ltd", enterpriseId: "AEM-001" })
    .returning();

  // Site
  const [site] = await db
    .insert(sitesTable)
    .values({
      enterpriseId: enterprise.id,
      name: "London MRO Centre",
      icaoCode: "EGLL",
    })
    .returning();

  // Areas
  const [disassembly, moduleRepair, testCell, partsStore] = await db
    .insert(areasTable)
    .values([
      { siteId: site.id, name: "Engine Disassembly", areaType: "ENGINE_DISASSEMBLY" },
      { siteId: site.id, name: "Module Repair", areaType: "MODULE_REPAIR" },
      { siteId: site.id, name: "Test Cell", areaType: "TEST_CELL" },
      { siteId: site.id, name: "Parts Store", areaType: "PARTS_STORE" },
    ])
    .returning();

  // Work Centres
  await db.insert(workCentersTable).values([
    {
      areaId: disassembly.id,
      name: "Borescope Bay",
      workCenterType: "BORESCOPE",
      capacity: 3,
    },
    {
      areaId: disassembly.id,
      name: "Receiving Inspection",
      workCenterType: "NDT",
      capacity: 2,
    },
    {
      areaId: moduleRepair.id,
      name: "Blade Repair",
      workCenterType: "BLADE_REPAIR",
      capacity: 4,
    },
    {
      areaId: moduleRepair.id,
      name: "NDT Lab",
      workCenterType: "NDT",
      capacity: 2,
    },
    {
      areaId: moduleRepair.id,
      name: "Combustion Section",
      workCenterType: "COMBUSTION",
      capacity: 2,
    },
    {
      areaId: testCell.id,
      name: "Engine Test Cell A",
      workCenterType: "TEST_CELL",
      capacity: 1,
    },
    {
      areaId: testCell.id,
      name: "Engine Test Cell B",
      workCenterType: "TEST_CELL",
      capacity: 1,
    },
    {
      areaId: moduleRepair.id,
      name: "Balancing",
      workCenterType: "BALANCING",
      capacity: 2,
    },
  ]);

  // Personnel Classes
  await db.insert(personnelClassesTable).values([
    {
      classCode: "B1_MECHANICAL",
      name: "Licensed Aircraft Maintenance Engineer — B1 Mechanical",
      qualifications: [{ qualificationCode: "EASA Part-66 B1", regulatoryAuthority: "EASA" }],
    },
    {
      classCode: "BORESCOPE",
      name: "Borescope Inspector",
      qualifications: [
        { qualificationCode: "EASA Part-66 B1", regulatoryAuthority: "EASA" },
        { qualificationCode: "OEM Borescope Approval", regulatoryAuthority: "Rolls-Royce" },
      ],
    },
    {
      classCode: "NDT_LII",
      name: "NDT Inspector Level II",
      qualifications: [{ qualificationCode: "EN4179 NDT Level II", regulatoryAuthority: "EN4179" }],
    },
    {
      classCode: "BLADE_REPAIR",
      name: "Blade Repair Technician",
      qualifications: [
        { qualificationCode: "EASA Part-66 B1", regulatoryAuthority: "EASA" },
        { qualificationCode: "Blade Repair Approval", regulatoryAuthority: "Rolls-Royce" },
      ],
    },
    {
      classCode: "QUALITY_INSPECTOR",
      name: "Quality Inspector / Certifying Staff",
      qualifications: [{ qualificationCode: "EASA Part-66 B1", regulatoryAuthority: "EASA" }],
    },
  ]);

  await logActivity("work_package", HIERARCHY_SEED_MARKER);
  logger.info("ISA-95 equipment hierarchy seeded");
}

/** Return all work centres with their area context. */
export async function listWorkCentres(): Promise<WorkCentreWithContext[]> {
  const rows = await db
    .select({
      wc: workCentersTable,
      area: areasTable,
      site: sitesTable,
    })
    .from(workCentersTable)
    .innerJoin(areasTable, eq(workCentersTable.areaId, areasTable.id))
    .innerJoin(sitesTable, eq(areasTable.siteId, sitesTable.id));

  // Attach active segment counts
  const ids = rows.map((r) => r.wc.id);
  const counts =
    ids.length > 0
      ? await db
          .select({
            wcId: operationSegmentsTable.assignedWorkCenterId,
            status: operationSegmentsTable.segmentStatus,
            n: sql<number>`count(*)::int`,
          })
          .from(operationSegmentsTable)
          .where(
            inArray(operationSegmentsTable.assignedWorkCenterId, ids),
          )
          .groupBy(
            operationSegmentsTable.assignedWorkCenterId,
            operationSegmentsTable.segmentStatus,
          )
      : [];

  return rows.map(({ wc, area, site }) => {
    const wcCounts = counts.filter((c) => c.wcId === wc.id);
    const byStatus: Record<string, number> = {};
    let activeCount = 0;
    for (const c of wcCounts) {
      byStatus[c.status] = c.n;
      if (c.status !== "COMPLETE" && c.status !== "SKIPPED" && c.status !== "PENDING") {
        activeCount += c.n;
      }
    }
    return {
      id: wc.id,
      name: wc.name,
      workCenterType: wc.workCenterType,
      capacity: wc.capacity,
      areaName: area.name,
      areaType: area.areaType,
      siteName: site.name,
      twinState: wc.twinState,
      activeCount,
      utilisationPct: wc.capacity > 0 ? Math.round((activeCount / wc.capacity) * 100) : 0,
      byStatus,
    };
  });
}

export interface WorkCentreWithContext {
  id: string;
  name: string;
  workCenterType: string;
  capacity: number;
  areaName: string;
  areaType: string;
  siteName: string;
  twinState: string;
  activeCount: number;
  utilisationPct: number;
  byStatus: Record<string, number>;
}

export interface WorkCentreUtilisation {
  workCentreId: string;
  name: string;
  capacity: number;
  activeCount: number;
  utilisationPct: number;
  byStatus: Record<string, number>;
  segments: SegmentSummary[];
}

export interface SegmentSummary {
  id: string;
  engineId: string;
  sourceTcn: string | null;
  sequenceNumber: number;
  segmentStatus: string;
  scheduledStart: Date | null;
  actualStart: Date | null;
  updatedAt: Date;
}

export async function getWorkCentreUtilisation(
  wcId: string,
): Promise<WorkCentreUtilisation | null> {
  const [wc] = await db
    .select()
    .from(workCentersTable)
    .where(eq(workCentersTable.id, wcId))
    .limit(1);
  if (!wc) return null;

  const segments = await db
    .select({
      id: operationSegmentsTable.id,
      engineId: operationsRequestsTable.engineId,
      sourceTcn: operationSegmentsTable.sourceTcn,
      sequenceNumber: operationSegmentsTable.sequenceNumber,
      segmentStatus: operationSegmentsTable.segmentStatus,
      scheduledStart: operationSegmentsTable.scheduledStart,
      actualStart: operationSegmentsTable.actualStart,
      updatedAt: operationSegmentsTable.updatedAt,
    })
    .from(operationSegmentsTable)
    .innerJoin(
      operationsRequestsTable,
      eq(operationSegmentsTable.operationsRequestId, operationsRequestsTable.id),
    )
    .where(eq(operationSegmentsTable.assignedWorkCenterId, wcId));

  const byStatus: Record<string, number> = {};
  let activeCount = 0;
  for (const s of segments) {
    byStatus[s.segmentStatus] = (byStatus[s.segmentStatus] ?? 0) + 1;
    if (s.segmentStatus !== "COMPLETE" && s.segmentStatus !== "SKIPPED" && s.segmentStatus !== "PENDING") {
      activeCount++;
    }
  }

  return {
    workCentreId: wcId,
    name: wc.name,
    capacity: wc.capacity,
    activeCount,
    utilisationPct: wc.capacity > 0 ? Math.round((activeCount / wc.capacity) * 100) : 0,
    byStatus,
    segments,
  };
}

/**
 * Idempotently creates OperationsRequest + OperationSegments for a work package,
 * bridging the TCN system to the ISA-95 execution model.
 * Called from ensureWorkPackagesSeeded and whenever a new work package is created.
 */
export async function ensureOperationsRequestForWorkPackage(
  workPackageId: string,
  recommendationId: string,
  engineId: string,
  tasks: Array<{
    id: string;
    tcn: string;
    sequence: number;
    status: string;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
  }>,
): Promise<void> {
  // Skip if already exists
  const existing = await db
    .select({ id: operationsRequestsTable.id })
    .from(operationsRequestsTable)
    .where(eq(operationsRequestsTable.sourceWorkPackageId, workPackageId))
    .limit(1);
  if (existing.length > 0) return;

  // Find the best-matching work centre — default to first BORESCOPE centre
  const [defaultWc] = await db
    .select()
    .from(workCentersTable)
    .where(eq(workCentersTable.workCenterType, "BORESCOPE"))
    .limit(1);

  const [request] = await db
    .insert(operationsRequestsTable)
    .values({
      requestType: "MAINTENANCE",
      priority: 3,
      engineId,
      sourceWorkPackageId: workPackageId,
      sourceRecommendationId: recommendationId,
      status: "IN_PROGRESS",
    })
    .returning();

  const { tcnStatusToSegmentStatus } = await import("@workspace/mro-core");

  for (const task of tasks) {
    await db.insert(operationSegmentsTable).values({
      operationsRequestId: request.id,
      sequenceNumber: task.sequence,
      sourceTcn: task.tcn,
      sourceTaskId: task.id,
      assignedWorkCenterId: defaultWc?.id ?? null,
      scheduledStart: task.createdAt,
      actualStart: task.startedAt,
      actualEnd: task.completedAt,
      segmentStatus: tcnStatusToSegmentStatus(task.status),
    });
  }
}

/** Sync a single TCN status change into its OperationSegment mirror. */
export async function syncSegmentStatus(
  taskId: string,
  tcnStatus: string,
  actualStart: Date | null,
  actualEnd: Date | null,
): Promise<void> {
  const { tcnStatusToSegmentStatus } = await import("@workspace/mro-core");
  const status = tcnStatusToSegmentStatus(tcnStatus);
  await db
    .update(operationSegmentsTable)
    .set({
      segmentStatus: status,
      actualStart: actualStart ?? undefined,
      actualEnd: actualEnd ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(operationSegmentsTable.sourceTaskId, taskId));
}
