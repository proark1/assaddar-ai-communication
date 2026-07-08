import {
  ONEBRAIN_COMMUNICATION_APP_ID,
  ONEBRAIN_KNOWLEDGE_PURPOSE,
  ONEBRAIN_SOURCE,
  oneBrainSourceRef,
  type BrainIntakeInput,
  type BrainProvider,
  type BrainScope,
  type OneBrainIntakeResponse,
} from "@assaddar/core";
import { createHash } from "node:crypto";

const MAX_ONEBRAIN_TITLE_CHARS = 200;
const MAX_ONEBRAIN_CONTENT_CHARS = 20_000;
const DEFAULT_PER_TENANT_LIMIT = 50;

export type OneBrainKnowledgeSyncEnv = {
  ONEBRAIN_ACCOUNT_ID?: string;
  ONEBRAIN_SPACE_ID?: string;
  ONEBRAIN_APP_ID?: string;
  ONEBRAIN_KNOWLEDGE_PURPOSE?: string;
  ONEBRAIN_KNOWLEDGE_EXPORT_LIMIT?: string;
};

export type OneBrainKnowledgeTenant = {
  id: string;
  publicId?: string | null;
  slug?: string | null;
  name?: string | null;
  status?: string | null;
};

export type OneBrainKnowledgeItem = {
  id: string;
  documentId: string;
  sourceId: string;
  title?: string | null;
  content: string;
  tags: string[];
  status: string;
  metadata: Record<string, unknown>;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
};

export type OneBrainKnowledgeSyncStore = {
  listTenants(): Promise<OneBrainKnowledgeTenant[]>;
  listKnowledge(
    tenantId: string,
    options: { status: string; limit: number; offset: number },
  ): Promise<OneBrainKnowledgeItem[]>;
  getOneBrainSyncRecord(
    tenantId: string,
    input: OneBrainSyncSource,
  ): Promise<OneBrainSyncRecord | null>;
  recordOneBrainSyncSuccess(
    tenantId: string,
    input: OneBrainSyncWrite,
  ): Promise<unknown>;
  recordOneBrainSyncFailure(
    tenantId: string,
    input: OneBrainSyncWrite,
  ): Promise<unknown>;
};

export type OneBrainSyncSource = {
  provider?: string;
  sourceType: string;
  sourceId: string;
};

export type OneBrainSyncRecord = {
  contentHash: string;
  status: string;
};

export type OneBrainSyncWrite = OneBrainSyncSource & {
  sourceRef: string;
  contentHash: string;
  externalRecordId?: string | null;
  error?: string | null;
  metadata?: Record<string, unknown>;
};

export type OneBrainKnowledgeSyncResult = {
  tenants: number;
  attempted: number;
  synced: number;
  skipped: number;
};

export async function syncApprovedKnowledgeToOneBrain(
  store: OneBrainKnowledgeSyncStore,
  provider: BrainProvider,
  options: {
    env?: OneBrainKnowledgeSyncEnv;
    log?: (message: string) => void;
  } = {},
): Promise<OneBrainKnowledgeSyncResult> {
  const env = options.env ?? process.env;
  const limit = readPositiveIntEnv(
    env.ONEBRAIN_KNOWLEDGE_EXPORT_LIMIT,
    DEFAULT_PER_TENANT_LIMIT,
  );
  const tenants = await store.listTenants();
  let attempted = 0;
  let synced = 0;
  let skipped = 0;

  for (const tenant of tenants) {
    const knowledge = await store.listKnowledge(tenant.id, {
      status: "approved",
      limit,
      offset: 0,
    });
    for (const item of knowledge) {
      const input = buildOneBrainKnowledgeIntake(tenant, item, env);
      if (!input) {
        skipped += 1;
        continue;
      }
      const syncSource: OneBrainSyncSource = {
        provider: "onebrain",
        sourceType: "knowledge",
        sourceId: item.id,
      };
      const contentHash = hashOneBrainIntake(input);
      const existing = await store.getOneBrainSyncRecord(tenant.id, syncSource);
      if (
        existing?.status === "synced" &&
        existing.contentHash === contentHash
      ) {
        skipped += 1;
        continue;
      }

      attempted += 1;
      try {
        const response = await provider.intake(input);
        await store.recordOneBrainSyncSuccess(tenant.id, {
          ...syncSource,
          sourceRef: input.sourceRef ?? "",
          contentHash,
          externalRecordId: oneBrainExternalRecordId(response),
          metadata: oneBrainSyncMetadata(response),
        });
        synced += 1;
      } catch (error) {
        await store.recordOneBrainSyncFailure(tenant.id, {
          ...syncSource,
          sourceRef: input.sourceRef ?? "",
          contentHash,
          error: error instanceof Error ? error.message : String(error),
        });
        options.log?.(
          `OneBrain sync failed for tenant ${tenant.id} knowledge ${item.id}`,
        );
        throw error;
      }
    }
  }

  return {
    tenants: tenants.length,
    attempted,
    synced,
    skipped,
  };
}

