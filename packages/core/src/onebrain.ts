import { z } from "zod";

export const ONEBRAIN_COMMUNICATION_APP_ID = "communication";
export const ONEBRAIN_SOURCE = "communication";
export const ONEBRAIN_CUSTOMER_SERVICE_ANSWER_PURPOSE =
  "customer_service_answer";
export const ONEBRAIN_KNOWLEDGE_PURPOSE = "customer_service_inbox";

export type OneBrainRecordType =
  | "action"
  | "action_audit"
  | "assistant_setting"
  | "brief"
  | "calendar_event"
  | "calendar_focus_plan"
  | "message"
  | "document"
  | "contact"
  | "task"
  | "fact"
  | "feedback"
  | "follow_up"
  | "model_usage"
  | "policy"
  | "policy_decision"
  | "provider_account"
  | "provider_health"
  | "scope_grant"
  | "secret_reference"
  | "security_decision"
  | "sync_cursor"
  | "sync_subscription"
  | "telegram_binding"
  | "note"
  | "notification_event"
  | "notification_preference"
  | "transcript"
  | "voice_transcript";

export type OneBrainIntent =
  | "action_proposal"
  | "approval"
  | "briefing"
  | "question"
  | "complaint"
  | "booking"
  | "calendar_focus"
  | "connected_account"
  | "execution"
  | "feedback"
  | "follow_up"
  | "model_usage"
  | "notification"
  | "provider_health"
  | "sales_lead"
  | "security_decision"
  | "settings_update"
  | "sync_state"
  | "telegram_binding"
  | "task"
  | "knowledge_update"
  | "voice_turn"
  | "internal_note";

export type BrainScope = {
  tenantId: string;
  accountId: string;
  appId?: string;
  spaceId?: string;
  purpose?: string;
};

export type BrainIntakeInput = {
  scope: BrainScope;
  content: string;
  title?: string;
  source?: string;
  sourceRef?: string;
  recordType?: OneBrainRecordType;
  intent?: OneBrainIntent;
  metadata?: Record<string, unknown>;
};

export type BrainAskInput = {
  scope: BrainScope;
  question: string;
};

export type BrainAskResult = {
  answer: string;
  chunksUsed: number;
};

export type BrainProvider = {
  readonly kind: "local" | "onebrain";
  intake(input: BrainIntakeInput): Promise<OneBrainIntakeResponse>;
  ask(input: BrainAskInput): Promise<BrainAskResult>;
  // Optional so a local/no-op provider needn't implement remote erasure. The
  // outbox drain skips a provider that can't delete.
  deleteRecord?(input: BrainDeleteInput): Promise<OneBrainDeleteResult>;
};

export type OneBrainServiceEnv = {
  ONEBRAIN_API_BASE_URL?: string;
  ONEBRAIN_SERVICE_KEY?: string;
  ONEBRAIN_TIMEOUT_MS?: string;
  ONEBRAIN_ACCOUNT_ID?: string;
  ONEBRAIN_SPACE_ID?: string;
};

export type OneBrainClientOptions = {
  baseUrl: string;
  serviceKey: string;
  timeoutMs?: number;
  accountId?: string;
  spaceId?: string;
  fetchImpl?: typeof fetch;
};

const OneBrainIntakeRecordSchema = z
  .object({
    id: z.string(),
    tenant_id: z.string(),
    account_id: z.string(),
    space_id: z.string(),
    app_id: z.string(),
    purpose: z.string(),
    source: z.string(),
    source_ref: z.string().default(""),
    record_type: z.string(),
    intent: z.string(),
    classification: z.string(),
    confidence: z.number(),
    status: z.string(),
    title: z.string(),
    summary: z.string(),
    extracted_facts: z.record(z.string(), z.unknown()).default({}),
    metadata: z.record(z.string(), z.unknown()).default({}),
    created_at: z.string().default(""),
  })
  .passthrough();

const OneBrainImmediateIntakeResponseSchema = z.object({
  record: OneBrainIntakeRecordSchema,
});

const OneBrainJobStatusSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    status: z.string(),
    tenant_id: z.string(),
    account_id: z.string().default(""),
    space_id: z.string().default(""),
    result: z.record(z.string(), z.unknown()).nullable().default(null),
    error: z.string().default(""),
    attempts: z.number().int().nonnegative().default(0),
    created_at: z.string().default(""),
    updated_at: z.string().default(""),
    completed_at: z.string().default(""),
  })
  .passthrough();

export const OneBrainIntakeResponseSchema = z.union([
  OneBrainImmediateIntakeResponseSchema,
  OneBrainJobStatusSchema.transform((job) => ({ job })),
]);

export type OneBrainIntakeResponse = z.infer<
  typeof OneBrainIntakeResponseSchema
>;

const OneBrainAskResponseSchema = z.object({
  answer: z.string(),
  chunks_used: z.number().int().nonnegative().default(0),
});

const OneBrainDeleteResponseSchema = z.object({
  source_ref: z.string().default(""),
  deleted: z.number().int().nonnegative().default(0),
  audit_event_id: z.string().default(""),
});

export type OneBrainDeleteResult = z.infer<typeof OneBrainDeleteResponseSchema>;

export type BrainDeleteInput = {
  sourceRef: string;
  scope?: Partial<BrainScope>;
};

const OneBrainCapabilitiesResponseSchema = z.object({
  tenant_id: z.string(),
  account_id: z.string().default(""),
  app_id: z.string().default(""),
  scopes: z.array(z.string()).default([]),
  space_ids: z.array(z.string()).default([]),
  purposes: z.array(z.string()).default([]),
});

export type OneBrainCapabilitiesResponse = z.infer<
  typeof OneBrainCapabilitiesResponseSchema
>;

export class OneBrainServiceError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(status: number, detail: string) {
    super(`OneBrain service request failed (${status}): ${detail}`);
    this.name = "OneBrainServiceError";
    this.status = status;
    this.detail = detail;
  }
}

export class OneBrainConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OneBrainConfigurationError";
  }
}

export class OneBrainServiceClient {
  private readonly baseUrl: string;
  private readonly serviceKey: string;
  private readonly timeoutMs: number;
  private readonly accountId: string | undefined;
  private readonly spaceId: string | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OneBrainClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.serviceKey = options.serviceKey;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.accountId = emptyToUndefined(options.accountId);
    this.spaceId = emptyToUndefined(options.spaceId);
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async capabilities(): Promise<OneBrainCapabilitiesResponse> {
    return OneBrainCapabilitiesResponseSchema.parse(
      await this.requestJson("GET", "/api/service/capabilities"),
    );
  }

  async intake(input: BrainIntakeInput): Promise<OneBrainIntakeResponse> {
    const body: Record<string, unknown> = {
      content: input.content,
      source: input.source ?? ONEBRAIN_SOURCE,
      record_type: input.recordType ?? "document",
      intent: input.intent ?? "knowledge_update",
      metadata: input.metadata ?? {},
      ...this.scopeBody(input.scope, ONEBRAIN_KNOWLEDGE_PURPOSE),
    };
    if (input.title) {
      body.title = input.title;
    }
    if (input.sourceRef) {
      body.source_ref = input.sourceRef;
    }
    return OneBrainIntakeResponseSchema.parse(
      await this.requestJson("POST", "/api/service/intake", body),
    );
  }

  async ask(input: BrainAskInput): Promise<BrainAskResult> {
    const payload = OneBrainAskResponseSchema.parse(
      await this.requestJson("POST", "/api/service/ask", {
        question: input.question,
        ...this.scopeBody(
          input.scope,
          ONEBRAIN_CUSTOMER_SERVICE_ANSWER_PURPOSE,
        ),
      }),
    );
    return {
      answer: payload.answer,
      chunksUsed: payload.chunks_used,
    };
  }

