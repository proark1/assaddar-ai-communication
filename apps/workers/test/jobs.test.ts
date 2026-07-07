import { describe, expect, it } from "vitest";
import {
  EmbeddingBackfillJobSchema,
  EmbeddingJobSchema,
  FileParsingJobSchema,
  jobSchemas,
  RetentionCleanupJobSchema,
  SuggestionScanJobSchema,
  UsageMeteringJobSchema,
  WebhookProcessingJobSchema,
} from "../src/jobs";

const uuid = "11111111-1111-4111-8111-111111111111";
const uuid2 = "22222222-2222-4222-8222-222222222222";

describe("jobSchemas", () => {
  it("exposes a schema for every worker job name", () => {
    expect(Object.keys(jobSchemas).sort()).toEqual(
      [
        "deliveries.retry",
        "embeddings.backfill",
        "embeddings.generate",
        "file.parse",
        "retention.cleanup",
        "suggestions.scan",
        "usage.meter",
        "webhook.process",
      ].sort(),
    );
  });

  describe("FileParsingJobSchema", () => {
    it("parses a valid payload", () => {
      const payload = { tenantId: uuid, sourceId: uuid2, objectKey: "docs/a" };
      expect(FileParsingJobSchema.parse(payload)).toEqual(payload);
    });

    it("rejects a non-uuid tenantId", () => {
      const result = FileParsingJobSchema.safeParse({
        tenantId: "not-a-uuid",
        sourceId: uuid2,
        objectKey: "docs/a",
      });
      expect(result.success).toBe(false);
    });

    it("rejects an empty objectKey", () => {
      const result = FileParsingJobSchema.safeParse({
        tenantId: uuid,
        sourceId: uuid2,
        objectKey: "",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("EmbeddingJobSchema", () => {
    it("parses a valid payload with at least one chunk id", () => {
      const payload = {
        tenantId: uuid,
        documentId: uuid2,
        chunkIds: [uuid],
      };
      expect(EmbeddingJobSchema.parse(payload)).toEqual(payload);
    });

    it("rejects an empty chunkIds array", () => {
      const result = EmbeddingJobSchema.safeParse({
        tenantId: uuid,
        documentId: uuid2,
        chunkIds: [],
      });
      expect(result.success).toBe(false);
    });

    it("rejects a non-uuid chunk id", () => {
      const result = EmbeddingJobSchema.safeParse({
        tenantId: uuid,
        documentId: uuid2,
        chunkIds: ["nope"],
      });
      expect(result.success).toBe(false);
    });
  });

  describe("WebhookProcessingJobSchema", () => {
    it("parses a valid payload", () => {
      expect(
        WebhookProcessingJobSchema.parse({ webhookEventId: uuid }),
      ).toEqual({ webhookEventId: uuid });
    });

    it("rejects a missing webhookEventId", () => {
      expect(WebhookProcessingJobSchema.safeParse({}).success).toBe(false);
    });
  });

  describe("UsageMeteringJobSchema", () => {
    it("parses a valid payload", () => {
      const payload = { tenantId: uuid, eventId: uuid2 };
      expect(UsageMeteringJobSchema.parse(payload)).toEqual(payload);
    });

    it("rejects a non-uuid eventId", () => {
      const result = UsageMeteringJobSchema.safeParse({
        tenantId: uuid,
        eventId: "bad",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("maintenance schemas accept empty payloads", () => {
    it("EmbeddingBackfillJobSchema parses an empty object", () => {
      expect(EmbeddingBackfillJobSchema.parse({})).toEqual({});
    });

    it("RetentionCleanupJobSchema parses an empty object", () => {
      expect(RetentionCleanupJobSchema.parse({})).toEqual({});
    });

    it("SuggestionScanJobSchema parses an empty object", () => {
      expect(SuggestionScanJobSchema.parse({})).toEqual({});
    });

    it("maintenance schemas passthrough unknown keys", () => {
      expect(EmbeddingBackfillJobSchema.parse({ extra: 1 })).toEqual({
        extra: 1,
      });
    });
  });
});
