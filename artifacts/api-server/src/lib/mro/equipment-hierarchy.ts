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
  equipmentClassesTable,
  equipmentTable,
  operationsRequestsTable,
  operationSegmentsTable,
  personnelClassesTable,
  type WorkCenterRow,
  type EquipmentRow,
  type WorkUnitRow,
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

  // Fetch inserted work centres by type for FK references
  const wcs = await db.select().from(workCentersTable);
  const wcByType = new Map<string, typeof wcs[0][]>();
  for (const wc of wcs) {
    const list = wcByType.get(wc.workCenterType) ?? [];
    list.push(wc);
    wcByType.set(wc.workCenterType, list);
  }

  // Equipment Classes — one per major tool/rig category.
  // requiredForSkills maps ontology skill codes → this class (for FR-09 edge).
  const [
    ecBorescope,
    ecNdt,
    ecBladeRepair,
    ecBalancingRig,
    ecTestCell,
    ecEngineStand,
  ] = await db
    .insert(equipmentClassesTable)
    .values([
      {
        equipmentClassCode: "BORESCOPE_RIG",
        name: "Borescope Inspection Rig",
        description: "Flexible/rigid borescope system for on-wing and module inspection.",
        requiredForSkills: ["Borescope inspection"],
      },
      {
        equipmentClassCode: "NDT_RIG",
        name: "NDT Inspection Station",
        description: "Magnetic particle, fluorescent penetrant, and ultrasonic test equipment.",
        requiredForSkills: ["NDT Level 2"],
      },
      {
        equipmentClassCode: "BLADE_REPAIR_STAND",
        name: "Blade Repair Stand",
        description: "Fixture stand for HPT/LPT blade blending, tip restoration and coating.",
        requiredForSkills: ["Powerplant (hot section)"],
      },
      {
        equipmentClassCode: "BALANCING_RIG",
        name: "Rotor Balancing Rig",
        description: "Dynamic balancing machine for fan and turbine rotors.",
        requiredForSkills: ["Vibration analysis"],
      },
      {
        equipmentClassCode: "TEST_CELL_STAND",
        name: "Engine Test Cell Stand",
        description: "Thrust measurement test cell with full ECTM instrumentation.",
        requiredForSkills: ["Powerplant (rotatives)"],
      },
      {
        equipmentClassCode: "ENGINE_STAND",
        name: "Engine Build Stand",
        description: "Rotatable engine stand for module build/disassembly.",
        requiredForSkills: ["Powerplant", "Powerplant (module exposure)"],
      },
    ])
    .returning();

  // Work Units — 1-2 per work centre, seeded by work centre type.
  // Returns a flat list; we'll look up by work centre id.
  const workUnitInserts: { workCenterId: string; name: string; workUnitType: string }[] = [];

  for (const [type, centres] of wcByType) {
    for (const wc of centres) {
      switch (type) {
        case "BORESCOPE":
          workUnitInserts.push({ workCenterId: wc.id, name: `${wc.name} — Cell 1`, workUnitType: "WorkCell" });
          workUnitInserts.push({ workCenterId: wc.id, name: `${wc.name} — Cell 2`, workUnitType: "WorkCell" });
          break;
        case "NDT":
          workUnitInserts.push({ workCenterId: wc.id, name: `${wc.name} — Station A`, workUnitType: "WorkCell" });
          break;
        case "BLADE_REPAIR":
          workUnitInserts.push({ workCenterId: wc.id, name: `${wc.name} — Bench 1`, workUnitType: "WorkCell" });
          workUnitInserts.push({ workCenterId: wc.id, name: `${wc.name} — Bench 2`, workUnitType: "WorkCell" });
          break;
        case "BALANCING":
          workUnitInserts.push({ workCenterId: wc.id, name: `${wc.name} — Balance Rig`, workUnitType: "ProductionUnit" });
          break;
        case "TEST_CELL":
          workUnitInserts.push({ workCenterId: wc.id, name: `${wc.name} — Stand`, workUnitType: "ProductionUnit" });
          break;
        case "COMBUSTION":
          workUnitInserts.push({ workCenterId: wc.id, name: `${wc.name} — Bench A`, workUnitType: "WorkCell" });
          break;
        default:
          workUnitInserts.push({ workCenterId: wc.id, name: `${wc.name} — Bay 1`, workUnitType: "WorkCell" });
      }
    }
  }

  const workUnits = await db.insert(workUnitsTable).values(workUnitInserts).returning();
  const wuByWcId = new Map<string, typeof workUnits[0][]>();
  for (const wu of workUnits) {
    const list = wuByWcId.get(wu.workCenterId) ?? [];
    list.push(wu);
    wuByWcId.set(wu.workCenterId, list);
  }

  // Equipment — 1-2 pieces per work unit with varied statuses for realism.
  const equipInserts: {
    equipmentClassId: string;
    workUnitId: string;
    name: string;
    serialNumber: string;
    equipmentStatus: string;
  }[] = [];

  let eqSerial = 1001;
  const nextSerial = () => `SN-${eqSerial++}`;

  for (const [type, centres] of wcByType) {
    for (const wc of centres) {
      const units = wuByWcId.get(wc.id) ?? [];
      for (let ui = 0; ui < units.length; ui++) {
        const wu = units[ui];
        // Assign equipment class based on work centre type
        let classId: string;
        let baseName: string;
        switch (type) {
          case "BORESCOPE":
            classId = ecBorescope.id;
            baseName = "Olympus IPLEX NX Borescope";
            break;
          case "NDT":
            classId = ecNdt.id;
            baseName = "Olympus OMNISCAN FMC Ultrasonic";
            break;
          case "BLADE_REPAIR":
            classId = ecBladeRepair.id;
            baseName = "Blade Repair Fixture Stand";
            break;
          case "BALANCING":
            classId = ecBalancingRig.id;
            baseName = "Schenck CAB 930 Balance Rig";
            break;
          case "TEST_CELL":
            classId = ecTestCell.id;
            baseName = "Test Cell Thrust Stand";
            break;
          default:
            classId = ecEngineStand.id;
            baseName = "Rolls-Royce Engine Build Stand";
        }

        // Status varies per work centre type so planners see a realistic mix.
        // NDT rigs require frequent calibration → CALIBRATION_DUE.
        // Borescope second unit → IN_USE (active inspection in progress).
        // All others → AVAILABLE.
        const status =
          type === "NDT"
            ? "CALIBRATION_DUE"
            : ui === 0
              ? "AVAILABLE"
              : type === "BORESCOPE"
                ? "IN_USE"
                : "AVAILABLE";

        equipInserts.push({
          equipmentClassId: classId,
          workUnitId: wu.id,
          name: `${baseName} #${ui + 1}`,
          serialNumber: nextSerial(),
          equipmentStatus: status,
        });
      }
    }
  }

  if (equipInserts.length > 0) {
    await db.insert(equipmentTable).values(equipInserts);
  }

  await logActivity("work_package", HIERARCHY_SEED_MARKER);
  logger.info("ISA-95 equipment hierarchy seeded");
}

