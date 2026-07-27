import app from "./app";
import { logger } from "./lib/logger";
import { ensureSeeded } from "./lib/mro/seed";
import { getGraphStore } from "./lib/mro/graph";

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

    // Seed the relational DB in the background.
    // Kùzu (graph store) is intentionally NOT initialized here — its native
    // addon blocks the event loop for several seconds while opening an
    // existing database.  The graph store is lazily initialized on the first
    // GET /api/graph request instead.
    void ensureSeeded().catch((err) =>
      logger.error({ err }, "Datastore seeding failed"),
    );
  });
}

void main();
