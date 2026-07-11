import { config } from "dotenv";
import * as Sentry from "@sentry/node";
import { Queue, Worker, type JobsOptions } from "bullmq";
import { createChannelAdapterRegistry } from "@assaddar/channels";
import {
  createEmbeddingProvider,
  createOneBrainProvider,
} from "@assaddar/core";
import {
  createDbClient,
  createEnvChannelCredentialCipher,
  resolveAppConnectionString,
  TenantRepository,
} from "@assaddar/db";
import { backfillMissingEmbeddings } from "./backfill-embeddings";
import { startHealthServer } from "./health";
import { retryFailedDeliveries } from "./retry-deliveries";
import { jobSchemas, type WorkerJobName } from "./jobs";
import { syncApprovedKnowledgeToOneBrain } from "./onebrain-sync";
import { processOneBrainDeleteOutbox } from "./onebrain-delete-drain";
import {
  consumeTombstoneFeed,
  type TenantResolution,
} from "./onebrain-tombstone-consume";

config({ path: new URL("../../../.env", import.meta.url) });

/**
 * Initialise Sentry only when SENTRY_DSN is set; otherwise this is a no-op and
 * error reporting stays inert (no behaviour change).
 */
function initSentry() {
  // Read the DSN from the environment; never hardcode it.
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    return;
  }
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0,
  });
}

initSentry();

const QUEUE_NAME = "assaddar-platform";

// The workers service is a TRUSTED maintenance process that sweeps across all
// tenants (retention cleanup, delivery retries), so it connects as the owner
// role via DATABASE_URL rather than the RLS-restricted APP_DATABASE_URL that
// the API uses. Falls back to the app URL when DATABASE_URL is unset (dev).
const dbClient = createDbClient(
  process.env.DATABASE_URL ?? resolveAppConnectionString(),
);
const repository = new TenantRepository(
  dbClient.db,
  dbClient.db,
  undefined,
  createEnvChannelCredentialCipher(process.env),
);
const embeddingProvider = createEmbeddingProvider(process.env);
const oneBrainProvider = createOneBrainProvider(process.env);
const channelAdapters = createChannelAdapterRegistry(process.env);

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const parsedRedisUrl = new URL(redisUrl);
const connection = {
  host: parsedRedisUrl.hostname,
  port: Number(parsedRedisUrl.port || 6379),
  username: parsedRedisUrl.username || undefined,
  password: parsedRedisUrl.password || undefined,
  db: parsedRedisUrl.pathname
    ? Number(parsedRedisUrl.pathname.slice(1) || 0)
    : 0,
  maxRetriesPerRequest: null,
};

/**
 * Robust defaults for every job produced by this service:
 *  - `attempts` + exponential `backoff` so transient failures (a flaky
 *    embedding provider, a brief DB blip) are retried instead of lost.
 *  - `removeOnComplete` keeps a small recent window so the completed set does
 *    not grow without bound.
 *  - `removeOnFail` deliberately RETAINS a bounded history of failures. This is
 *    a lightweight dead-letter: failed jobs (after exhausting retries) stay in
 *    Redis so they can be inspected/replayed, but capped so they cannot grow
 *    forever.
 */
const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 5_000,
  },
  removeOnComplete: {
    age: 24 * 60 * 60, // keep completed jobs for 24h
    count: 100, // ...but never more than the last 100
  },
  removeOnFail: {
    age: 7 * 24 * 60 * 60, // keep failures for 7 days (dead-letter window)
    count: 1_000, // ...capped at the last 1000 so the set stays bounded
  },
};

/**
 * Producer used to schedule this service's own maintenance jobs. We create the
 * Queue here, inside the WORKERS process, rather than enqueuing from the API.
 *
 * Why: keeping embeddings fresh and enforcing retention used to be candidates
 * for event-driven enqueue from the API (e.g. on knowledge edit). Doing so
 * would couple the API to Redis. Instead the workers service owns a couple of
 * BullMQ *repeatable* jobs that periodically sweep across all tenants, so the
 * API stays Redis-free and the behaviour is fully self-contained here.
 */
const queue = new Queue(QUEUE_NAME, {
  connection,
  defaultJobOptions,
});

