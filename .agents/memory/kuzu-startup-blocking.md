---
name: Kùzu startup blocking
description: Kùzu native addon blocks the Node.js event loop during DB open; must never run at startup.
---

# Kùzu blocks the event loop — never initialize at startup

## The rule
Do NOT call `getGraphStore()` or any Kùzu operation from the server startup path. Place ALL Kùzu initialization behind the `/api/graph` lazy gate only.

## Why
Kùzu is a native Node.js addon. Even "async" Kùzu operations (`conn.query(...)`) run synchronously on the main thread via libuv blocking calls. When the Kùzu database already has data (hundreds of nodes from a previous graph build), opening the database (`new kuzu.Database(dbPath)`) blocks the event loop for **~27 seconds**. During this window every non-graph route (dashboard, fleet, work-queue) hangs and times out, producing the all-zeros Fleet Dashboard the user sees. The workflow runner also kills the process (~15s) if it decides the server is unhealthy during this window.

## How to apply
- `artifacts/api-server/src/index.ts`: background init calls only `ensureSeeded()` (PostgreSQL/Drizzle — non-blocking). No `getGraphStore()`.
- `artifacts/api-server/src/routes/graph.ts`: `ensureGraphReady()` gate — `graphReady` boolean + singleton `graphBuildPromise`. First `GET /api/graph` triggers `rebuildGraphMerge()`, sets `graphReady = true`. Subsequent requests skip it. Failures clear the promise to allow a retry.
- `artifacts/api-server/src/lib/mro/seed.ts`: `rebuildGraphMerge()` and `rebuildGraphReplace()` are NOT called from `ensureSeeded()` — graph is always rebuilt lazily.

## One-time graph build cost
The first visit to the Graph Explorer page triggers the lazy build. This takes ~5–10s while Kùzu merges hundreds of nodes. All other pages are unaffected.

## Related commits
- `b4d2e7d` — listen on port immediately, seed in background (stopped workflow kill before port opened)
- `cd74498` — deferred Kùzu graph rebuild to first /api/graph request
- `c96466c` — removed Kùzu from startup path entirely

## Also fixed: indirect getGraphStore() callers
`ontology.ts::graphCounts()` called `getGraphStore()` to count instances per class — this ran Kùzu on every `GET /api/ontology/draft` request and was the hidden cause of the ontology page hanging.

**Rule**: `grep -r "getGraphStore" src/routes/` after any Kùzu refactor to catch indirect callers.

## Pattern: getPeekGraphStore()
Added `getPeekGraphStore(): GraphStore | null` to `lib/mro/graph.ts`. Use this in any route that can meaningfully handle "no graph yet":
- Returns existing store if already initialized
- Returns `null` without touching Kùzu if cold
- `POST /api/graph/refresh` is the ONLY route allowed to call `getGraphStore()` (the full blocking init)

## Graph UX on cold start
- `GET /api/graph` returns `{nodes:[], edges:[]}` + `X-Graph-Building: true` header when store is null
- `GraphExplorer.tsx` shows an `InlineNotification` banner with a "Build graph" button
- Button posts to `POST /api/graph/refresh`; frontend polls every 5s via `setInterval` until nodes appear
