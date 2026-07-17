import { randomUUID } from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import {
  db,
  enginesTable,
  readingsTable,
  rulesTable,
  recommendationsTable,
  shopVisitExchangesTable,
  ontologyVersionsTable,
  llpsTable,
} from "@workspace/db";
import {
  FLEET,
  applyOntologyRestructure,
  SEED_CLASSES,
  SEED_RELATIONSHIPS,
  SEED_RULES,
  buildEngine,
  computeEngineHealth,
  egtMarginOf,
  generateLlpSheet,
  generateReadings,
  serializeToTurtle,
  normalizeRelationships,
  isValidMultiplicity,
  type OntologyClass,
} from "@workspace/mro-core";
import { runPipeline, rebuildGraphReplace, rebuildGraphMerge } from "./service";
import { dispatchExchange, ingestAcknowledgement } from "./exchange";
import {
  ensureTatHistorySeeded,
  ensureWorkPackagesSeeded,
} from "./work-packages";
import { logger } from "../logger";

const SEED_CLASSES_FULL: OntologyClass[] = SEED_CLASSES.map((c) => ({
  ...c,
  instanceCount: 0,
  ruleCount: 0,
}));

let seedPromise: Promise<void> | null = null;

/** Idempotently seed the datastore on first boot. Safe to call concurrently. */
export async function ensureSeeded(): Promise<void> {
  if (!seedPromise) seedPromise = doSeed();
  return seedPromise;
}

async function doSeed(): Promise<void> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(enginesTable);
  if (count > 0) {
    logger.info({ engines: count }, "Datastore already seeded");
    // Seed the sample shop-visit exchange and LLP sheets independently so they
    // also appear on datastores seeded before those features existed.
    await ensureExchangeSeeded();
    await ensureLlpsSeeded();
    await ensureOntologySeedCurrent();
    // Work packages for recommendations approved before the TCN feature.
    await ensureWorkPackagesSeeded();
    // Execution history so TAT/production-control metrics are meaningful.
    await ensureTatHistorySeeded();
    // Merge (not replace) so any manual graph-node corrections survive restarts.
    await rebuildGraphMerge();
    return;
  }

  logger.info("Seeding MRO datastore (engines, readings, rules, ontology)");
  const now = new Date();

  // Ontology: one published baseline version plus an editable draft copy.
  const publishedTurtle = serializeToTurtle({
    version: "1.0.0",
    status: "published",
    classes: SEED_CLASSES_FULL,
    relationships: SEED_RELATIONSHIPS,
    updatedAt: now.toISOString(),
  });

  // Insert the core bootstrap (rules + engines + readings + ontology) atomically
  // so a mid-seed failure never leaves an inconsistent datastore that the
  // engine-count readiness check would wrongly treat as fully seeded.
  await db.transaction(async (tx) => {
    await tx.insert(rulesTable).values(SEED_RULES);

    for (const spec of FLEET) {
      const engine = buildEngine(spec, now);
      const readings = generateReadings(spec, now);
      const health = computeEngineHealth(engine, readings, SEED_RULES);
      await tx.insert(enginesTable).values({
        esn: engine.esn,
        model: engine.model,
        tailNumber: engine.tailNumber,
        operator: engine.operator ?? null,
        status: health.status,
        healthScore: health.healthScore,
        tsn: engine.tsn,
        csn: engine.csn,
        tso: engine.tso,
        cso: engine.cso,
        egtMargin: egtMarginOf(readings),
        lastUpdated: now,
      });
      await tx.insert(llpsTable).values(
        generateLlpSheet(spec).map((p) => ({
          id: `${p.engineId}:${p.partNumber}`,
          engineId: p.engineId,
          module: p.module,
          partName: p.partName,
          partNumber: p.partNumber,
          serialNumber: p.serialNumber,
          position: p.position,
          lifeLimitCycles: p.lifeLimitCycles,
          csn: p.csn,
        })),
      );
      for (let i = 0; i < readings.length; i += 500) {
        const chunk = readings.slice(i, i + 500).map((r) => ({
          engineId: r.engineId,
          parameter: r.parameter,
          label: r.label,
          value: r.value,
          unit: r.unit,
          cycle: r.cycle,
          timestamp: new Date(r.timestamp),
          status: r.status,
        }));
        await tx.insert(readingsTable).values(chunk);
      }
    }

    await tx.insert(ontologyVersionsTable).values([
      {
        version: "1.0.0",
        status: "published",
        note: "Baseline ontology",
        author: "System",
        classes: SEED_CLASSES_FULL,
        relationships: SEED_RELATIONSHIPS,
        turtle: publishedTurtle,
        createdAt: now,
      },
      {
        version: "draft",
        status: "draft",
        note: "Working draft",
        author: "System",
        classes: SEED_CLASSES_FULL,
        relationships: SEED_RELATIONSHIPS,
        turtle: publishedTurtle,
        createdAt: now,
      },
    ]);
  });

  // Run the decision pipeline to generate the initial recommendations, then
  // seed the sample OEM<->MRO shop-visit round-trip, then build the graph.
  await runPipeline(now);
  await ensureExchangeSeeded();
  await ensureWorkPackagesSeeded();
  await ensureTatHistorySeeded();
  await rebuildGraphReplace();
  logger.info("Seeding complete");
}

