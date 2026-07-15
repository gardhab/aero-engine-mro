---
name: Kùzu embedded graph on Nix + pnpm
description: How to make the kuzu native module load reliably in this Replit/pnpm monorepo.
---

Kùzu (embedded Cypher graph DB) **works** on this Nix environment, but the native
`.node` binary needs three things to line up:

1. **pnpm allowlist:** add `kuzu` to `onlyBuiltDependencies` in
   `pnpm-workspace.yaml`. Under pnpm, install/build scripts are blocked by
   default, which prevents the native module from being prepared.
2. **esbuild external:** keep `kuzu` in the esbuild `external` list
   (api-server `build.mjs`). It must be `require`d at runtime (loaded via
   `createRequire`), not bundled.
3. **Prebuild copy:** kuzu's `install.js` copies the prebuilt `.node`. A plain
   `pnpm install` **after** adding to the allowlist may report "up to date" and
   NOT rerun the script — in that case run its `install.js` once manually.

**Why:** these are three independent gates; the module fails to load if any one
is missing, and the failure modes look different (missing script vs. bundling
error vs. missing binary).

**How to apply:** watch this on deploy / post-merge, where a fresh install runs.
If the graph store logs the in-memory fallback instead of `backend: "kuzu"`,
suspect the prebuild step (#3) first. Graph db path defaults to `.data/mro-graph`
(override `KUZU_DB_PATH`); `.data/` is gitignored.
