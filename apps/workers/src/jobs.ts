import { z } from "zod";

export const FileParsingJobSchema = z.object({
  tenantId: z.string().uuid(),
  sourceId: z.string().uuid(),
  objectKey: z.string().min(1)
});

export const EmbeddingJobSchema = z.object({
  tenantId: z.string().uuid(),
  documentId: z.string().uuid(),
  chunkIds: z.array(z.string().uuid()).min(1)
});

export const WebhookProcessingJobSchema = z.object({
  webhookEventId: z.string().uuid()
});

export const UsageMeteringJobSchema = z.object({
  tenantId: z.string().uuid(),
  eventId: z.string().uuid()
});

export type WorkerJobName =
  | "file.parse"
  | "embeddings.generate"
  | "webhook.process"
  | "usage.meter";

export const jobSchemas = {
  "file.parse": FileParsingJobSchema,
  "embeddings.generate": EmbeddingJobSchema,
  "webhook.process": WebhookProcessingJobSchema,
  "usage.meter": UsageMeteringJobSchema
} satisfies Record<WorkerJobName, z.ZodTypeAny>;
