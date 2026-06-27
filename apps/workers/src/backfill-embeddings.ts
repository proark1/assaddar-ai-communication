/**
 * One-shot backfill that embeds every approved knowledge chunk that does not
 * yet have an embedding, across all tenants.
 *
 * Run this once to activate semantic retrieval after setting OPENAI_API_KEY and
 * applying the pgvector migration:
 *
 *   pnpm backfill:embeddings
 *
 * It is idempotent — re-running only embeds chunks that are still missing one,
 * so it is safe to schedule periodically to pick up newly added knowledge.
 */
import { config } from "dotenv";
import { createEmbeddingProvider } from "@assaddar/core";
import { createDbClient, TenantRepository } from "@assaddar/db";

config({ path: new URL("../../../.env", import.meta.url) });

const BATCH_SIZE = 100;

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
          [chunk.title, chunk.content]
            .filter(Boolean)
            .join("\n")
            .slice(0, 8000),
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
          console.warn(
            `${tenant.id}: ${chunks.length} chunk(s) could not be embedded; skipping the rest.`,
          );
          break;
        }
      }
      if (embeddedForTenant > 0) {
        console.log(`${tenant.id}: embedded ${embeddedForTenant} chunk(s)`);
      }
      total += embeddedForTenant;
    }
    console.log(`Backfill complete. Embedded ${total} chunk(s) total.`);
  } finally {
    await dbClient.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