/**
 * Idempotently backfill newly introduced seed ontology classes/relationships
 * (e.g. PiecePart / hasPiecePart) into ontology versions that predate them.
 * Only additive: never overwrites SME edits to existing classes.
 */
async function ensureOntologySeedCurrent(): Promise<void> {
  // Only touch the working draft and the currently published version —
  // superseded historical versions stay immutable snapshots.
  const all = await db
    .select()
    .from(ontologyVersionsTable)
    .orderBy(desc(ontologyVersionsTable.createdAt));
  const draft = all.find((r) => r.status === "draft");
  const published = all.find((r) => r.status === "published");
  const rows = [draft, published].filter(
    (r): r is NonNullable<typeof r> => r != null,
  );
  await db.transaction(async (tx) => {
  for (const rawRow of rows) {
      // Structural restructure migration (definition/instance split): rename
      // class ids, rewire relationship endpoints, and drop attributes that
      // moved to another class — preserving every other SME edit in place.
      const row = applyOntologyRestructure(rawRow);
      const restructured =
        row.classes !== rawRow.classes ||
        row.relationships !== rawRow.relationships;
      const classIds = new Set(row.classes.map((c) => c.id));
      const relIds = new Set(row.relationships.map((r) => r.id));
      const missingClasses = SEED_CLASSES_FULL.filter(
        (c) => !classIds.has(c.id),
      );
      const missingRels = SEED_RELATIONSHIPS.filter((r) => !relIds.has(r.id));
      // Additive attribute backfill: append seed attributes newly introduced on
      // existing classes (e.g. MaintenanceTask.tcn), never touching SME-edited
      // or renamed attributes.
      const attributePatches = new Map<string, OntologyClass["attributes"]>();
      for (const seedClass of SEED_CLASSES_FULL) {
        const current = row.classes.find((c) => c.id === seedClass.id);
        if (!current) continue;
        const names = new Set(current.attributes.map((a) => a.name));
        const missingAttrs = seedClass.attributes.filter(
          (a) => !names.has(a.name),
        );
        if (missingAttrs.length > 0) {
          attributePatches.set(seedClass.id, missingAttrs);
        }
      }
      // Backfill both-end multiplicities on relationships stored before they
      // became part of the ontology model.
      const needsMultiplicityBackfill = row.relationships.some(
        (r) =>
          !isValidMultiplicity(r.sourceMultiplicity) ||
          !isValidMultiplicity(r.targetMultiplicity),
      );
      if (
        missingClasses.length === 0 &&
        missingRels.length === 0 &&
        attributePatches.size === 0 &&
        !needsMultiplicityBackfill &&
        !restructured
      )
        continue;
      const patched = row.classes.map((c) => {
        const extra = attributePatches.get(c.id);
        return extra ? { ...c, attributes: [...c.attributes, ...extra] } : c;
      });
      const classes = [...patched, ...missingClasses];
      const relationships = [
        ...normalizeRelationships(row.relationships),
        ...missingRels,
      ];
      const turtle = serializeToTurtle({
        version: row.version,
        status: row.status === "published" ? "published" : "draft",
        classes,
        relationships,
        updatedAt: new Date().toISOString(),
      });
      await tx
        .update(ontologyVersionsTable)
        .set({ classes, relationships, turtle })
        .where(eq(ontologyVersionsTable.version, row.version));
      logger.info(
        {
          version: row.version,
          addedClasses: missingClasses.map((c) => c.id),
          addedRelationships: missingRels.map((r) => r.id),
          patchedAttributeClasses: [...attributePatches.keys()],
          restructured,
        },
        "Backfilled seed ontology additions",
      );
    }
  });
}

