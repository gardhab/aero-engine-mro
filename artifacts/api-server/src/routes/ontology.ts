import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, ontologyVersionsTable, rulesTable } from "@workspace/db";
import type { OntologyVersionRow } from "@workspace/db";
import {
  GetOntologyResponse,
  GetOntologyDraftResponse,
  GetOntologyTurtleResponse,
  ListOntologyVersionsResponse,
  CreateOntologyClassResponse,
  UpdateOntologyClassResponse,
  CreateOntologyRelationshipResponse,
  UpdateOntologyRelationshipResponse,
  ValidateOntologyResponse,
  PublishOntologyResponse,
} from "@workspace/api-zod";
import {
  serializeToTurtle,
  validateOntology,
  normalizeRelationships,
  multiplicityError,
  type Ontology,
  type OntologyClass,
  type OntologyRelationship,
} from "@workspace/mro-core";
import { toRule } from "../lib/mro/mappers";
import {
  enrichOntologyClasses,
  logActivity,
  nodeCountByClass,
} from "../lib/mro/service";
import { getGraphStore } from "../lib/mro/graph";

const router: IRouter = Router();

/**
 * Older stored versions predate first-class multiplicities; default them on
 * read so every relationship always carries both-end multiplicities.
 */
function withNormalizedRelationships(
  row: OntologyVersionRow,
): OntologyVersionRow {
  return { ...row, relationships: normalizeRelationships(row.relationships) };
}

async function loadDraft(): Promise<OntologyVersionRow | undefined> {
  const [row] = await db
    .select()
    .from(ontologyVersionsTable)
    .where(eq(ontologyVersionsTable.status, "draft"))
    .limit(1);
  return row ? withNormalizedRelationships(row) : undefined;
}

async function loadPublished(): Promise<OntologyVersionRow | undefined> {
  const [row] = await db
    .select()
    .from(ontologyVersionsTable)
    .where(eq(ontologyVersionsTable.status, "published"))
    .orderBy(desc(ontologyVersionsTable.createdAt))
    .limit(1);
  return row ? withNormalizedRelationships(row) : undefined;
}

async function graphCounts(): Promise<Record<string, number>> {
  const store = await getGraphStore();
  const graph = await store.getGraph();
  return nodeCountByClass(graph);
}

async function enrich(row: OntologyVersionRow): Promise<Ontology> {
  const ruleRows = await db.select().from(rulesTable);
  const counts = await graphCounts();
  return {
    version: row.version,
    status: row.status as Ontology["status"],
    classes: enrichOntologyClasses(row.classes, ruleRows.map(toRule), counts),
    relationships: row.relationships,
    updatedAt: row.createdAt.toISOString(),
  };
}

function regenTurtle(row: {
  version: string;
  status: string;
  classes: OntologyClass[];
  relationships: OntologyRelationship[];
}): string {
  return serializeToTurtle({
    version: row.version,
    status: row.status === "published" ? "published" : "draft",
    classes: row.classes,
    relationships: row.relationships,
    updatedAt: new Date().toISOString(),
  });
}

router.get("/ontology", async (_req, res): Promise<void> => {
  const row = await loadPublished();
  if (!row) {
    res.status(404).json({ error: "No published ontology" });
    return;
  }
  res.json(GetOntologyResponse.parse(await enrich(row)));
});

router.get("/ontology/draft", async (_req, res): Promise<void> => {
  const row = await loadDraft();
  if (!row) {
    res.status(404).json({ error: "No draft ontology" });
    return;
  }
  res.json(GetOntologyDraftResponse.parse(await enrich(row)));
});

router.get("/ontology/turtle", async (_req, res): Promise<void> => {
  const row = (await loadDraft()) ?? (await loadPublished());
  if (!row) {
    res.status(404).json({ error: "No ontology" });
    return;
  }
  const turtle = regenTurtle(row);
  res.json(GetOntologyTurtleResponse.parse({ turtle, version: row.version }));
});

router.get("/ontology/versions", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(ontologyVersionsTable)
    .orderBy(desc(ontologyVersionsTable.createdAt));
  const data = rows.map((r) => ({
    version: r.version,
    status: r.status,
    note: r.note,
    author: r.author,
    createdAt: r.createdAt.toISOString(),
    classCount: r.classes.length,
    relationshipCount: r.relationships.length,
  }));
  res.json(ListOntologyVersionsResponse.parse(data));
});