function parsePositiveIntEnv(value: string | undefined, fallback: number) {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveRetentionCleanupEnabled(env: {
  NODE_ENV?: string | undefined;
  RETENTION_CLEANUP_ENABLED?: string | undefined;
}) {
  const raw = env.RETENTION_CLEANUP_ENABLED?.trim().toLowerCase();
  if (!raw) {
    return env.NODE_ENV === "production";
  }
  return raw === "true";
}

// Default: re-scan for missing embeddings every 5 minutes.
const EMBEDDING_BACKFILL_INTERVAL_MS = parsePositiveIntEnv(
  process.env.EMBEDDING_BACKFILL_INTERVAL_MS,
  5 * 60 * 1000,
);

// Default: run retention cleanup once an hour (only acts when enabled, below).
const RETENTION_CLEANUP_INTERVAL_MS = parsePositiveIntEnv(
  process.env.RETENTION_CLEANUP_INTERVAL_MS,
  60 * 60 * 1000,
);

// Default: re-attempt transiently-failed outbound deliveries every minute.
const DELIVERY_RETRY_INTERVAL_MS = parsePositiveIntEnv(
  process.env.DELIVERY_RETRY_INTERVAL_MS,
  60 * 1000,
);

// Default: sweep unanswered handoffs into learning suggestions every 10 minutes.
// Non-destructive (only inserts pending review items), so it runs unconditionally.
const SUGGESTION_SCAN_INTERVAL_MS = parsePositiveIntEnv(
  process.env.SUGGESTION_SCAN_INTERVAL_MS,
  10 * 60 * 1000,
);

// OneBrain sync is opt-in because OneBrain currently treats source_ref as
// provenance, not a guaranteed idempotency key. Enable only after provisioning
// the tenant/account/space and deciding the expected sync cadence.
const ONEBRAIN_SYNC_ENABLED =
  (process.env.ONEBRAIN_SYNC_ENABLED ?? "").toLowerCase() === "true";

const ONEBRAIN_SYNC_INTERVAL_MS = parsePositiveIntEnv(
  process.env.ONEBRAIN_SYNC_INTERVAL_MS,
  60 * 60 * 1000,
);

const ONEBRAIN_DELETE_DRAIN_INTERVAL_MS = parsePositiveIntEnv(
  process.env.ONEBRAIN_DELETE_DRAIN_INTERVAL_MS,
  5 * 60 * 1000,
);

const ONEBRAIN_TOMBSTONE_CONSUME_INTERVAL_MS = parsePositiveIntEnv(
  process.env.ONEBRAIN_TOMBSTONE_CONSUME_INTERVAL_MS,
  5 * 60 * 1000,
);

// Destructive auto-erase from the remote feed is opt-in: enable only once the
// account->tenant mapping is known safe (single tenant, or immutable-id mapping).
const ONEBRAIN_TOMBSTONE_ERASE_ENABLED =
  (process.env.ONEBRAIN_TOMBSTONE_ERASE_ENABLED ?? "").toLowerCase() === "true";

// A OneBrain account maps to a tenant by slug (see the sync scope derivation).
// A deployment-wide account override collapses that mapping, so a tombstone can
// no longer be attributed to one tenant — the consumer must refuse to delete.
async function resolveTombstoneTenant(
  accountId: string,
): Promise<TenantResolution> {
  if ((process.env.ONEBRAIN_ACCOUNT_ID ?? "").trim()) {
    return { status: "ambiguous" };
  }
  const tenant = await repository.getTenantBySlug(accountId);
  return tenant
    ? { status: "matched", tenantId: tenant.id }
    : { status: "no_local_tenant" };
}

// Retention deletion is DESTRUCTIVE, so it stays easy to disable in development,
// but production defaults to ON to avoid silently retaining personal data
// forever after deploy. The handler re-checks this value before deleting.
const RETENTION_CLEANUP_ENABLED = resolveRetentionCleanupEnabled(process.env);
if (
  process.env.NODE_ENV === "production" &&
  process.env.RETENTION_CLEANUP_ENABLED?.trim().toLowerCase() === "false"
) {
  console.warn(
    "Retention cleanup is explicitly disabled in production. Old personal data will not be pruned.",
  );
}

const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    const name = job.name as WorkerJobName;
    const schema = jobSchemas[name];
    if (!schema) {
      throw new Error(`Unknown job: ${job.name}`);
    }

    const payload = schema.parse(job.data);
    switch (name) {
      case "file.parse":
        return {
          status: "skipped",
          reason: "Object storage parser provider not configured.",
          payload,
        };
      case "embeddings.generate": {
        if (!embeddingProvider) {
          return {
            status: "skipped",
            reason: "Embedding provider not configured (set OPENAI_API_KEY).",
            payload,
          };
        }
        const embedPayload = payload as {
          tenantId: string;
          chunkIds: string[];
        };
        const chunks = await repository.listChunksForEmbedding(
          embedPayload.tenantId,
          embedPayload.chunkIds,
        );
        if (chunks.length === 0) {
          return { status: "ok", embedded: 0, payload };
        }
        const inputs = chunks.map((chunk) =>
          [chunk.title, chunk.content]
            .filter(Boolean)
            .join("\n")
            .slice(0, 8000),
        );
        let vectors: number[][];
        try {
          vectors = await embeddingProvider.embed(inputs);
        } catch (error) {
          // Surface embedding failures clearly. Rethrow so BullMQ records the
          // failure and retries per `defaultJobOptions` (no silent drop).
          console.error(
            `[embeddings.generate] embed failed for tenant ${embedPayload.tenantId} ` +
              `(${chunks.length} chunk(s)) job ${job.id}`,
            error,
          );
          throw error;
        }
        let embedded = 0;
        for (let index = 0; index < chunks.length; index += 1) {
          const vector = vectors[index];
          const chunk = chunks[index];
          if (!vector || !chunk) {
            continue;
          }
          await repository.setChunkEmbedding(
            embedPayload.tenantId,
            chunk.id,
            vector,
          );
          embedded += 1;
        }
        return { status: "ok", embedded, payload };
      }
      case "webhook.process":
        return {
          status: "skipped",
          reason: "Channel credential mapping not configured.",
          payload,
        };
      case "usage.meter":
        return {
          status: "ok",
          payload,
        };
      case "embeddings.backfill": {
        // Periodic refresh: embed any approved chunk still missing an embedding
        // across all tenants. Skips gracefully when no provider is configured.
        if (!embeddingProvider) {
          return {
            status: "skipped",
            reason: "Embedding provider not configured (set OPENAI_API_KEY).",
          };
        }
        try {
          const result = await backfillMissingEmbeddings(
            repository,
            embeddingProvider,
            (message) => console.log(`[embeddings.backfill] ${message}`),
          );
          return { status: "ok", ...result };
        } catch (error) {
          console.error(
            `[embeddings.backfill] backfill run failed (job ${job.id})`,
            error,
          );
          throw error;
        }
      }
      case "retention.cleanup": {
        // Re-check the gate inside the handler so a stale scheduled job cannot
        // delete data after the flag is turned off.
        if (!RETENTION_CLEANUP_ENABLED) {
          return {
            status: "skipped",
            reason:
              "Retention cleanup disabled (set RETENTION_CLEANUP_ENABLED=true).",
          };
        }
        const now = new Date();
        const tenants = await repository.listTenants();
        // (a) Prune globally-expired user sessions.
        const removedSessions = await repository.deleteExpiredSessions(now);
        // (b) Per-tenant: delete conversation + call history older than
        // retention_days (calls carry voice transcripts / personal data).
        let deletedConversations = 0;
        let deletedCalls = 0;
        for (const tenant of tenants) {
          try {
            const result = await repository.deleteTenantDataOlderThanRetention(
              tenant.id,
              { now },
            );
            deletedConversations += result.deletedConversations;
            deletedCalls += result.deletedCalls;
            if (result.deletedConversations > 0 || result.deletedCalls > 0) {
              console.log(
                `[retention.cleanup] tenant ${tenant.id}: pruned ` +
                  `${result.deletedConversations} conversation(s) and ` +
                  `${result.deletedCalls} call(s) older than ` +
                  `${tenant.retentionDays} day(s)`,
              );
            }
          } catch (error) {
            // Keep going for other tenants; surface the failure for this one.
            console.error(
              `[retention.cleanup] failed for tenant ${tenant.id}`,
              error,
            );
          }
        }
        return {
          status: "ok",
          removedSessions,
          deletedConversations,
          deletedCalls,
          tenants: tenants.length,
        };
      }
      case "deliveries.retry": {
        try {
          const result = await retryFailedDeliveries(
            repository,
            channelAdapters,
            {
              now: new Date(),
              log: (message) => console.log(`[deliveries.retry] ${message}`),
            },
          );
          return { status: "ok", ...result };
        } catch (error) {
          console.error(`[deliveries.retry] run failed (job ${job.id})`, error);
          throw error;
        }
      }
      case "suggestions.scan": {
        // Periodic sweep: turn unanswered-question handoffs into pending
        // knowledge suggestions across all tenants so answer gaps surface in the
        // review queue without anyone hitting the manual scan endpoint. Purely
        // additive (suggestions still need human approval to reach the brain).
        const tenants = await repository.listTenants();
        let created = 0;
        let scanned = 0;
        for (const tenant of tenants) {
          try {
            const result = await repository.scanKnowledgeSuggestions(tenant.id);
            created += result.created.length;
            scanned += result.scanned;
            if (result.created.length > 0) {
              console.log(
                `[suggestions.scan] tenant ${tenant.id}: created ` +
                  `${result.created.length} learning suggestion(s)`,
              );
            }
          } catch (error) {
            // Keep going for other tenants; surface the failure for this one.
            console.error(
              `[suggestions.scan] failed for tenant ${tenant.id}`,
              error,
            );
          }
        }
        return { status: "ok", created, scanned, tenants: tenants.length };
      }
      case "onebrain.sync": {
        if (!ONEBRAIN_SYNC_ENABLED) {
          return {
            status: "skipped",
            reason: "OneBrain sync disabled (set ONEBRAIN_SYNC_ENABLED=true).",
          };
        }
        if (!oneBrainProvider) {
          return {
            status: "skipped",
            reason:
              "OneBrain provider not configured (set ONEBRAIN_API_BASE_URL, ONEBRAIN_SERVICE_KEY, and ONEBRAIN_SPACE_ID).",
          };
        }
        try {
          const result = await syncApprovedKnowledgeToOneBrain(
            repository,
            oneBrainProvider,
            {
              env: process.env,
              log: (message) => console.log(`[onebrain.sync] ${message}`),
            },
          );
          return { status: "ok", ...result };
        } catch (error) {
          console.error(`[onebrain.sync] run failed (job ${job.id})`, error);
          throw error;
        }
      }
      case "onebrain.delete-drain": {
        if (!ONEBRAIN_SYNC_ENABLED) {
          return {
            status: "skipped",
            reason: "OneBrain sync disabled (set ONEBRAIN_SYNC_ENABLED=true).",
          };
        }
        if (!oneBrainProvider) {
          return {
            status: "skipped",
            reason:
              "OneBrain provider not configured (set ONEBRAIN_API_BASE_URL, ONEBRAIN_SERVICE_KEY, and ONEBRAIN_SPACE_ID).",
          };
        }
        try {
          const result = await processOneBrainDeleteOutbox(
            repository,
            oneBrainProvider,
            {
              log: (message) =>
                console.log(`[onebrain.delete-drain] ${message}`),
            },
          );
          return { status: "ok", ...result };
        } catch (error) {
          console.error(
            `[onebrain.delete-drain] run failed (job ${job.id})`,
            error,
          );
          throw error;
        }
      }
      case "onebrain.tombstone-consume": {
        if (!ONEBRAIN_SYNC_ENABLED) {
          return {
            status: "skipped",
            reason: "OneBrain sync disabled (set ONEBRAIN_SYNC_ENABLED=true).",
          };
        }
        if (
          !oneBrainProvider?.listTombstones ||
          !oneBrainProvider.ackTombstone
        ) {
          return {
            status: "skipped",
            reason:
              "OneBrain provider not configured (set ONEBRAIN_API_BASE_URL, ONEBRAIN_SERVICE_KEY, and ONEBRAIN_SPACE_ID).",
          };
        }
        const provider = oneBrainProvider;
        try {
          const result = await consumeTombstoneFeed(
            {
              getCursor: () => repository.getTombstoneCursor(),
              setCursor: (cursor) => repository.setTombstoneCursor(cursor),
              resolveTenant: resolveTombstoneTenant,
              eraseTenant: (tenantId) => repository.deleteTenantData(tenantId),
            },
            {
              listTombstones: async (since) => {
                const feed = await provider.listTombstones!({ since });
                return {
                  cursor: feed.cursor,
                  tombstones: feed.tombstones.map((tombstone) => ({
                    id: tombstone.id,
                    seq: tombstone.seq,
                    accountId: tombstone.account_id,
                    spaceId: tombstone.space_id,
                    targetType: tombstone.target_type,
                    targetRef: tombstone.target_ref,
                  })),
                };
              },
              ackTombstone: async (id) => {
                await provider.ackTombstone!(id);
              },
            },
            {
              eraseEnabled: ONEBRAIN_TOMBSTONE_ERASE_ENABLED,
              log: (message) =>
                console.log(`[onebrain.tombstone-consume] ${message}`),
            },
          );
          return { status: "ok", ...result };
        } catch (error) {
          console.error(
            `[onebrain.tombstone-consume] run failed (job ${job.id})`,
            error,
          );
          throw error;
        }
      }
    }
  },
  {
    connection,
    concurrency: 5,
  },
);

