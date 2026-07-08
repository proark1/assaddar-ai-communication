import { describe, expect, it } from "vitest";
import {
  answerWithOneBrainFallback,
  buildOneBrainRuntimeScope,
  ONEBRAIN_CUSTOMER_SERVICE_ANSWER_PURPOSE,
  type AnswerResult,
  type BrainProvider,
  type InboundMessage,
} from "../src";

const tenantId = "11111111-1111-4111-8111-111111111111";

const message: InboundMessage = {
  tenantId,
  channel: "website",
  text: "What do you do?",
  metadata: {},
};

function localAnswer(text = "Local answer."): AnswerResult {
  return {
    status: "answered",
    tenantId,
    channel: "website",
    text,
    confidence: 0.8,
    intent: "approved_knowledge",
    citations: [],
    handoffRecommended: false,
    usage: {
      inputCharacters: message.text.length,
      outputCharacters: text.length,
      estimatedCredits: 1,
    },
    trace: [{ step: "retrieve_knowledge", outcome: "passed" }],
  };
}

describe("answerWithOneBrainFallback", () => {
  it("answers remotely with tenant-scoped OneBrain ask input", async () => {
    const calls: Parameters<BrainProvider["ask"]>[0][] = [];
    const provider: BrainProvider = {
      kind: "onebrain",
      async intake() {
        throw new Error("not used");
      },
      async ask(input) {
        calls.push(input);
        return { answer: "Remote OneBrain answer.", chunksUsed: 2 };
      },
    };
    let localCalled = false;

    const result = await answerWithOneBrainFallback({
      tenant: { id: tenantId, slug: "tenant-one", publicId: "asst_public" },
      message,
      oneBrain: {
        enabled: true,
        provider,
        env: { ONEBRAIN_SPACE_ID: "sp_customer_service" },
      },
      localAnswer: async () => {
        localCalled = true;
        return localAnswer();
      },
    });

    expect(localCalled).toBe(false);
    expect(result).toMatchObject({
      status: "answered",
      text: "Remote OneBrain answer.",
      intent: "onebrain_answer",
      confidence: 1,
      trace: [
        {
          step: "onebrain_answer",
          outcome: "passed",
          detail: "chunks_used:2",
        },
      ],
    });
    expect(calls[0]).toMatchObject({
      question: "What do you do?",
      scope: {
        tenantId,
        accountId: "tenant-one",
        spaceId: "sp_customer_service",
        appId: "communication",
        purpose: ONEBRAIN_CUSTOMER_SERVICE_ANSWER_PURPOSE,
      },
    });
  });

  it("falls back locally when disabled", async () => {
    const result = await answerWithOneBrainFallback({
      tenant: { id: tenantId, slug: "tenant-one" },
      message,
      oneBrain: { enabled: false },
      localAnswer: async () => localAnswer(),
    });

    expect(result.text).toBe("Local answer.");
    expect(result.trace[0]).toEqual({
      step: "onebrain_answer",
      outcome: "skipped",
      detail: "disabled",
    });
  });

  it("falls back locally when provider is not configured", async () => {
    const result = await answerWithOneBrainFallback({
      tenant: { id: tenantId, slug: "tenant-one" },
      message,
      oneBrain: { enabled: true, provider: null },
      localAnswer: async () => localAnswer("Provider missing fallback."),
    });

    expect(result.text).toBe("Provider missing fallback.");
    expect(result.trace[0]).toEqual({
      step: "onebrain_answer",
      outcome: "skipped",
      detail: "not_configured",
    });
  });

  it("falls back locally when OneBrain returns an empty answer", async () => {
    const provider: BrainProvider = {
      kind: "onebrain",
      async intake() {
        throw new Error("not used");
      },
      async ask() {
        return { answer: "   ", chunksUsed: 0 };
      },
    };

    const result = await answerWithOneBrainFallback({
      tenant: { id: tenantId, slug: "tenant-one" },
      message,
      oneBrain: { enabled: true, provider },
      localAnswer: async () => localAnswer("Empty answer fallback."),
    });

    expect(result.text).toBe("Empty answer fallback.");
    expect(result.trace[0]).toEqual({
      step: "onebrain_answer",
      outcome: "failed",
      detail: "empty_answer",
    });
  });

  it("falls back locally when OneBrain fails", async () => {
    const errors: unknown[] = [];
    const provider: BrainProvider = {
      kind: "onebrain",
      async intake() {
        throw new Error("not used");
      },
      async ask() {
        throw new Error("service unavailable");
      },
    };

    const result = await answerWithOneBrainFallback({
      tenant: { id: tenantId, slug: "tenant-one" },
      message,
      oneBrain: { enabled: true, provider },
      localAnswer: async () => localAnswer("Fallback answer."),
      onOneBrainError: (error) => errors.push(error),
    });

    expect(result.text).toBe("Fallback answer.");
    expect(errors).toHaveLength(1);
    expect(result.trace[0]).toEqual({
      step: "onebrain_answer",
      outcome: "failed",
      detail: "error",
    });
  });

  it("builds isolated default account scopes per tenant", () => {
    expect(
      buildOneBrainRuntimeScope({ id: "t1", slug: "alpha" }),
    ).toMatchObject({
      accountId: "alpha",
    });
    expect(
      buildOneBrainRuntimeScope({ id: "t2", publicId: "asst_beta" }),
    ).toMatchObject({
      accountId: "asst_beta",
    });
  });

  it("ignores app and purpose env overrides", () => {
    expect(
      buildOneBrainRuntimeScope({ id: "t1", slug: "alpha" }, {
        ONEBRAIN_SPACE_ID: "sp_customer_service",
        ONEBRAIN_APP_ID: "not-communication",
        ONEBRAIN_ANSWER_PURPOSE: "not-canonical",
      } as Parameters<typeof buildOneBrainRuntimeScope>[1] & {
        ONEBRAIN_APP_ID: string;
        ONEBRAIN_ANSWER_PURPOSE: string;
      }),
    ).toMatchObject({
      appId: "communication",
      purpose: ONEBRAIN_CUSTOMER_SERVICE_ANSWER_PURPOSE,
    });
  });
});
