# Aero Engine MRO Decision Support

Decision-support system for aircraft-engine Maintenance, Repair & Overhaul (MRO).
It ingests Engine Condition Trend Monitoring (ECTM) / sensor data for a fleet of
Rolls-Royce **Trent XWB-84** engines, reasons over it with a layered
knowledge-driven architecture, and produces **traceable MRO Work
Recommendations** for two audiences:

1. **Human maintenance planners** — via a Carbon Design System dashboard.
2. **SAP S/4HANA Cloud** — as Maintenance Notifications over OData (SAP is a
   *downstream consumer*, never a runtime dependency).

> v1 uses one engine type and synthetic run-to-failure data. Modelled failure
> modes: EGT-margin erosion, fan-vibration exceedance, oil-pressure degradation,
> and oil-consumption trend.

## The five-layer reasoning architecture

```
ECTM / sensor readings
        │
   ┌────▼─────────────────────────────────────────────┐
   │ 1. Domain ontology  (SME-editable, versioned)     │  classes, relationships,
   │    lib/mro-core/src/ontology, /data               │  Turtle serialization
   ├───────────────────────────────────────────────────┤
   │ 2. Knowledge graph  (materialized projection)      │  lib/mro-core/src/graph
   │    Kùzu-backed, swappable GraphStore interface     │  artifacts/api-server .../mro
   ├───────────────────────────────────────────────────┤
   │ 3. Rules engine     (ECTM thresholds & trends)     │  lib/mro-core/src/rules
   ├───────────────────────────────────────────────────┤
   │ 4. Decision service (recommendation synthesis)     │  lib/mro-core/src/decision
   │    tasks, life-limited parts, evidence, priority   │  artifacts/api-server service.ts
   ├───────────────────────────────────────────────────┤
   │ 5. Outputs          dashboard  +  SAP notifications │  artifacts/mro-dashboard,
   │                                                     │  lib/mro-core/src/sap
   └───────────────────────────────────────────────────┘
```

Every recommendation carries full traceability back through the rule that fired,
the sensor evidence that triggered it, and the ontology classes involved.

## Repository layout

| Path | Purpose |
| --- | --- |
| `lib/mro-core` | Pure domain logic (no project/db deps): ontology, rules, decision synthesis, synthetic data, graph projection + `GraphStore` interface, SAP payload/adapter, backtest. |
| `lib/db` | Drizzle schema + Postgres client. jsonb columns are typed via `@workspace/mro-core`. |
| `lib/api-spec` / `lib/api-zod` / `lib/api-hooks` | OpenAPI contract → generated Zod schemas + React Query hooks (Orval). |
| `artifacts/api-server` | Express 5 API. Wires core + db, hosts the Kùzu graph store, seeds synthetic data on boot. |
| `artifacts/mro-dashboard` | React + Vite + **IBM Carbon Design System** UI (reactflow for graph/ontology viz). |

## Run & operate (development)

```bash
pnpm --filter @workspace/db run push          # create/update DB tables
pnpm --filter @workspace/api-spec run codegen  # regenerate hooks + zod from OpenAPI
pnpm --filter @workspace/api-server run dev     # API (seeds synthetic fleet on first boot)
pnpm --filter @workspace/mro-dashboard run dev  # dashboard
```

The API **seeds itself on first boot** (`ensureSeeded`): 8 engines, ~9k readings,
4 rules, a published + draft ontology, an initial pipeline run, and the graph
projection. It is idempotent — subsequent boots only re-merge the graph
(preserving any manual node corrections).

Required env: `DATABASE_URL`.

## Knowledge graph store (Kùzu)

The graph is a **materialized projection** of the domain state behind a swappable
`GraphStore` interface (`lib/mro-core/src/graph/store.ts`). The default
implementation is **Kùzu** (embedded Cypher; `artifacts/api-server/.../kuzu-store.ts`),
with an in-memory fallback. To move to Neo4j later, implement `GraphStore` and
swap it in `graph.ts`.

- Seed uses `replaceAll`; the pipeline and restarts use `merge` so
  manually-corrected node properties survive.
- The Kùzu DB lives at `.data/mro-graph` (override with `KUZU_DB_PATH`); it is
  gitignored.
- **pnpm note:** `kuzu` is a native module. It must be listed in
  `onlyBuiltDependencies` in `pnpm-workspace.yaml`, kept in the esbuild
  `external` list, and its `.node` prebuild copied by `install.js`. See
  `.agents/memory/kuzu-on-nix.md`.

## SME-editable ontology

Subject-matter experts edit the ontology in-app (`/ontology`): add/deprecate
classes and relationships on a **draft**, validate (conformance + impact
analysis against rules and live graph counts), then **publish** a new immutable,
semver-tagged version. Prior published versions are marked `superseded`. Each
version stores a canonical **Turtle** serialization.

## SAP S/4HANA Cloud integration

SAP is a downstream consumer. The adapter (`lib/mro-core/src/sap`) runs in **mock
mode by default**, so the whole app is functional with no SAP tenant. It switches
to **live mode** automatically when these env vars are present:

| Variable | Meaning |
| --- | --- |
| `SAP_BASE_URL` | S/4HANA Cloud API host |
| `SAP_TOKEN_URL` | OAuth2 token endpoint (client-credentials) |
| `SAP_CLIENT_ID` / `SAP_CLIENT_SECRET` | OAuth2 client credentials |

Approved recommendations are posted as **M2 Maintenance Notifications** via
OData. Failed pushes are recorded and surfaced in a manual-review queue rather
than silently dropped.

### SAP Basis setup (live mode)

1. In the S/4HANA Cloud tenant, create a **Communication Arrangement** exposing
   the Maintenance Notification (M2) OData service, and a **Communication User**
   with client-credentials OAuth2.
2. Note the API host, token URL, client id, and secret.
3. Set the four `SAP_*` env vars (use the Replit secrets flow — never commit
   them). The adapter detects them and flips to live mode on next boot;
   `/sap/status` reports the active mode.

## Extending the system

- **New failure mode / rule:** add to `SEED_RULES` and the task library in
  `lib/mro-core`; the pipeline, graph, and dashboard pick it up automatically.
- **New engine type:** extend the synthetic `FLEET` and degradation profiles, or
  replace `seed.ts` with a real ECTM ingestion source.
- **New ontology concepts:** use the in-app draft → validate → publish flow, or
  seed them in `SEED_CLASSES` / `SEED_RELATIONSHIPS`.
- **Real graph DB:** implement `GraphStore` for Neo4j and swap it in `graph.ts`.
- **API changes:** edit `lib/api-spec/openapi.yaml`, run codegen, then implement
  the route. Responses are validated against the generated Zod schemas.
```
