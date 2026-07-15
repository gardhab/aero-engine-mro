# Aero Engine MRO Decision Support

Ingests aircraft-engine ECTM/sensor data (Trent XWB-84 fleet) and produces traceable MRO Work Recommendations for human planners (Carbon dashboard) and SAP S/4HANA Cloud (OData, downstream consumer).

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/mro-core` — pure domain logic (no db deps): ontology, rules, decision synthesis, synthetic data, graph projection + `GraphStore` interface, SAP payload/adapter, backtest. Barrel: `src/index.ts`.
- `lib/db` — Drizzle schema (source of truth for tables) + Postgres client. jsonb columns typed via `@workspace/mro-core`.
- `lib/api-spec/openapi.yaml` — API contract (source of truth). `lib/api-zod`, `lib/api-hooks` are generated from it via Orval.
- `artifacts/api-server/src/routes` — Express routes (one file per resource). `src/lib/mro/` — service, mappers, seed, Kùzu store wiring.
- `artifacts/mro-dashboard` — React+Vite+Carbon UI. Theme config in `src/index.scss`.
- Full architecture + SAP setup: see `README.md`.

## Architecture decisions

- Five layers: ontology → knowledge graph → rules → decision service → outputs (dashboard + SAP). Every recommendation is traceable to rule + evidence + ontology.
- Graph is a **materialized projection** behind a swappable `GraphStore` (Kùzu default, in-memory fallback; Neo4j later). Seed=`replaceAll`, pipeline/restart=`merge` to preserve manual node corrections.
- SAP is a **downstream consumer, not a dependency**: adapter defaults to mock; goes live only when `SAP_*` env vars are present.
- Ontology is SME-editable in-app: draft → validate (impact analysis) → publish (immutable semver version + Turtle).
- UI is **exclusively IBM Carbon Design System**; reactflow (Carbon-themed) is the only exception, for graph/ontology viz.

## Product

Maintenance planners see a fleet dashboard (health, status/priority counts, top risks, activity), a work-recommendation queue (approve/reject/edit, push approved items to SAP), an editable rules engine, an SME-editable ontology, a knowledge-graph explorer with node correction, a SAP status/notification view, and a backtest tool that replays history to measure precision/recall/lead-time.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- `kuzu` is a native module: keep it in `onlyBuiltDependencies` (pnpm-workspace.yaml) and in the esbuild `external` list. Its `.node` prebuild is copied by `install.js` — a plain `pnpm install` may not rerun it. See `.agents/memory/kuzu-on-nix.md`.
- Carbon theme config: `@use '@carbon/styles' with ($theme: themes.$g10)` — pass the theme **map** (`themes.$g10`), not the string `'g10'`. `$use-font-face`/`$font-path` are NOT overridable in this version.
- Route responses must satisfy the generated Zod schemas (`XResponse.parse(...)`); timestamptz values must be `.toISOString()`'d in mappers.
- The API seeds itself on first boot via `ensureSeeded()`; `.data/` (Kùzu db) is gitignored — deleting it forces a graph rebuild on next boot.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
