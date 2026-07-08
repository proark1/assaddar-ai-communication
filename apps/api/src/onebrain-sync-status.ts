import type { OneBrainSyncRecord, OneBrainSyncSummary } from "@assaddar/db";

const ONEBRAIN_DOCS_URL =
  "https://github.com/proark1/assaddar-ai-communication/blob/main/docs/deployment.md#onebrain-sync";

export type OneBrainSyncStatus = {
  enabled: boolean;
  configured: boolean;
  readiness: "not_configured" | "disabled" | "syncing" | "synced" | "failed";
  stats: OneBrainSyncSummary["byStatus"] & { total: number };
  lastSyncedAt: string | null;
  lastFailedAt: string | null;
  recentFailures: OneBrainSyncStatusRecord[];
  recentSynced: OneBrainSyncStatusRecord[];
  docsUrl: string;
};

export type OneBrainSyncStatusRecord = {
  id: string;
  sourceType: string;
  sourceId: string;
  sourceRef: string;
  status: string;
  externalRecordId: string | null;
  lastError: string | null;
  syncedAt: string | null;
  updatedAt: string | null;
};

export type OneBrainSyncStatusStore = {
  getOneBrainSyncSummary(
    tenantId: string,
    limit?: number,
  ): Promise<OneBrainSyncSummary>;
};

export type OneBrainSyncStatusEnv = {
  ONEBRAIN_SYNC_ENABLED?: string;
  ONEBRAIN_API_BASE_URL?: string;
  ONEBRAIN_SERVICE_KEY?: string;
};

export async function buildOneBrainSyncStatus(
  store: OneBrainSyncStatusStore,
  tenantId: string,
  env: OneBrainSyncStatusEnv = process.env,
): Promise<OneBrainSyncStatus> {
  const summary = await store.getOneBrainSyncSummary(tenantId, 5);
  const configured = Boolean(
    env.ONEBRAIN_API_BASE_URL?.trim() && env.ONEBRAIN_SERVICE_KEY?.trim(),
  );
  const enabled = (env.ONEBRAIN_SYNC_ENABLED ?? "").toLowerCase() === "true";
  const stats = { total: summary.total, ...summary.byStatus };
  return {
    enabled,
    configured,
    readiness: deriveOneBrainSyncReadiness(configured, enabled, stats),
    stats,
    lastSyncedAt: toIso(summary.lastSyncedAt),
    lastFailedAt: toIso(summary.lastFailedAt),
    recentFailures: summary.recentFailures.map(toStatusRecord),
    recentSynced: summary.recentSynced.map(toStatusRecord),
    docsUrl: ONEBRAIN_DOCS_URL,
  };
}

function deriveOneBrainSyncReadiness(
  configured: boolean,
  enabled: boolean,
  stats: OneBrainSyncStatus["stats"],
): OneBrainSyncStatus["readiness"] {
  if (!configured) {
    return "not_configured";
  }
  if (!enabled) {
    return "disabled";
  }
  if (stats.failed > 0) {
    return "failed";
  }
  return stats.synced > 0 ? "synced" : "syncing";
}

function toStatusRecord(record: OneBrainSyncRecord): OneBrainSyncStatusRecord {
  return {
    id: record.id,
    sourceType: record.sourceType,
    sourceId: record.sourceId,
    sourceRef: record.sourceRef,
    status: record.status,
    externalRecordId: record.externalRecordId ?? null,
    lastError: record.lastError ?? null,
    syncedAt: toIso(record.syncedAt),
    updatedAt: toIso(record.updatedAt),
  };
}

function toIso(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : value;
}
