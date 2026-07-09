import {
  ONEBRAIN_KNOWLEDGE_PURPOSE,
  oneBrainSourceRef,
  type BrainProvider,
  type BrainScope,
  type OneBrainIntent,
  type OneBrainRecordType,
  type OneBrainRuntimeAnswerEnv,
  type OneBrainRuntimeTenant,
} from "@assaddar/core";

export type OneBrainDataLayer = {
  provider?: BrainProvider | null | undefined;
  env?: OneBrainRuntimeAnswerEnv | undefined;
};

export type OneBrainDataWrite = {
  tenant: OneBrainRuntimeTenant;
  type: string;
  id: string;
  title: string;
  content: string;
  recordType: OneBrainRecordType;
  intent: OneBrainIntent;
  metadata?: Record<string, unknown> | undefined;
};

export type OneBrainDataWriteResult =
  | {
      ok: true;
      externalId: string;
      async: boolean;
      status: string;
    }
  | {
      ok: false;
      skipped: true;
      reason: "not_configured";
    };

export function buildOneBrainDataScope(
  tenant: OneBrainRuntimeTenant,
  env: OneBrainRuntimeAnswerEnv = process.env,
): BrainScope {
  const accountId =
    env.ONEBRAIN_ACCOUNT_ID?.trim() ||
    tenant.slug?.trim() ||
    tenant.publicId?.trim() ||
    tenant.id;
  const scope: BrainScope = {
    tenantId: tenant.id,
    accountId,
    appId: "communication",
    purpose: ONEBRAIN_KNOWLEDGE_PURPOSE,
  };
  const spaceId = env.ONEBRAIN_SPACE_ID?.trim();
  if (spaceId) {
    scope.spaceId = spaceId;
  }
  return scope;
}

export async function writeOneBrainDataRecord(
  dataLayer: OneBrainDataLayer | undefined,
  input: OneBrainDataWrite,
): Promise<OneBrainDataWriteResult> {
  const provider = dataLayer?.provider;
  if (!provider) {
    return { ok: false, skipped: true, reason: "not_configured" };
  }

  const response = await provider.intake({
    scope: buildOneBrainDataScope(input.tenant, dataLayer?.env),
    title: input.title,
    content: input.content,
    source: "communication",
    sourceRef: oneBrainSourceRef({
      tenantId: input.tenant.id,
      type: input.type,
      id: input.id,
    }),
    recordType: input.recordType,
    intent: input.intent,
    metadata: {
      communicationRecordKind: input.type,
      communicationRecordId: input.id,
      ...(input.metadata ?? {}),
    },
  });

  if ("record" in response) {
    return {
      ok: true,
      externalId: response.record.id,
      async: false,
      status: response.record.status,
    };
  }

  return {
    ok: true,
    externalId: response.job.id,
    async: true,
    status: response.job.status,
  };
}
