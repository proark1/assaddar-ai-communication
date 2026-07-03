import { describe, expect, it } from "vitest";
import {
  createAnswerEngine,
  createDefaultTenantPolicy,
  type AnswerDataStore,
  type KnowledgeChunk,
  type TenantPolicy,
} from "../src";

const tenantA = "11111111-1111-4111-8111-111111111111";
const tenantB = "22222222-2222-4222-8222-222222222222";

class MemoryAnswerStore implements AnswerDataStore {
  constructor(
    private readonly policies: Record<string, TenantPolicy>,
    private readonly chunks: KnowledgeChunk[],
  ) {}

  async getTenantPolicy(tenantId: string) {
    return this.policies[tenantId] ?? createDefaultTenantPolicy(tenantId);
  }

  async searchKnowledge(tenantId: string) {
    return this.chunks.filter((chunk) => chunk.tenantId === tenantId);
  }
}

function faqChunk(
  tenantId: string,
  question: string,
  answer: string,
): KnowledgeChunk {
  return {
    id: crypto.randomUUID(),
    tenantId,
    documentId: crypto.randomUUID(),
    sourceId: crypto.randomUUID(),
    title: question,
    content: `Question: ${question}\nAnswer: ${answer}`,
    tags: ["faq"],
    metadata: { question, answer },
  };
}

describe("AnswerEngine", () => {
  it("answers only from approved tenant knowledge", async () => {
    const engine = createAnswerEngine({
      dataStore: new MemoryAnswerStore(
        {
          [tenantA]: createDefaultTenantPolicy(tenantA),
        },
        [
          faqChunk(
            tenantA,
            "What are your opening hours?",
            "We are open Monday to Friday from 09:00 to 18:00.",
          ),
        ],
      ),
    });

    const result = await engine.answer({
      tenantId: tenantA,
      channel: "website",
      text: "When are you open?",
      metadata: {},
    });

    expect(result.status).toBe("answered");
    expect(result.text).toContain("Monday to Friday");
    expect(result.citations).toHaveLength(1);
  });

  it("answers German AI consultancy questions from approved tenant knowledge", async () => {
    const engine = createAnswerEngine({
      dataStore: new MemoryAnswerStore(
        {
          [tenantA]: {
            ...createDefaultTenantPolicy(tenantA),
            defaultLocale: "de",
          },
        },
        [
          faqChunk(
            tenantA,
            "Was ist die ASDAR Method?",
            "Die ASDAR Method ist ein strukturierter Ansatz: Analysieren, Strukturieren, Digitalisieren, Automatisieren und Realisieren.",
          ),
        ],
      ),
    });

    const result = await engine.answer({
      tenantId: tenantA,
      channel: "website",
      text: "Was ist die ASDAR Method?",
      locale: "de",
      metadata: {},
    });

    expect(result.status).toBe("answered");
    expect(result.text).toContain("Analysieren");
    expect(result.citations).toHaveLength(1);
  });

  it("refuses unknown business questions", async () => {
    let generated = false;
    const engine = createAnswerEngine({
      dataStore: new MemoryAnswerStore(
        {
          [tenantA]: createDefaultTenantPolicy(tenantA),
        },
        [
          faqChunk(
            tenantA,
            "What are your opening hours?",
            "We are open Monday to Friday.",
          ),
        ],
      ),
      groundedGenerator: async () => {
        generated = true;
        return "This should not be used.";
      },
    });

    const result = await engine.answer({
      tenantId: tenantA,
      channel: "website",
      text: "Do you offer emergency roof repairs?",
      metadata: {},
    });

    expect(result.status).toBe("handoff");
    expect(result.text).toContain("I don't have that information");
    expect(result.citations).toHaveLength(0);
    expect(generated).toBe(false);
  });

  it("blocks general random questions before retrieval", async () => {
    const engine = createAnswerEngine({
      dataStore: new MemoryAnswerStore(
        {
          [tenantA]: createDefaultTenantPolicy(tenantA),
        },
        [
          faqChunk(
            tenantA,
            "What is your company address?",
            "We are at Example Street 1.",
          ),
        ],
      ),
    });

    const result = await engine.answer({
      tenantId: tenantA,
      channel: "website",
      text: "What is the capital of France?",
      metadata: {},
    });

    expect(result.status).toBe("handoff");
    expect(result.intent).toBe("general_knowledge");
  });

  it("does not leak knowledge between tenants", async () => {
    const engine = createAnswerEngine({
      dataStore: new MemoryAnswerStore(
        {
          [tenantA]: createDefaultTenantPolicy(tenantA),
          [tenantB]: createDefaultTenantPolicy(tenantB),
        },
        [
          faqChunk(
            tenantA,
            "What are your prices?",
            "Tenant A pricing starts at 100 EUR.",
          ),
          faqChunk(
            tenantB,
            "What are your prices?",
            "Tenant B pricing starts at 900 EUR.",
          ),
        ],
      ),
    });

    const result = await engine.answer({
      tenantId: tenantA,
      channel: "website",
      text: "What are your prices?",
      metadata: {},
    });

    expect(result.status).toBe("answered");
    expect(result.text).toContain("100 EUR");
    expect(result.text).not.toContain("900 EUR");
  });

  it("uses a grounded generator after approved knowledge is retrieved", async () => {
    const engine = createAnswerEngine({
      dataStore: new MemoryAnswerStore(
        {
          [tenantA]: createDefaultTenantPolicy(tenantA),
        },
        [
          faqChunk(
            tenantA,
            "What are your prices?",
            "Tenant A pricing starts at 100 EUR.",
          ),
        ],
      ),
      groundedGenerator: async (input) => {
        expect(input.question).toBe("What are your prices?");
        expect(input.fallbackAnswer).toContain("100 EUR");
        expect(input.chunks).toHaveLength(1);
        return "For phone callers: pricing starts at 100 EUR.";
      },
    });

    const result = await engine.answer({
      tenantId: tenantA,
      channel: "telephone",
      text: "What are your prices?",
      metadata: {},
    });

    expect(result.status).toBe("answered");
    expect(result.text).toBe("For phone callers: pricing starts at 100 EUR.");
    expect(result.trace).toContainEqual({
      step: "grounded_generation",
      outcome: "passed",
      detail: "model",
    });
  });

  it("falls back to the approved answer when grounded generation refuses", async () => {
    const engine = createAnswerEngine({
      dataStore: new MemoryAnswerStore(
        {
          [tenantA]: createDefaultTenantPolicy(tenantA),
        },
        [
          faqChunk(
            tenantA,
            "What are your prices?",
            "Tenant A pricing starts at 100 EUR.",
          ),
        ],
      ),
      groundedGenerator: async () => "__NO_GROUNDED_ANSWER__",
    });

    const result = await engine.answer({
      tenantId: tenantA,
      channel: "telephone",
      text: "What are your prices?",
      metadata: {},
    });

    expect(result.status).toBe("answered");
    expect(result.text).toContain("100 EUR");
    expect(result.trace).toContainEqual({
      step: "grounded_generation",
      outcome: "skipped",
      detail: "empty_or_unsafe",
    });
  });
});
