import { and, desc, eq, sql } from "drizzle-orm";
import type { DbExecutor } from "./client";
import { toAggregateDate } from "./repository-helpers";
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

export type OneBrainSyncSummary = {
  total: number;
  byStatus: {
    synced: number;
    failed: number;
    pending: number;
    other: number;
  };
  lastSyncedAt: Date | null;
  lastFailedAt: Date | null;
  recentFailures: OneBrainSyncRecord[];
  recentSynced: OneBrainSyncRecord[];
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

export async function getOneBrainSyncSummaryRow(
  db: DbExecutor,
  tenantId: string,
  limit = 5,
): Promise<OneBrainSyncSummary> {
  const normalizedLimit = Number.isFinite(limit) ? Math.trunc(limit) : 5;
  const rowLimit = Math.max(1, Math.min(normalizedLimit, 25));
  const [stats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      synced: sql<number>`count(*) filter (where ${onebrainSyncRecords.status} = 'synced')::int`,
      failed: sql<number>`count(*) filter (where ${onebrainSyncRecords.status} = 'failed')::int`,
      pending: sql<number>`count(*) filter (where ${onebrainSyncRecords.status} = 'pending')::int`,
      other: sql<number>`count(*) filter (where ${onebrainSyncRecords.status} not in ('synced', 'failed', 'pending'))::int`,
      lastSyncedAt: sql<string | null>`max(${onebrainSyncRecords.syncedAt})`,
      lastFailedAt: sql<
        string | null
      >`max(${onebrainSyncRecords.updatedAt}) filter (where ${onebrainSyncRecords.status} = 'failed')`,
    })
    .from(onebrainSyncRecords)
    .where(eq(onebrainSyncRecords.tenantId, tenantId));
  const [recentFailures, recentSynced] = await Promise.all([
    db
      .select()
      .from(onebrainSyncRecords)
      .where(
        and(
          eq(onebrainSyncRecords.tenantId, tenantId),
          eq(onebrainSyncRecords.status, "failed"),
        ),
      )
      .orderBy(desc(onebrainSyncRecords.updatedAt))
      .limit(rowLimit),
    db
      .select()
      .from(onebrainSyncRecords)
      .where(
        and(
          eq(onebrainSyncRecords.tenantId, tenantId),
          eq(onebrainSyncRecords.status, "synced"),
        ),
      )
      .orderBy(
        desc(
          sql`coalesce(${onebrainSyncRecords.syncedAt}, ${onebrainSyncRecords.updatedAt})`,
        ),
      )
      .limit(rowLimit),
  ]);
  return {
    total: stats?.total ?? 0,
    byStatus: {
      synced: stats?.synced ?? 0,
      failed: stats?.failed ?? 0,
      pending: stats?.pending ?? 0,
      other: stats?.other ?? 0,
    },
    lastSyncedAt: toAggregateDate(stats?.lastSyncedAt),
    lastFailedAt: toAggregateDate(stats?.lastFailedAt),
    recentFailures,
    recentSynced,
  };
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
