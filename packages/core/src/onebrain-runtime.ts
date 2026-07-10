import {
  ONEBRAIN_COMMUNICATION_APP_ID,
  ONEBRAIN_CUSTOMER_SERVICE_ANSWER_PURPOSE,
  type BrainProvider,
  type BrainScope,
} from "./onebrain";
import type {
  AnswerResult,
  AnswerTraceStep,
  InboundMessage,
  UsageEstimate,
} from "./types";

export type OneBrainRuntimeTenant = {
  id: string;
  publicId?: string | null;
  slug?: string | null;
  name?: string | null;
};

export type OneBrainRuntimeAnswerEnv = {
  ONEBRAIN_ACCOUNT_ID?: string | undefined;
  ONEBRAIN_FALLBACK_ENABLED?: string | undefined;
  ONEBRAIN_REQUIRED?: string | undefined;
  ONEBRAIN_SPACE_ID?: string | undefined;
};

export type OneBrainRuntimeAnswerSettings = {
  enabled: boolean;
  provider?: BrainProvider | null | undefined;
  env?: OneBrainRuntimeAnswerEnv | undefined;
};

export type OneBrainRuntimeAnswerInput = {
  tenant: OneBrainRuntimeTenant;
  message: InboundMessage;
  oneBrain?: OneBrainRuntimeAnswerSettings | undefined;
  localAnswer: () => Promise<AnswerResult>;
  /**
   * Tenant-policy gate (message length, blocked topics) evaluated BEFORE the
   * question is sent to OneBrain — wire it to `AnswerEngine.policyPreflight` so
   * external answers pass the same policy screen as local ones. When it returns
   * a refusal, OneBrain is never asked and the refusal is returned as-is.
   */
  preflight?: (() => Promise<AnswerResult | null>) | undefined;
  onOneBrainError?: ((error: unknown) => void) | undefined;
};

/**
 * Cap for a remote OneBrain answer, matching the local pipeline's generated
 * answer cap: anything longer is treated as unusable output rather than
 * delivered to a customer unchecked.
 */
const MAX_ONEBRAIN_ANSWER_LENGTH = 900;

export async function answerWithOneBrainFallback(
  input: OneBrainRuntimeAnswerInput,
): Promise<AnswerResult> {
  const settings = input.oneBrain;
  if (!settings) {
    return input.localAnswer();
  }

  const fallbackEnabled = isOneBrainFallbackEnabled(settings.env);
  const required = isOneBrainRequired(settings.env);
  if (!settings.enabled) {
    if (required || !fallbackEnabled) {
      return oneBrainUnavailableResult(input, "disabled");
    }
    return withOneBrainTrace(await input.localAnswer(), {
      step: "onebrain_answer",
      outcome: "skipped",
      detail: "disabled",
    });
  }

  if (!settings.provider) {
    if (required || !fallbackEnabled) {
      return oneBrainUnavailableResult(input, "not_configured");
    }
    return withOneBrainTrace(await input.localAnswer(), {
      step: "onebrain_answer",
      outcome: "skipped",
      detail: "not_configured",
    });
  }

  // Policy preflight: external answers pass the same tenant-policy screen
  // (message length, blocked topics) as local ones. A refusal short-circuits —
  // the question is never sent to OneBrain.
  if (input.preflight) {
    const refusal = await input.preflight();
    if (refusal) {
      return withOneBrainTrace(refusal, {
        step: "onebrain_answer",
        outcome: "skipped",
        detail: "policy_refused",
      });
    }
  }

  // A OneBrain reply that is empty, unsupported by any knowledge chunk, or
  // implausibly long is unusable output — never delivered directly. Depending
  // on the fallback policy it either fails closed or falls back to the local
  // pipeline, which enforces its own retrieval/refusal guardrails.
  const rejectAnswer = async (detail: string): Promise<AnswerResult> => {
    if (required || !fallbackEnabled) {
      return oneBrainUnavailableResult(input, detail);
    }
    return withOneBrainTrace(await input.localAnswer(), {
      step: "onebrain_answer",
      outcome: "failed",
      detail,
    });
  };

  try {
    const result = await settings.provider.ask({
      scope: buildOneBrainRuntimeScope(input.tenant, settings.env),
      question: input.message.text,
    });
    const answer = sanitizeOneBrainAnswer(result.answer);
    if (!answer) {
      return rejectAnswer("empty_answer");
    }
    if (result.chunksUsed <= 0) {
      // No evidence chunks backed this answer: treat it as ungrounded rather
      // than delivering unverified model prose to a customer.
      return rejectAnswer("no_evidence");
    }
    if (answer.length > MAX_ONEBRAIN_ANSWER_LENGTH) {
      return rejectAnswer("answer_too_long");
    }

    return {
      status: "answered",
      tenantId: input.message.tenantId,
      channel: input.message.channel,
      text: answer,
      confidence: 1,
      intent: "onebrain_answer",
      citations: [],
      handoffRecommended: false,
      usage: estimateOneBrainUsage(input.message.text, answer),
      trace: [
        {
          step: "onebrain_answer",
          outcome: "passed",
          detail: `chunks_used:${result.chunksUsed}`,
        },
      ],
    };
  } catch (error) {
    input.onOneBrainError?.(error);
    if (required || !fallbackEnabled) {
      return oneBrainUnavailableResult(input, "error");
    }
    return withOneBrainTrace(await input.localAnswer(), {
      step: "onebrain_answer",
      outcome: "failed",
      detail: "error",
    });
  }
}

function oneBrainUnavailableResult(
  input: OneBrainRuntimeAnswerInput,
  detail: string,
): AnswerResult {
  const text =
    "OneBrain is temporarily unavailable, so this conversation needs human follow-up.";
  return {
    status: "handoff",
    tenantId: input.message.tenantId,
    channel: input.message.channel,
    text,
    confidence: 0,
    intent: "onebrain_unavailable",
    citations: [],
    handoffRecommended: true,
    handoffReason: "onebrain_required",
    usage: estimateOneBrainUsage(input.message.text, text),
    trace: [
      {
        step: "onebrain_answer",
        outcome: "failed",
        detail,
      },
    ],
  };
}

export function buildOneBrainRuntimeScope(
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
    appId: ONEBRAIN_COMMUNICATION_APP_ID,
    purpose: ONEBRAIN_CUSTOMER_SERVICE_ANSWER_PURPOSE,
  };
  const spaceId = env.ONEBRAIN_SPACE_ID?.trim();
  if (spaceId) {
    scope.spaceId = spaceId;
  }
  return scope;
}

function withOneBrainTrace(
  result: AnswerResult,
  step: AnswerTraceStep,
): AnswerResult {
  return {
    ...result,
    trace: [step, ...result.trace],
  };
}

function sanitizeOneBrainAnswer(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function isOneBrainRequired(env: OneBrainRuntimeAnswerEnv | undefined) {
  return parseBoolean(env?.ONEBRAIN_REQUIRED, false);
}

function isOneBrainFallbackEnabled(env: OneBrainRuntimeAnswerEnv | undefined) {
  return parseBoolean(env?.ONEBRAIN_FALLBACK_ENABLED, true);
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function estimateOneBrainUsage(input: string, output: string): UsageEstimate {
  return {
    inputCharacters: input.length,
    outputCharacters: output.length,
    estimatedCredits: Math.ceil((input.length + output.length) / 1000),
  };
}
