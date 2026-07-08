import { z } from "zod";

export const FileParsingJobSchema = z.object({
  tenantId: z.string().uuid(),
  sourceId: z.string().uuid(),
  objectKey: z.string().min(1),
});

export const EmbeddingJobSchema = z.object({
  tenantId: z.string().uuid(),
  documentId: z.string().uuid(),
  chunkIds: z.array(z.string().uuid()).min(1),
});

export const WebhookProcessingJobSchema = z.object({
  webhookEventId: z.string().uuid(),
});

export const UsageMeteringJobSchema = z.object({
  tenantId: z.string().uuid(),
  eventId: z.string().uuid(),
});

/**
 * Internal maintenance jobs scheduled as BullMQ repeatable jobs by the workers
 * service itself (not produced by the API). They carry no per-tenant payload —
 * they sweep across all tenants — so the schemas just allow an empty object.
 */
export const EmbeddingBackfillJobSchema = z.object({}).passthrough();

export const RetentionCleanupJobSchema = z.object({}).passthrough();

export const DeliveryRetryJobSchema = z.object({}).passthrough();

export const SuggestionScanJobSchema = z.object({}).passthrough();

export const OneBrainSyncJobSchema = z.object({}).passthrough();

export type WorkerJobName =
  | "file.parse"
  | "embeddings.generate"
  | "webhook.process"
  | "usage.meter"
  | "embeddings.backfill"
  | "retention.cleanup"
  | "deliveries.retry"
  | "suggestions.scan"
  | "onebrain.sync";

export const jobSchemas = {
  "file.parse": FileParsingJobSchema,
  "embeddings.generate": EmbeddingJobSchema,
  "webhook.process": WebhookProcessingJobSchema,
  "usage.meter": UsageMeteringJobSchema,
  "embeddings.backfill": EmbeddingBackfillJobSchema,
  "retention.cleanup": RetentionCleanupJobSchema,
  "deliveries.retry": DeliveryRetryJobSchema,
  "suggestions.scan": SuggestionScanJobSchema,
  "onebrain.sync": OneBrainSyncJobSchema,
} satisfies Record<WorkerJobName, z.ZodTypeAny>;
