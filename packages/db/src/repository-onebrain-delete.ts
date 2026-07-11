import { and, asc, eq, isNotNull, or, sql } from "drizzle-orm";
import type { DbExecutor } from "./client";
import { onebrainDeleteOutbox, onebrainSyncRecords } from "./schema";

export type OneBrainDeleteOutboxRow = typeof onebrainDeleteOutbox.$inferSelect;

/**
 * Capture the OneBrain records a tenant had synced into the delete outbox, BEFORE
 * the tenant is deleted. Runs on the same (tenant-scoped) executor as the tenant
 * delete, so it reads the tenant's onebrain_sync_records before the cascade wipes
 * them and writes durable, tenant-FK-free outbox rows that survive the delete.
 * Returns the number of rows enqueued.
 */
export async function captureOneBrainDeletesForTenantRow(
  db: DbExecutor,
  tenantId: string,
): Promise<number> {
  // Capture every record that has (or had) a remote copy — status='synced' OR a
  // retained external_record_id. A record that synced successfully and later hit
  // a failed re-sync flips to status='failed' but keeps its external_record_id,
  // so a synced-only filter would silently leave that remote copy un-erased.
  const synced = await db
    .select({
      provider: onebrainSyncRecords.provider,
      sourceRef: onebrainSyncRecords.sourceRef,
      externalRecordId: onebrainSyncRecords.externalRecordId,
    })
    .from(onebrainSyncRecords)
    .where(
      and(
        eq(onebrainSyncRecords.tenantId, tenantId),
        or(
          eq(onebrainSyncRecords.status, "synced"),
          isNotNull(onebrainSyncRecords.externalRecordId),
        ),
      ),
    );
  if (synced.length === 0) {
    return 0;
  }
  await db.insert(onebrainDeleteOutbox).values(
    synced.map((row) => ({
      tenantId,
      provider: row.provider,
      sourceRef: row.sourceRef,
      externalRecordId: row.externalRecordId ?? null,
    })),
  );
  return synced.length;
}

export async function listPendingOneBrainDeleteRows(
  db: DbExecutor,
  limit = 100,
): Promise<OneBrainDeleteOutboxRow[]> {
  const rowLimit = Math.max(1, Math.min(Math.trunc(limit) || 100, 500));
  return db
    .select()
    .from(onebrainDeleteOutbox)
    .where(eq(onebrainDeleteOutbox.status, "pending"))
    .orderBy(asc(onebrainDeleteOutbox.createdAt))
    .limit(rowLimit);
}

export async function markOneBrainDeleteDoneRow(
  db: DbExecutor,
  id: string,
): Promise<void> {
  await db
    .update(onebrainDeleteOutbox)
    .set({
      status: "done",
      lastError: null,
      processedAt: new Date(),
      updatedAt: sql`now()`,
    })
    .where(eq(onebrainDeleteOutbox.id, id));
}

/**
 * Record a failed drain attempt. The row stays `pending` for a later retry until
 * `exhausted` (attempts reached the cap), at which point it becomes `failed` so a
 * permanently-broken record cannot block the queue forever.
 */
export async function markOneBrainDeleteFailedRow(
  db: DbExecutor,
  id: string,
  error: string,
  exhausted: boolean,
): Promise<void> {
  await db
    .update(onebrainDeleteOutbox)
    .set({
      status: exhausted ? "failed" : "pending",
      attempts: sql`${onebrainDeleteOutbox.attempts} + 1`,
      lastError: error.slice(0, 1000),
      processedAt: exhausted ? new Date() : null,
      updatedAt: sql`now()`,
    })
    .where(eq(onebrainDeleteOutbox.id, id));
}
