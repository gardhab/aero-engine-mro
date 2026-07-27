import app from "./app";
import { logger } from "./lib/logger";
import { ensureSeeded } from "./lib/mro/seed";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function main(): Promise<void> {
  // Listen immediately so the workflow runner detects the port.
  // Seeding and graph-store init run in the background; requests arriving
  // before init finishes will hit a cold graph and return gracefully.
  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");

    // Seed the relational DB in the background (PostgreSQL — non-blocking).
    // The Kùzu graph store is NOT initialized here. Its native addon blocks
    // the event loop while merging nodes and stalls all other routes.
    // Graph data is served from cached Kùzu state; planners trigger a refresh
    // explicitly via POST /api/graph/refresh when they want fresh data.
    void ensureSeeded().catch((err) =>
      logger.error({ err }, "Datastore seeding failed"),
    );
  });
}

void main();
