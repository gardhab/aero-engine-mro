import path from "node:path";
import { InMemoryGraphStore, type GraphStore } from "@workspace/mro-core";
import { KuzuGraphStore } from "./kuzu-store";
import { logger } from "../logger";

let store: GraphStore | null = null;
let initPromise: Promise<GraphStore> | null = null;

/** Lazily initialize the graph store, preferring embedded Kuzu. */
export async function getGraphStore(): Promise<GraphStore> {
  if (store) return store;
  if (!initPromise) initPromise = initStore();
  store = await initPromise;
  return store;
}

/**
 * Returns the store ONLY if it has already been initialized — never blocks
 * or initializes Kùzu.  Use this in read-only routes where an empty response
 * is acceptable on cold start (the client will prompt the user to refresh).
 */
export function getPeekGraphStore(): GraphStore | null {
  return store;
}

async function initStore(): Promise<GraphStore> {
  const dbPath =
    process.env.KUZU_DB_PATH ?? path.resolve(process.cwd(), ".data", "mro-graph");
  try {
    const kuzuStore = new KuzuGraphStore(dbPath);
    await kuzuStore.init();
    logger.info({ dbPath, backend: "kuzu" }, "Graph store initialized");
    return kuzuStore;
  } catch (err) {
    logger.error(
      { err },
      "Embedded Kuzu unavailable; falling back to in-memory graph store",
    );
    const fallback = new InMemoryGraphStore();
    await fallback.init();
    return fallback;
  }
}
