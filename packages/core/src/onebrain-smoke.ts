import {
  ONEBRAIN_COMMUNICATION_APP_ID,
  ONEBRAIN_KNOWLEDGE_PURPOSE,
  ONEBRAIN_SOURCE,
  type OneBrainCapabilitiesResponse,
  OneBrainServiceClient,
  type OneBrainServiceEnv,
} from "./onebrain";

export type OneBrainSmokeEnv = OneBrainServiceEnv & {
  ONEBRAIN_SMOKE_INTAKE?: string | undefined;
};

export type OneBrainSmokeResult = {
  capabilities: OneBrainCapabilitiesResponse;
  expected: {
    accountId: string | null;
    appId: string;
    purpose: string;
    spaceId: string | null;
  };
  intake: {
    accepted: "record" | "job";
    id: string;
    status: string;
  } | null;
};

export type OneBrainSmokeOptions = {
  fetchImpl?: typeof fetch;
  now?: () => Date;
};

export async function runOneBrainSmoke(
  env: OneBrainSmokeEnv = process.env,
  options: OneBrainSmokeOptions = {},
): Promise<OneBrainSmokeResult> {
  const baseUrl = emptyToUndefined(env.ONEBRAIN_API_BASE_URL);
  const serviceKey = emptyToUndefined(env.ONEBRAIN_SERVICE_KEY);
  const configuredSpaceId = emptyToUndefined(env.ONEBRAIN_SPACE_ID);
  const missing = [
    ["ONEBRAIN_API_BASE_URL", baseUrl],
    ["ONEBRAIN_SERVICE_KEY", serviceKey],
    ["ONEBRAIN_SPACE_ID", configuredSpaceId],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (!baseUrl || !serviceKey || !configuredSpaceId) {
    throw new Error(`Missing OneBrain smoke config: ${missing.join(", ")}`);
  }

  const expectedAppId = ONEBRAIN_COMMUNICATION_APP_ID;
  const expectedPurpose = ONEBRAIN_KNOWLEDGE_PURPOSE;
  const configuredAccountId = emptyToUndefined(env.ONEBRAIN_ACCOUNT_ID);
  const client = new OneBrainServiceClient({
    baseUrl,
    serviceKey,
    timeoutMs: readTimeoutMs(env.ONEBRAIN_TIMEOUT_MS, 10_000),
    ...(configuredAccountId ? { accountId: configuredAccountId } : {}),
    spaceId: configuredSpaceId,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  });
  const capabilities = await client.capabilities();
  validateCapabilities(capabilities, {
    appId: expectedAppId,
    purpose: expectedPurpose,
    spaceId: configuredSpaceId ?? null,
  });

  const accountId =
    configuredAccountId ??
    emptyToUndefined(capabilities.account_id) ??
    emptyToUndefined(capabilities.tenant_id) ??
    null;
  const spaceId =
    configuredSpaceId ?? readSingleSpaceId(capabilities.space_ids) ?? null;
  const intake = isEnabled(env.ONEBRAIN_SMOKE_INTAKE)
    ? await runSyntheticIntake(client, {
        accountId,
        appId: expectedAppId,
        now: options.now?.() ?? new Date(),
        purpose: expectedPurpose,
        spaceId,
      })
    : null;

  return {
    capabilities,
    expected: {
      accountId,
      appId: expectedAppId,
      purpose: expectedPurpose,
      spaceId,
    },
    intake,
  };
}

function validateCapabilities(
  capabilities: OneBrainCapabilitiesResponse,
  expected: { appId: string; purpose: string; spaceId: string | null },
) {
  if (capabilities.app_id && capabilities.app_id !== expected.appId) {
    throw new Error(
      `OneBrain smoke app mismatch: expected ${expected.appId}, got ${capabilities.app_id}`,
    );
  }
  if (
    capabilities.purposes.length > 0 &&
    !capabilities.purposes.includes(expected.purpose)
  ) {
    throw new Error(
      `OneBrain smoke purpose mismatch: expected ${expected.purpose}`,
    );
  }
  if (
    expected.spaceId &&
    capabilities.space_ids.length > 0 &&
    !capabilities.space_ids.includes(expected.spaceId)
  ) {
    throw new Error(
      `OneBrain smoke space mismatch: expected ${expected.spaceId}`,
    );
  }
}

async function runSyntheticIntake(
  client: OneBrainServiceClient,
  input: {
    accountId: string | null;
    appId: string;
    now: Date;
    purpose: string;
    spaceId: string | null;
  },
): Promise<NonNullable<OneBrainSmokeResult["intake"]>> {
  if (!input.accountId) {
    throw new Error(
      "OneBrain smoke intake requires ONEBRAIN_ACCOUNT_ID or service capabilities.account_id.",
    );
  }
  const result = await client.intake({
    scope: {
      tenantId: input.accountId,
      accountId: input.accountId,
      appId: input.appId,
      ...(input.spaceId ? { spaceId: input.spaceId } : {}),
      purpose: input.purpose,
    },
    content:
      "Synthetic OneBrain communication smoke check. Safe to delete after credential verification.",
    intent: "knowledge_update",
    metadata: {
      smoke: true,
      generatedBy: "assaddar-ai-communication",
      generatedAt: input.now.toISOString(),
    },
    recordType: "document",
    source: ONEBRAIN_SOURCE,
    sourceRef: `${ONEBRAIN_SOURCE}:smoke:${input.now.toISOString()}`,
    title: "Communication smoke check",
  });
  if ("record" in result) {
    return {
      accepted: "record",
      id: result.record.id,
      status: result.record.status,
    };
  }
  return {
    accepted: "job",
    id: result.job.id,
    status: result.job.status,
  };
}

function readSingleSpaceId(spaceIds: string[]) {
  return spaceIds.length === 1 ? spaceIds[0] : undefined;
}

function isEnabled(value: string | undefined) {
  return value?.trim().toLowerCase() === "true";
}

function readTimeoutMs(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1_000 || parsed > 60_000) {
    return fallback;
  }
  return Math.trunc(parsed);
}

function emptyToUndefined(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}