router.post("/ontology/classes", async (req, res): Promise<void> => {
  const draft = await loadDraft();
  if (!draft) {
    res.status(400).json({ error: "No draft ontology to edit" });
    return;
  }
  const body = req.body as {
    label: string;
    description: string;
    parentClass?: string;
    attributes?: OntologyClass["attributes"];
  };
  if (!body.label || !body.label.trim()) {
    res.status(400).json({ error: "label is required" });
    return;
  }
  const id = toPascalCase(body.label);
  if (draft.classes.some((c) => c.id === id)) {
    res.status(400).json({ error: `Class "${id}" already exists` });
    return;
  }
  const cls: OntologyClass = {
    id,
    label: body.label,
    description: body.description ?? "",
    parentClass: body.parentClass ?? null,
    deprecated: false,
    attributes: body.attributes ?? [],
    instanceCount: 0,
    ruleCount: 0,
  };
  const classes = [...draft.classes, cls];
  await saveDraft(draft, { classes });
  await logActivity("ontology", `Ontology class "${id}" added to draft.`);
  res.status(201).json(CreateOntologyClassResponse.parse(cls));
});

router.patch("/ontology/classes/:id", async (req, res): Promise<void> => {
  const draft = await loadDraft();
  if (!draft) {
    res.status(404).json({ error: "No draft ontology" });
    return;
  }
  const idx = draft.classes.findIndex((c) => c.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: "Class not found" });
    return;
  }
  const body = req.body as Partial<OntologyClass>;
  const current = draft.classes[idx];
  const updated: OntologyClass = {
    ...current,
    label: body.label ?? current.label,
    description: body.description ?? current.description,
    parentClass:
      body.parentClass !== undefined ? body.parentClass : current.parentClass,
    deprecated:
      body.deprecated !== undefined ? body.deprecated : current.deprecated,
    attributes: body.attributes ?? current.attributes,
  };
  const classes = [...draft.classes];
  classes[idx] = updated;
  await saveDraft(draft, { classes });
  await logActivity("ontology", `Ontology class "${updated.id}" updated.`);
  res.json(UpdateOntologyClassResponse.parse(updated));
});

router.post("/ontology/relationships", async (req, res): Promise<void> => {
  const draft = await loadDraft();
  if (!draft) {
    res.status(400).json({ error: "No draft ontology to edit" });
    return;
  }
  const body = req.body as {
    label: string;
    domain: string;
    range: string;
    sourceMultiplicity: string;
    targetMultiplicity: string;
    description?: string;
  };
  if (!body.label || !body.domain || !body.range) {
    res.status(400).json({ error: "label, domain and range are required" });
    return;
  }
  const srcErr = multiplicityError(body.sourceMultiplicity);
  if (srcErr) {
    res.status(400).json({ error: `sourceMultiplicity: ${srcErr}` });
    return;
  }
  const tgtErr = multiplicityError(body.targetMultiplicity);
  if (tgtErr) {
    res.status(400).json({ error: `targetMultiplicity: ${tgtErr}` });
    return;
  }
  const id = toCamelCase(body.label);
  if (draft.relationships.some((r) => r.id === id)) {
    res.status(400).json({ error: `Relationship "${id}" already exists` });
    return;
  }
  const rel: OntologyRelationship = {
    id,
    label: body.label,
    domain: body.domain,
    range: body.range,
    sourceMultiplicity: body.sourceMultiplicity.trim(),
    targetMultiplicity: body.targetMultiplicity.trim(),
    description: body.description ?? null,
    deprecated: false,
  };
  const relationships = [...draft.relationships, rel];
  await saveDraft(draft, { relationships });
  await logActivity("ontology", `Ontology relationship "${id}" added to draft.`);
  res.status(201).json(CreateOntologyRelationshipResponse.parse(rel));
});

router.patch(
  "/ontology/relationships/:id",
  async (req, res): Promise<void> => {
    const draft = await loadDraft();
    if (!draft) {
      res.status(404).json({ error: "No draft ontology" });
      return;
    }
    const idx = draft.relationships.findIndex((r) => r.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: "Relationship not found" });
      return;
    }
    const body = req.body as Partial<OntologyRelationship>;
    if (body.label !== undefined && !body.label.trim()) {
      res.status(400).json({ error: "label cannot be empty" });
      return;
    }
    if (body.sourceMultiplicity !== undefined) {
      const err = multiplicityError(body.sourceMultiplicity);
      if (err) {
        res.status(400).json({ error: `sourceMultiplicity: ${err}` });
        return;
      }
    }
    if (body.targetMultiplicity !== undefined) {
      const err = multiplicityError(body.targetMultiplicity);
      if (err) {
        res.status(400).json({ error: `targetMultiplicity: ${err}` });
        return;
      }
    }
    const current = draft.relationships[idx];
    const updated: OntologyRelationship = {
      ...current,
      label: body.label ?? current.label,
      sourceMultiplicity:
        body.sourceMultiplicity?.trim() ?? current.sourceMultiplicity,
      targetMultiplicity:
        body.targetMultiplicity?.trim() ?? current.targetMultiplicity,
      description:
        body.description !== undefined ? body.description : current.description,
      deprecated:
        body.deprecated !== undefined ? body.deprecated : current.deprecated,
    };
    const relationships = [...draft.relationships];
    relationships[idx] = updated;
    await saveDraft(draft, { relationships });
    await logActivity(
      "ontology",
      `Ontology relationship "${updated.id}" updated.`,
    );
    res.json(UpdateOntologyRelationshipResponse.parse(updated));
  },
);