  async deleteRecord(input: BrainDeleteInput): Promise<OneBrainDeleteResult> {
    // Erase a record previously synced in, by the same source_ref used at intake.
    // source_ref is globally unique, so account alone scopes the delete
    // unambiguously. We default account_id from config (a mismatch fails loud with
    // a 403), but do NOT default space_id: a drifted ONEBRAIN_SPACE_ID would make
    // the endpoint match nothing and report an idempotent deleted:0 — a silent
    // miss. space_id is sent only when the caller passes it explicitly.
    const accountId =
      emptyToUndefined(input.scope?.accountId) ?? this.accountId;
    const spaceId = emptyToUndefined(input.scope?.spaceId);
    const body: Record<string, unknown> = { source_ref: input.sourceRef };
    if (accountId) {
      body.account_id = accountId;
    }
    if (spaceId) {
      body.space_id = spaceId;
    }
    return OneBrainDeleteResponseSchema.parse(
      await this.requestJson("POST", "/api/service/records/delete", body),
    );
  }

  private scopeBody(scope: BrainScope, defaultPurpose: string) {
    const accountId = emptyToUndefined(scope.accountId) ?? this.accountId;
    const spaceId = emptyToUndefined(scope.spaceId) ?? this.spaceId;
    const missing = [
      ["account_id", accountId],
      ["space_id", spaceId],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);
    if (!accountId || !spaceId) {
      throw new OneBrainConfigurationError(
        `Missing OneBrain service scope: ${missing.join(", ")}`,
      );
    }
    const body: Record<string, unknown> = {
      account_id: accountId,
      space_id: spaceId,
      app_id: ONEBRAIN_COMMUNICATION_APP_ID,
      purpose: defaultPurpose,
    };
    return body;
  }

  private async requestJson(
    method: "GET" | "POST",
    path: string,
    body?: Record<string, unknown>,
  ): Promise<unknown> {
    const init: RequestInit = {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.serviceKey}`,
      },
      signal: AbortSignal.timeout(this.timeoutMs),
    };
    if (body) {
      init.headers = {
        ...init.headers,
        "content-type": "application/json",
      };
      init.body = JSON.stringify(body);
    }

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, init);
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new OneBrainServiceError(response.status, detail.slice(0, 500));
    }
    return response.json();
  }
}

export class OneBrainProvider implements BrainProvider {
  readonly kind = "onebrain" as const;

  constructor(private readonly client: OneBrainServiceClient) {}

  intake(input: BrainIntakeInput): Promise<OneBrainIntakeResponse> {
    return this.client.intake(input);
  }

  ask(input: BrainAskInput): Promise<BrainAskResult> {
    return this.client.ask(input);
  }

  deleteRecord(input: BrainDeleteInput): Promise<OneBrainDeleteResult> {
    return this.client.deleteRecord(input);
  }
}

export function createOneBrainProvider(
  env: OneBrainServiceEnv = process.env,
): OneBrainProvider | null {
  const baseUrl = env.ONEBRAIN_API_BASE_URL?.trim();
  const serviceKey = env.ONEBRAIN_SERVICE_KEY?.trim();
  const spaceId = emptyToUndefined(env.ONEBRAIN_SPACE_ID);
  if (!baseUrl || !serviceKey || !spaceId) {
    return null;
  }

  const clientOptions: OneBrainClientOptions = {
    baseUrl,
    serviceKey,
    timeoutMs: readOneBrainTimeoutMs(env.ONEBRAIN_TIMEOUT_MS, 10_000),
    spaceId,
  };
  const accountId = emptyToUndefined(env.ONEBRAIN_ACCOUNT_ID);
  if (accountId) {
    clientOptions.accountId = accountId;
  }

  return new OneBrainProvider(new OneBrainServiceClient(clientOptions));
}

export function oneBrainSourceRef(parts: {
  tenantId: string;
  type: string;
  id: string;
}) {
  return `communication:tenant:${parts.tenantId}:${parts.type}:${parts.id}`;
}

function readOneBrainTimeoutMs(value: string | undefined, fallback: number) {
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
