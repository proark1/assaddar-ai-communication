import { and, eq, sql } from "drizzle-orm";
import type { DbExecutor } from "./client";
import { onebrainSyncRecords } from "./schema";

export type OneBrainSyncRecord = typeof onebrainSyncRecords.$inferSelect;

export type OneBrainSyncSourceInput = {
  provider?: string | undefined;
  sourceType: string;
  sourceId: string;
};

export type RecordOneBrainSyncInput = OneBrainSyncSourceInput & {
  sourceRef: string;
  contentHash: string;
  externalRecordId?: string | null | undefined;
  error?: string | null | undefined;
  metadata?: Record<string, unknown> | undefined;
};

function normalizeOneBrainSyncSource(input: OneBrainSyncSourceInput) {
  const provider = input.provider?.trim() || "onebrain";
  const sourceType = input.sourceType.trim();
  const sourceId = input.sourceId.trim();
  if (!sourceType || !sourceId) {
    throw new Error("OneBrain sync source type and id are required.");
  }
  return { provider, sourceType, sourceId };
}

export async function getOneBrainSyncRecordRow(
  db: DbExecutor,
  tenantId: string,
  input: OneBrainSyncSourceInput,
): Promise<OneBrainSyncRecord | null> {
  const source = normalizeOneBrainSyncSource(input);
  const [record] = await db
    .select()
    .from(onebrainSyncRecords)
    .where(
      and(
        eq(onebrainSyncRecords.tenantId, tenantId),
        eq(onebrainSyncRecords.provider, source.provider),
        eq(onebrainSyncRecords.sourceType, source.sourceType),
        eq(onebrainSyncRecords.sourceId, source.sourceId),
      ),
    )
    .limit(1);
  return record ?? null;
}

export async function recordOneBrainSyncSuccessRow(
  db: DbExecutor,
  tenantId: string,
  input: RecordOneBrainSyncInput,
): Promise<OneBrainSyncRecord> {
  const source = normalizeOneBrainSyncSource(input);
  const [record] = await db
    .insert(onebrainSyncRecords)
    .values({
      tenantId,
      provider: source.provider,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      sourceRef: input.sourceRef,
      contentHash: input.contentHash,
      status: "synced",
      externalRecordId: input.externalRecordId ?? null,
      lastError: null,
      syncedAt: new Date(),
      metadata: input.metadata ?? {},
    })
    .onConflictDoUpdate({
      target: [
        onebrainSyncRecords.tenantId,
        onebrainSyncRecords.provider,
        onebrainSyncRecords.sourceType,
        onebrainSyncRecords.sourceId,
      ],
      set: {
        sourceRef: input.sourceRef,
        contentHash: input.contentHash,
        status: "synced",
        externalRecordId: input.externalRecordId ?? null,
        lastError: null,
        syncedAt: new Date(),
        metadata: input.metadata ?? {},
        updatedAt: sql`now()`,
      },
    })
    .returning();
  if (!record) {
    throw new Error("Failed to record OneBrain sync success.");
  }
  return record;
}

export async function recordOneBrainSyncFailureRow(
  db: DbExecutor,
  tenantId: string,
  input: RecordOneBrainSyncInput,
): Promise<OneBrainSyncRecord> {
  const source = normalizeOneBrainSyncSource(input);
  const [record] = await db
    .insert(onebrainSyncRecords)
    .values({
      tenantId,
      provider: source.provider,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      sourceRef: input.sourceRef,
      contentHash: input.contentHash,
      status: "failed",
      lastError: input.error ?? "OneBrain sync failed.",
      metadata: input.metadata ?? {},
    })
    .onConflictDoUpdate({
      target: [
        onebrainSyncRecords.tenantId,
        onebrainSyncRecords.provider,
        onebrainSyncRecords.sourceType,
        onebrainSyncRecords.sourceId,
      ],
      set: {
        sourceRef: input.sourceRef,
        contentHash: input.contentHash,
        status: "failed",
        lastError: input.error ?? "OneBrain sync failed.",
        metadata: input.metadata ?? {},
        updatedAt: sql`now()`,
      },
    })
    .returning();
  if (!record) {
    throw new Error("Failed to record OneBrain sync failure.");
  }
  return record;
}
