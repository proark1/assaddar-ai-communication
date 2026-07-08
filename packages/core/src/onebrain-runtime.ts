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
  ONEBRAIN_SPACE_ID?: string | undefined;
  ONEBRAIN_APP_ID?: string | undefined;
  ONEBRAIN_ANSWER_PURPOSE?: string | undefined;
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
  onOneBrainError?: ((error: unknown) => void) | undefined;
};

export async function answerWithOneBrainFallback(
  input: OneBrainRuntimeAnswerInput,
): Promise<AnswerResult> {
  const settings = input.oneBrain;
  if (!settings) {
    return input.localAnswer();
  }

  if (!settings.enabled) {
    return withOneBrainTrace(await input.localAnswer(), {
      step: "onebrain_answer",
      outcome: "skipped",
      detail: "disabled",
    });
  }

  if (!settings.provider) {
    return withOneBrainTrace(await input.localAnswer(), {
      step: "onebrain_answer",
      outcome: "skipped",
      detail: "not_configured",
    });
  }

  try {
    const result = await settings.provider.ask({
      scope: buildOneBrainRuntimeScope(input.tenant, settings.env),
      question: input.message.text,
    });
    const answer = sanitizeOneBrainAnswer(result.answer);
    if (!answer) {
      return withOneBrainTrace(await input.localAnswer(), {
        step: "onebrain_answer",
        outcome: "failed",
        detail: "empty_answer",
      });
    }

    return {
      status: "answered",
      tenantId: input.message.tenantId,
      channel: input.message.channel,
      text: answer,
      confidence: result.chunksUsed > 0 ? 1 : 0.5,
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
    return withOneBrainTrace(await input.localAnswer(), {
      step: "onebrain_answer",
      outcome: "failed",
      detail: "error",
    });
  }
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
    appId: env.ONEBRAIN_APP_ID?.trim() || ONEBRAIN_COMMUNICATION_APP_ID,
    purpose:
      env.ONEBRAIN_ANSWER_PURPOSE?.trim() ||
      ONEBRAIN_CUSTOMER_SERVICE_ANSWER_PURPOSE,
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

function estimateOneBrainUsage(input: string, output: string): UsageEstimate {
  return {
    inputCharacters: input.length,
    outputCharacters: output.length,
    estimatedCredits: Math.ceil((input.length + output.length) / 1000),
  };
}
