---
name: Graph projection migrations
description: How to evolve the MRO knowledge-graph projection and stored ontology without losing SME edits or leaving stale graph data.
---

- The knowledge graph is rebuilt with **merge** on already-seeded datastores, and merge only adds/refreshes — it never deletes. Any projection change that *retargets* an edge (new edge id) leaves the superseded edge behind; prune via `GraphStore.deleteEdges`, and only prune edges whose replacement exists in the **same context** (same rule/parameter), so fallback edges for un-projected data stay connected (`supersededSensorEdgeIds` in mro-core).
- **Why:** the sensor→observation split left stale `evaluates`/`indicates` edges on Sensor nodes after merge; a blanket prune would disconnect rules whose parameters have no observations yet.
- Stored ontology versions (draft + published) carry SME edits. Structural changes (class renames, moved attributes) must be migrated in the seed-time backfill via explicit rename/removal maps (`applyOntologyRestructure` in mro-core ontology/migrate.ts); refresh label/description **only when it still equals the old shipped default** — SME-edited text is preserved verbatim.
- mro-core has unit tests (`pnpm --filter @workspace/mro-core run test`, tsx + node:test); extend them when touching projection or ontology migration logic. Test rules must use real sensor catalog codes (e.g. `EGT_MARGIN`, `N2_VIB`) or no sensor edges are projected.