router.post("/ontology/validate", async (_req, res): Promise<void> => {
  const draft = await loadDraft();
  if (!draft) {
    res.status(404).json({ error: "No draft ontology" });
    return;
  }
  const ruleRows = await db.select().from(rulesTable);
  const counts = await graphCounts();
  const result = validateOntology(
    {
      version: draft.version,
      status: "draft",
      classes: draft.classes,
      relationships: draft.relationships,
      updatedAt: draft.createdAt.toISOString(),
    },
    ruleRows.map(toRule),
    { nodeCountByClass: counts },
  );
  res.json(ValidateOntologyResponse.parse(result));
});

router.post("/ontology/publish", async (req, res): Promise<void> => {
  const draft = await loadDraft();
  if (!draft) {
    res.status(400).json({ error: "No draft ontology" });
    return;
  }
  const body = req.body as { note: string; author?: string };
  if (!body.note || !body.note.trim()) {
    res.status(400).json({ error: "note is required" });
    return;
  }
  const ruleRows = await db.select().from(rulesTable);
  const counts = await graphCounts();
  const validation = validateOntology(
    {
      version: draft.version,
      status: "draft",
      classes: draft.classes,
      relationships: draft.relationships,
      updatedAt: draft.createdAt.toISOString(),
    },
    ruleRows.map(toRule),
    { nodeCountByClass: counts },
  );
  if (!validation.valid) {
    res.status(400).json({
      error: `Cannot publish: ${validation.issues.filter((i) => i.severity === "error").length} error(s) in draft`,
    });
    return;
  }

  const published = await db
    .select()
    .from(ontologyVersionsTable)
    .where(eq(ontologyVersionsTable.status, "published"));
  const nextVersion = bumpVersion(published.map((p) => p.version));
  const now = new Date();

  const turtle = regenTurtle({
    version: nextVersion,
    status: "published",
    classes: draft.classes,
    relationships: draft.relationships,
  });

  // Supersede prior published versions and insert the new one atomically, so a
  // failure can never leave the system with zero published ontology versions.
  await db.transaction(async (tx) => {
    for (const p of published) {
      await tx
        .update(ontologyVersionsTable)
        .set({ status: "superseded" })
        .where(eq(ontologyVersionsTable.version, p.version));
    }
    await tx.insert(ontologyVersionsTable).values({
      version: nextVersion,
      status: "published",
      note: body.note,
      author: body.author ?? "SME",
      classes: draft.classes,
      relationships: draft.relationships,
      turtle,
      createdAt: now,
    });
  });
  await logActivity(
    "ontology",
    `Ontology version ${nextVersion} published: ${body.note}`,
  );

  res.json(
    PublishOntologyResponse.parse({
      version: nextVersion,
      status: "published",
      note: body.note,
      author: body.author ?? "SME",
      createdAt: now.toISOString(),
      classCount: draft.classes.length,
      relationshipCount: draft.relationships.length,
    }),
  );
});

async function saveDraft(
  draft: OntologyVersionRow,
  patch: {
    classes?: OntologyClass[];
    relationships?: OntologyRelationship[];
  },
): Promise<void> {
  const classes = patch.classes ?? draft.classes;
  const relationships = patch.relationships ?? draft.relationships;
  const turtle = regenTurtle({
    version: draft.version,
    status: "draft",
    classes,
    relationships,
  });
  await db
    .update(ontologyVersionsTable)
    .set({ classes, relationships, turtle })
    .where(eq(ontologyVersionsTable.version, draft.version));
}

function bumpVersion(versions: string[]): string {
  let major = 1;
  let minor = 0;
  for (const v of versions) {
    const m = /^(\d+)\.(\d+)/.exec(v);
    if (m) {
      const maj = Number(m[1]);
      const min = Number(m[2]);
      if (maj > major || (maj === major && min >= minor)) {
        major = maj;
        minor = min;
      }
    }
  }
  return `${major}.${minor + 1}.0`;
}

function toPascalCase(s: string): string {
  return (
    s
      .replace(/[^a-zA-Z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join("") || `Class${randomUUID().slice(0, 6)}`
  );
}

function toCamelCase(s: string): string {
  const p = toPascalCase(s);
  return p.charAt(0).toLowerCase() + p.slice(1);
}

export default router;