export function buildOneBrainKnowledgeIntake(
  tenant: OneBrainKnowledgeTenant,
  item: OneBrainKnowledgeItem,
  env: OneBrainKnowledgeSyncEnv = process.env,
): BrainIntakeInput | null {
  const content = clampText(item.content, MAX_ONEBRAIN_CONTENT_CHARS);
  if (!content) {
    return null;
  }

  return {
    scope: buildOneBrainScope(tenant, env),
    title:
      clampText(item.title ?? "Approved knowledge", MAX_ONEBRAIN_TITLE_CHARS) ||
      "Approved knowledge",
    content,
    source: ONEBRAIN_SOURCE,
    sourceRef: oneBrainSourceRef({
      tenantId: tenant.id,
      type: "knowledge",
      id: item.id,
    }),
    recordType: "document",
    intent: "knowledge_update",
    metadata: {
      communicationTenantId: tenant.id,
      communicationTenantPublicId: tenant.publicId ?? null,
      communicationTenantSlug: tenant.slug ?? null,
      communicationTenantName: tenant.name ?? null,
      knowledgeId: item.id,
      documentId: item.documentId,
      sourceId: item.sourceId,
      tags: item.tags,
      status: item.status,
      createdAt: serializeDate(item.createdAt),
      updatedAt: serializeDate(item.updatedAt),
      localMetadata: item.metadata,
    },
  };
}

export function buildOneBrainScope(
  tenant: OneBrainKnowledgeTenant,
  env: OneBrainKnowledgeSyncEnv = process.env,
): BrainScope {
  const accountId =
    env.ONEBRAIN_ACCOUNT_ID?.trim() ||
    tenant.slug?.trim() ||
    tenant.publicId?.trim() ||
    tenant.id;
  const scope: BrainScope = {
    tenantId: tenant.id,
    accountId,
    appId: env.ONEBRAIN_APP_ID?.trim() || ONEBRAIN_COMMUNICATION_APP_ID,
    purpose:
      env.ONEBRAIN_KNOWLEDGE_PURPOSE?.trim() || ONEBRAIN_KNOWLEDGE_PURPOSE,
  };
  const spaceId = env.ONEBRAIN_SPACE_ID?.trim();
  if (spaceId) {
    scope.spaceId = spaceId;
  }
  return scope;
}

function clampText(value: string, maxCharacters: number) {
  const trimmed = value.trim();
  if (trimmed.length <= maxCharacters) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxCharacters - 12).trimEnd()}\n[truncated]`;
}

function readPositiveIntEnv(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function serializeDate(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : value;
}

export function hashOneBrainIntake(input: BrainIntakeInput) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        title: input.title ?? "",
        content: input.content,
        source: input.source ?? "",
        sourceRef: input.sourceRef ?? "",
        recordType: input.recordType ?? "",
        intent: input.intent ?? "",
        metadata: input.metadata ?? {},
      }),
    )
    .digest("hex");
}

function oneBrainExternalRecordId(response: OneBrainIntakeResponse) {
  return "record" in response ? response.record.id : response.job.id;
}

function oneBrainSyncMetadata(response: OneBrainIntakeResponse) {
  if ("record" in response) {
    return {
      oneBrainAccountId: response.record.account_id,
      oneBrainSpaceId: response.record.space_id,
      oneBrainAppId: response.record.app_id,
      oneBrainPurpose: response.record.purpose,
      oneBrainStatus: response.record.status,
    };
  }
  return {
    oneBrainAccountId: response.job.account_id,
    oneBrainSpaceId: response.job.space_id,
    oneBrainJobId: response.job.id,
    oneBrainJobStatus: response.job.status,
    oneBrainJobType: response.job.type,
  };
}
