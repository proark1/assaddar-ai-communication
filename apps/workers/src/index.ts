import { config } from "dotenv";
import { Worker } from "bullmq";
import { jobSchemas, type WorkerJobName } from "./jobs";

config({ path: new URL("../../../.env", import.meta.url) });

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const parsedRedisUrl = new URL(redisUrl);
const connection = {
  host: parsedRedisUrl.hostname,
  port: Number(parsedRedisUrl.port || 6379),
  username: parsedRedisUrl.username || undefined,
  password: parsedRedisUrl.password || undefined,
  db: parsedRedisUrl.pathname ? Number(parsedRedisUrl.pathname.slice(1) || 0) : 0,
  maxRetriesPerRequest: null
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
          payload
        };
      case "embeddings.generate":
        return {
          status: "skipped",
          reason: "Embedding provider not configured.",
          payload
        };
      case "webhook.process":
        return {
          status: "skipped",
          reason: "Channel credential mapping not configured.",
          payload
        };
      case "usage.meter":
        return {
          status: "ok",
          payload
        };
    }
  },
  {
    connection,
    concurrency: 5
  }
);

worker.on("completed", (job) => {
  console.log(`Completed ${job.name} ${job.id}`);
});

worker.on("failed", (job, error) => {
  console.error(`Failed ${job?.name} ${job?.id}`, error);
});

process.on("SIGTERM", async () => {
  await worker.close();
});
