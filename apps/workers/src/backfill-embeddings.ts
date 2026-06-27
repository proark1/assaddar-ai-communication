/**
 * Backfill that embeds every approved knowledge chunk that does not yet have an
 * embedding, across all tenants.
 *
 * The core logic lives in {@link backfillMissingEmbeddings} so it can be reused
 * by both this one-shot CLI (`pnpm backfill:embeddings`) and the repeatable
 * worker job in `index.ts` that keeps embeddings fresh automatically. It is
 * idempotent — re-running only embeds chunks that are still missing one — so it
 * is safe to schedule periodically to pick up newly added knowledge.
 */
import { config } from "dotenv";
import {
  createEmbeddingProvider,
  type EmbeddingProvider,
} from "@assaddar/core";
import { createDbClient, TenantRepository } from "@assaddar/db";

config({ path: new URL("../../../.env", import.meta.url) });

const BATCH_SIZE = 100;

export type BackfillResult = {
  tenants: number;
  embedded: number;
};

/**
 * Embed all approved chunks that still lack an embedding, across every tenant.
 * Pages through each tenant in batches and persists embeddings idempotently.
 * Returns how many tenants were scanned and how many chunks were embedded.
 *
 * `log` defaults to a console logger; pass a no-op (or structured logger) when
 * running inside the worker to keep noise down.
 */
export async function backfillMissingEmbeddings(
  repository: TenantRepository,
  provider: EmbeddingProvider,
  log: (message: string) => void = console.log,
): Promise<BackfillResult> {
  const tenants = await repository.listTenants();
  let total = 0;
  for (const tenant of tenants) {
    let embeddedForTenant = 0;
    for (;;) {
      const chunks = await repository.listChunksMissingEmbedding(
        tenant.id,
        BATCH_SIZE,
      );
      if (chunks.length === 0) {
        break;
      }
      const inputs = chunks.map((chunk) =>
        [chunk.title, chunk.content].filter(Boolean).join("\n").slice(0, 8000),
      );
      const vectors = await provider.embed(inputs);
      let embeddedThisRound = 0;
      for (let index = 0; index < chunks.length; index += 1) {
        const vector = vectors[index];
        const chunk = chunks[index];
        if (!vector || !chunk) {
          continue;
        }
        await repository.setChunkEmbedding(tenant.id, chunk.id, vector);
        embeddedThisRound += 1;
      }
      embeddedForTenant += embeddedThisRound;
      // Guard against an infinite loop: if a batch produced no embeddings,
      // those chunks would be re-fetched forever. Stop and report instead.
      if (embeddedThisRound === 0) {
        log(
          `${tenant.id}: ${chunks.length} chunk(s) could not be embedded; skipping the rest.`,
        );
        break;
      }
    }
    if (embeddedForTenant > 0) {
      log(`${tenant.id}: embedded ${embeddedForTenant} chunk(s)`);
    }
    total += embeddedForTenant;
  }
  return { tenants: tenants.length, embedded: total };
}

async function main() {
  const provider = createEmbeddingProvider(process.env);
  if (!provider) {
    console.error(
      "Embedding provider not configured. Set OPENAI_API_KEY (and apply the " +
        "pgvector migration) before running the embeddings backfill.",
    );
    process.exitCode = 1;
    return;
  }

  const dbClient = createDbClient();
  const repository = new TenantRepository(dbClient.db);

  try {
    const result = await backfillMissingEmbeddings(repository, provider);
    console.log(
      `Backfill complete. Embedded ${result.embedded} chunk(s) total.`,
    );
  } finally {
    await dbClient.close();
  }
}

// Only run the CLI when executed directly, not when imported by the worker.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