/**
 * Ensure the equipment_classes and equipment tables exist in the database.
 * On an existing deployed database that predates this feature, drizzle-kit push
 * may not have run; calling this before any equipment query prevents
 * "relation does not exist" errors at startup.
 */
async function ensureEquipmentTablesExist(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS equipment_classes (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      equipment_class_code TEXT NOT NULL UNIQUE,
      name                TEXT NOT NULL,
      description         TEXT,
      required_for_skills JSONB NOT NULL DEFAULT '[]',
      twin_state          TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS equipment (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      equipment_class_id  UUID NOT NULL REFERENCES equipment_classes(id),
      work_unit_id        UUID REFERENCES work_units(id),
      name                TEXT NOT NULL,
      serial_number       TEXT,
      equipment_status    TEXT NOT NULL DEFAULT 'AVAILABLE',
      twin_state          TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

/**
 * Idempotently seed equipment classes, work units, and equipment on databases
 * that existed before this feature was added. Safe to call on fresh seeds too —
 * the equipment_classes check prevents double-inserts.
 */
export async function ensureWorkUnitsAndEquipmentSeeded(): Promise<void> {
  await ensureEquipmentTablesExist();

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(equipmentClassesTable);
  if (n > 0) return; // already seeded

  logger.info("Seeding equipment classes, work units, and equipment");

  // Equipment Classes
  const [
    ecBorescope,
    ecNdt,
    ecBladeRepair,
    ecBalancingRig,
    ecTestCell,
    ecEngineStand,
  ] = await db
    .insert(equipmentClassesTable)
    .values([
      {
        equipmentClassCode: "BORESCOPE_RIG",
        name: "Borescope Inspection Rig",
        description: "Flexible/rigid borescope system for on-wing and module inspection.",
        requiredForSkills: ["Borescope inspection"],
      },
      {
        equipmentClassCode: "NDT_RIG",
        name: "NDT Inspection Station",
        description: "Magnetic particle, fluorescent penetrant, and ultrasonic test equipment.",
        requiredForSkills: ["NDT Level 2"],
      },
      {
        equipmentClassCode: "BLADE_REPAIR_STAND",
        name: "Blade Repair Stand",
        description: "Fixture stand for HPT/LPT blade blending, tip restoration and coating.",
        requiredForSkills: ["Powerplant (hot section)"],
      },
      {
        equipmentClassCode: "BALANCING_RIG",
        name: "Rotor Balancing Rig",
        description: "Dynamic balancing machine for fan and turbine rotors.",
        requiredForSkills: ["Vibration analysis"],
      },
      {
        equipmentClassCode: "TEST_CELL_STAND",
        name: "Engine Test Cell Stand",
        description: "Thrust measurement test cell with full ECTM instrumentation.",
        requiredForSkills: ["Powerplant (rotatives)"],
      },
      {
        equipmentClassCode: "ENGINE_STAND",
        name: "Engine Build Stand",
        description: "Rotatable engine stand for module build/disassembly.",
        requiredForSkills: ["Powerplant", "Powerplant (module exposure)"],
      },
    ])
    .returning();

  const wcs = await db.select().from(workCentersTable);
  const wcByType = new Map<string, typeof wcs[0][]>();
  for (const wc of wcs) {
    const list = wcByType.get(wc.workCenterType) ?? [];
    list.push(wc);
    wcByType.set(wc.workCenterType, list);
  }

  const workUnitInserts: { workCenterId: string; name: string; workUnitType: string }[] = [];
  for (const [type, centres] of wcByType) {
    for (const wc of centres) {
      switch (type) {
        case "BORESCOPE":
          workUnitInserts.push({ workCenterId: wc.id, name: `${wc.name} — Cell 1`, workUnitType: "WorkCell" });
          workUnitInserts.push({ workCenterId: wc.id, name: `${wc.name} — Cell 2`, workUnitType: "WorkCell" });
          break;
        case "NDT":
          workUnitInserts.push({ workCenterId: wc.id, name: `${wc.name} — Station A`, workUnitType: "WorkCell" });
          break;
        case "BLADE_REPAIR":
          workUnitInserts.push({ workCenterId: wc.id, name: `${wc.name} — Bench 1`, workUnitType: "WorkCell" });
          workUnitInserts.push({ workCenterId: wc.id, name: `${wc.name} — Bench 2`, workUnitType: "WorkCell" });
          break;
        case "BALANCING":
          workUnitInserts.push({ workCenterId: wc.id, name: `${wc.name} — Balance Rig`, workUnitType: "ProductionUnit" });
          break;
        case "TEST_CELL":
          workUnitInserts.push({ workCenterId: wc.id, name: `${wc.name} — Stand`, workUnitType: "ProductionUnit" });
          break;
        case "COMBUSTION":
          workUnitInserts.push({ workCenterId: wc.id, name: `${wc.name} — Bench A`, workUnitType: "WorkCell" });
          break;
        default:
          workUnitInserts.push({ workCenterId: wc.id, name: `${wc.name} — Bay 1`, workUnitType: "WorkCell" });
      }
    }
  }

  const workUnits = await db.insert(workUnitsTable).values(workUnitInserts).returning();
  const wuByWcId = new Map<string, typeof workUnits[0][]>();
  for (const wu of workUnits) {
    const list = wuByWcId.get(wu.workCenterId) ?? [];
    list.push(wu);
    wuByWcId.set(wu.workCenterId, list);
  }

  const equipInserts: {
    equipmentClassId: string;
    workUnitId: string;
    name: string;
    serialNumber: string;
    equipmentStatus: string;
  }[] = [];
  let eqSerial = 1001;
  const nextSerial = () => `SN-${eqSerial++}`;

  for (const [type, centres] of wcByType) {
    for (const wc of centres) {
      const units = wuByWcId.get(wc.id) ?? [];
      for (let ui = 0; ui < units.length; ui++) {
        const wu = units[ui];
        let classId: string;
        let baseName: string;
        switch (type) {
          case "BORESCOPE": classId = ecBorescope.id; baseName = "Olympus IPLEX NX Borescope"; break;
          case "NDT": classId = ecNdt.id; baseName = "Olympus OMNISCAN FMC Ultrasonic"; break;
          case "BLADE_REPAIR": classId = ecBladeRepair.id; baseName = "Blade Repair Fixture Stand"; break;
          case "BALANCING": classId = ecBalancingRig.id; baseName = "Schenck CAB 930 Balance Rig"; break;
          case "TEST_CELL": classId = ecTestCell.id; baseName = "Test Cell Thrust Stand"; break;
          default: classId = ecEngineStand.id; baseName = "Rolls-Royce Engine Build Stand";
        }
        const status =
          type === "NDT"
            ? "CALIBRATION_DUE"
            : ui === 0
              ? "AVAILABLE"
              : type === "BORESCOPE"
                ? "IN_USE"
                : "AVAILABLE";
        equipInserts.push({
          equipmentClassId: classId,
          workUnitId: wu.id,
          name: `${baseName} #${ui + 1}`,
          serialNumber: nextSerial(),
          equipmentStatus: status,
        });
      }
    }
  }

  if (equipInserts.length > 0) {
    await db.insert(equipmentTable).values(equipInserts);
  }
  logger.info({ workUnits: workUnits.length, equipment: equipInserts.length }, "Equipment and work units seeded");
}

export interface WorkUnitWithEquipment {
  id: string;
  name: string;
  workUnitType: string;
  equipment: {
    id: string;
    name: string;
    serialNumber: string | null;
    equipmentStatus: string;
    equipmentClassCode: string;
    equipmentClassName: string;
  }[];
}

/** Return work units with their equipment for a specific work centre. */
export async function listWorkUnitsForCentre(workCentreId: string): Promise<WorkUnitWithEquipment[]> {
  const units = await db
    .select()
    .from(workUnitsTable)
    .where(eq(workUnitsTable.workCenterId, workCentreId));

  if (units.length === 0) return [];

  const unitIds = units.map((u) => u.id);
  const eqRows = await db
    .select({
      eq: equipmentTable,
      ec: equipmentClassesTable,
    })
    .from(equipmentTable)
    .innerJoin(equipmentClassesTable, eq(equipmentTable.equipmentClassId, equipmentClassesTable.id))
    .where(inArray(equipmentTable.workUnitId, unitIds));

  const eqByUnit = new Map<string, typeof eqRows>();
  for (const row of eqRows) {
    if (!row.eq.workUnitId) continue;
    const list = eqByUnit.get(row.eq.workUnitId) ?? [];
    list.push(row);
    eqByUnit.set(row.eq.workUnitId, list);
  }

  return units.map((u) => ({
    id: u.id,
    name: u.name,
    workUnitType: u.workUnitType,
    equipment: (eqByUnit.get(u.id) ?? []).map(({ eq: e, ec }) => ({
      id: e.id,
      name: e.name,
      serialNumber: e.serialNumber,
      equipmentStatus: e.equipmentStatus,
      equipmentClassCode: ec.equipmentClassCode,
      equipmentClassName: ec.name,
    })),
  }));
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
