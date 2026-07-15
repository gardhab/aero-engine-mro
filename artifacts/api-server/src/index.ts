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
  try {
    await getGraphStore();
    await ensureSeeded();
  } catch (err) {
    // Keep the server up (health checks, diagnostics) even if seeding fails.
    logger.error({ err }, "Datastore initialization failed");
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

void main();