/**
 * Idempotently seed LLP status sheets for engines that predate the feature.
 * Sheets are deterministic per ESN and consistent with the engine's CSN/CSO.
 */
async function ensureLlpsSeeded(): Promise<void> {
  // Per-engine idempotent: repair environments where only some engines have
  // LLP rows (e.g. an engine added after a partial seed).
  const seeded = new Set(
    (
      await db
        .selectDistinct({ engineId: llpsTable.engineId })
        .from(llpsTable)
    ).map((r) => r.engineId),
  );
  const engineRows = (await db.select().from(enginesTable)).filter(
    (e) => !seeded.has(e.esn),
  );
  if (engineRows.length === 0) return;
  for (const eng of engineRows) {
    const sheet = generateLlpSheet({ esn: eng.esn, csn: eng.csn, cso: eng.cso });
    await db.insert(llpsTable).values(
      sheet.map((p) => ({
        id: `${p.engineId}:${p.partNumber}`,
        engineId: p.engineId,
        module: p.module,
        partName: p.partName,
        partNumber: p.partNumber,
        serialNumber: p.serialNumber,
        position: p.position,
        lifeLimitCycles: p.lifeLimitCycles,
        csn: p.csn,
      })),
    );
  }
  logger.info({ engines: engineRows.length }, "Seeded LLP status sheets");
}

/**
 * Seed one illustrative OEM->MRO shop-visit exchange round-trip: dispatch a TSR
 * from an approved performance-restoration recommendation and ingest the MRO's
 * induction acceptance (committed TAT +3 days, $25k cost cap), landing it at
 * `accepted`. Runs through the real dispatch/ingest code paths and is idempotent.
 */
async function ensureExchangeSeeded(): Promise<void> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(shopVisitExchangesTable);
  if (count > 0) return;

  const recRows = await db.select().from(recommendationsTable);
  if (recRows.length === 0) return;

  // Prefer a performance-restoration (EGT-margin) recommendation to mirror the
  // canonical PRSV example; otherwise take the highest-severity recommendation.
  const preferred =
    recRows.find((r) => /egt|performance|margin|restoration/i.test(r.failureMode)) ??
    [...recRows].sort((a, b) => b.severity - a.severity)[0];

  if (!["approved", "pushed"].includes(preferred.status)) {
    await db
      .update(recommendationsTable)
      .set({
        status: "approved",
        reviewedBy: "Fleet Engineer (seed)",
        updatedAt: new Date(),
      })
      .where(eq(recommendationsTable.id, preferred.id));
  }

  const dispatch = await dispatchExchange(preferred.id);
  if (dispatch.kind !== "dispatched") {
    logger.warn({ kind: dispatch.kind }, "Sample exchange dispatch skipped");
    return;
  }

  const ex = dispatch.exchange;
  const committed = ex.targetTatDays + 3;
  const nowIso = new Date().toISOString();
  const ack = {
    documentId: `${ex.mroProvider.split(" ")[0].replace(/[^A-Za-z]/g, "") || "MRO"}-ACK-${new Date().getUTCFullYear()}-07743`,
    associatedRequestId: ex.documentId,
    issueDate: nowIso,
    inductionStatus: "ACCEPTED / SLOT ALLOCATED",
    logistics: {
      shopOrder: "SO-XWB-88432",
      bayAllocation: "Hangar 2, Module Bay Charlie",
      uncratingDate: null,
    },
    targetTatDays: ex.targetTatDays,
    committedTatDays: committed,
    committedReleaseDate: null,
    feasibility: ex.request.workScope.complianceDirectives.map((c) => ({
      reference: c.reference,
      feasible: true,
      note: "Confirmed feasible; capability and tooling available.",
    })),
    unscheduledCostCapUsd: 25000,
    signature: "Integration Hub Automated Sign-off (MRO Operations Planning)",
    signedAt: nowIso,
  };

  const ingest = await ingestAcknowledgement(ex.id, JSON.stringify(ack), "json");
  if (ingest.kind !== "ingested") {
    logger.warn({ kind: ingest.kind }, "Sample acknowledgement ingest skipped");
  } else {
    logger.info({ documentId: ex.documentId }, "Seeded sample shop-visit exchange");
  }
}