worker.on("completed", (job) => {
  console.log(`Completed ${job.name} ${job.id}`);
});

worker.on("failed", (job, error) => {
  console.error(
    `Failed ${job?.name ?? "<unknown>"} ${job?.id ?? "<no-id>"} ` +
      `(attempt ${job?.attemptsMade ?? 0}/${job?.opts?.attempts ?? 0})`,
    error,
  );
  // Forward to Sentry only when a DSN is configured (otherwise a no-op).
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(error);
  }
});

worker.on("error", (error) => {
  console.error("Worker error", error);
});

// Liveness endpoint for the container healthcheck (this service has no other
// HTTP surface). Reports 200 while the BullMQ worker is running.
const healthServer = startHealthServer({
  isHealthy: () => worker.isRunning(),
  port: parsePositiveIntEnv(process.env.WORKERS_HEALTH_PORT, 4200),
});

/**
 * Register the repeatable maintenance jobs. `upsertJobScheduler` is idempotent
 * by scheduler id, so restarts simply update the schedule rather than stacking
 * duplicate timers.
 */
async function scheduleMaintenanceJobs() {
  await queue.upsertJobScheduler(
    "embeddings-backfill",
    { every: EMBEDDING_BACKFILL_INTERVAL_MS },
    { name: "embeddings.backfill", data: {} },
  );
  console.log(
    `Scheduled embeddings.backfill every ${EMBEDDING_BACKFILL_INTERVAL_MS}ms`,
  );

  await queue.upsertJobScheduler(
    "deliveries-retry",
    { every: DELIVERY_RETRY_INTERVAL_MS },
    { name: "deliveries.retry", data: {} },
  );
  console.log(
    `Scheduled deliveries.retry every ${DELIVERY_RETRY_INTERVAL_MS}ms`,
  );

  await queue.upsertJobScheduler(
    "suggestions-scan",
    { every: SUGGESTION_SCAN_INTERVAL_MS },
    { name: "suggestions.scan", data: {} },
  );
  console.log(
    `Scheduled suggestions.scan every ${SUGGESTION_SCAN_INTERVAL_MS}ms`,
  );

  if (ONEBRAIN_SYNC_ENABLED && oneBrainProvider) {
    await queue.upsertJobScheduler(
      "onebrain-sync",
      { every: ONEBRAIN_SYNC_INTERVAL_MS },
      { name: "onebrain.sync", data: {} },
    );
    console.log(`Scheduled onebrain.sync every ${ONEBRAIN_SYNC_INTERVAL_MS}ms`);
    await queue.upsertJobScheduler(
      "onebrain-delete-drain",
      { every: ONEBRAIN_DELETE_DRAIN_INTERVAL_MS },
      { name: "onebrain.delete-drain", data: {} },
    );
    console.log(
      `Scheduled onebrain.delete-drain every ${ONEBRAIN_DELETE_DRAIN_INTERVAL_MS}ms`,
    );
    await queue.upsertJobScheduler(
      "onebrain-tombstone-consume",
      { every: ONEBRAIN_TOMBSTONE_CONSUME_INTERVAL_MS },
      { name: "onebrain.tombstone-consume", data: {} },
    );
    console.log(
      `Scheduled onebrain.tombstone-consume every ${ONEBRAIN_TOMBSTONE_CONSUME_INTERVAL_MS}ms`,
    );
  } else {
    await queue.removeJobScheduler("onebrain-sync").catch(() => {});
    await queue.removeJobScheduler("onebrain-delete-drain").catch(() => {});
    await queue
      .removeJobScheduler("onebrain-tombstone-consume")
      .catch(() => {});
    console.log(
      ONEBRAIN_SYNC_ENABLED
        ? "OneBrain sync not scheduled: provider credentials or ONEBRAIN_SPACE_ID are missing."
        : "OneBrain sync disabled (set ONEBRAIN_SYNC_ENABLED=true to enable).",
    );
  }

  if (RETENTION_CLEANUP_ENABLED) {
    await queue.upsertJobScheduler(
      "retention-cleanup",
      { every: RETENTION_CLEANUP_INTERVAL_MS },
      { name: "retention.cleanup", data: {} },
    );
    console.log(
      `Scheduled retention.cleanup every ${RETENTION_CLEANUP_INTERVAL_MS}ms`,
    );
  } else {
    // Ensure a previously-scheduled cleanup is removed when the flag is off, so
    // toggling the env var actually stops the destructive job.
    await queue.removeJobScheduler("retention-cleanup").catch(() => {});
    console.log(
      "Retention cleanup disabled (set RETENTION_CLEANUP_ENABLED=true to enable).",
    );
  }
}

scheduleMaintenanceJobs().catch((error) => {
  console.error("Failed to schedule maintenance jobs", error);
});

process.on("SIGTERM", async () => {
  healthServer.close();
  await worker.close();
  await queue.close();
  await dbClient.close();
});
