import { config } from "dotenv";
import { Worker } from "bullmq";
import { createEmbeddingProvider } from "@assaddar/core";
import { createDbClient, TenantRepository } from "@assaddar/db";
import { jobSchemas, type WorkerJobName } from "./jobs";

config({ path: new URL("../../../.env", import.meta.url) });

const dbClient = createDbClient();
const repository = new TenantRepository(dbClient.db);
const embeddingProvider = createEmbeddingProvider(process.env);

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

const worker = new Worker(
  "assaddar-platform",
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
        const vectors = await embeddingProvider.embed(inputs);
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
  console.error(`Failed ${job?.name} ${job?.id}`, error);
});

process.on("SIGTERM", async () => {
  await worker.close();
  await dbClient.close();
});
