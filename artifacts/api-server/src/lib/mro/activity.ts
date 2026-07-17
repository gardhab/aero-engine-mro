import { randomUUID } from "node:crypto";
import { db, activityTable } from "@workspace/db";
import type { ActivityType } from "@workspace/mro-core";

/** Append an event to the audit/activity trail. */
export async function logActivity(
  type: ActivityType,
  description: string,
  opts: { engineId?: string; recommendationId?: string } = {},
): Promise<void> {
  await db.insert(activityTable).values({
    id: randomUUID(),
    type,
    description,
    engineId: opts.engineId ?? null,
    recommendationId: opts.recommendationId ?? null,
  });
}
