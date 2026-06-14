import { Queue } from "bullmq";
import IORedis from "ioredis";

let _queue: Queue | null = null;
let _connection: IORedis | null = null;

function getConnection(): IORedis | null {
  if (!process.env.REDIS_URL) return null;
  if (_connection) return _connection;
  _connection = new IORedis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
  });
  return _connection;
}

export function getQueue(): Queue | null {
  if (_queue) return _queue;
  const conn = getConnection();
  if (!conn) return null;
  _queue = new Queue("optionforge", { connection: conn });
  return _queue;
}

// Enqueue cleanup of all hidden upcharge variants for a shop.
// Throttled by the worker to ~10 deletes/min to respect Shopify rate limits.
export async function enqueueHiddenVariantCleanup(shopId: string) {
  const q = getQueue();
  if (!q) {
    console.warn("REDIS_URL not configured; skipping queue enqueue");
    return;
  }
  await q.add(
    "hidden-variant-cleanup",
    { shopId },
    { attempts: 5, backoff: { type: "exponential", delay: 60_000 } },
  );
}

export async function enqueueMigration(shopId: string, source: string) {
  const q = getQueue();
  if (!q) return;
  await q.add("migration", { shopId, source }, { attempts: 3 });
}
