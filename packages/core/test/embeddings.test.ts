import { describe, expect, it } from "vitest";
import {
  cosineSimilarity,
  createAnswerEngine,
  createDefaultTenantPolicy,
  createEmbeddingProvider,
  mergeRankedChunks,
  type AnswerDataStore,
  type KnowledgeChunk,
  type RetrievedChunk,
} from "../src";

const tenant = "11111111-1111-4111-8111-111111111111";

function chunk(id: string, content: string): KnowledgeChunk {
  return {
    id,
    tenantId: tenant,
    documentId: "doc-1",
    sourceId: "src-1",
    content,
    tags: [],
    metadata: { answer: content },
  };
}

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors and 0 for orthogonal", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("guards against empty or mismatched vectors", () => {
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([1, 2], [1])).toBe(0);
  });
});

describe("createEmbeddingProvider", () => {
  it("returns null without an API key (keyword-only mode)", () => {
    expect(createEmbeddingProvider({})).toBeNull();
  });

  it("builds a provider when a key is present", () => {
    const provider = createEmbeddingProvider({ OPENAI_API_KEY: "sk-test" });
    expect(provider).not.toBeNull();
    expect(provider?.dimensions).toBe(1536);
  });
});

describe("mergeRankedChunks", () => {
  it("keeps the strongest score per chunk and sorts descending", () => {
    const keyword: RetrievedChunk[] = [{ ...chunk("a", "a"), score: 0.4 }];
    const semantic: RetrievedChunk[] = [
      { ...chunk("a", "a"), score: 0.9 },
      { ...chunk("b", "b"), score: 0.5 },
    ];
    const merged = mergeRankedChunks(keyword, semantic);
    expect(merged.map((c) => c.id)).toEqual(["a", "b"]);
    expect(merged[0]?.score).toBeCloseTo(0.9);
  });
});

// The engine gates on intent classification before retrieval, so tests that
// exercise the retrieval path supply a permissive intent matching the query.
function permissivePolicy(tenantId: string, keywords: string[]) {
  const policy = createDefaultTenantPolicy(tenantId);
  return {
    ...policy,
    allowedIntents: [
      ...policy.allowedIntents,
      {
        name: "test_intent",
        keywords,
        examples: [],
        enabled: true,
      },
    ],
  };
}

describe("AnswerEngine hybrid retrieval", () => {
  it("surfaces a semantically-similar chunk the keyword search misses", async () => {
    const store: AnswerDataStore = {
      async getTenantPolicy(tenantId) {
        return permissivePolicy(tenantId, ["trading", "times"]);
      },
      // Keyword search finds nothing (no shared tokens with the query).
      async searchKnowledge() {
        return [];
      },
      // Semantic search returns a confident match.
      async searchKnowledgeByEmbedding() {
        return [
          {
            ...chunk(
              "vec-1",
              "We are open Monday to Friday from 09:00 to 18:00.",
            ),
            score: 0.95,
          },
        ];
      },
    };

    const engine = createAnswerEngine({
      dataStore: store,
      embedder: async () => [0.1, 0.2, 0.3],
    });

    const result = await engine.answer({
      tenantId: tenant,
      channel: "website",
      text: "trading times please",
      metadata: {},
    });

    expect(result.status).toBe("answered");
    expect(result.text).toContain("Monday to Friday");
    expect(
      result.trace.some((step) => step.step === "semantic_retrieval"),
    ).toBe(true);
  });

  it("degrades to keyword-only when the embedder fails", async () => {
    const store: AnswerDataStore = {
      async getTenantPolicy(tenantId) {
        return permissivePolicy(tenantId, ["credit", "cards", "payment"]);
      },
      async searchKnowledge() {
        return [chunk("kw-1", "We accept credit cards and PayPal.")];
      },
      async searchKnowledgeByEmbedding() {
        throw new Error("should not be reached when embedder returns null");
      },
    };

    const engine = createAnswerEngine({
      dataStore: store,
      embedder: async () => null,
    });

    const result = await engine.answer({
      tenantId: tenant,
      channel: "website",
      text: "credit cards",
      metadata: {},
    });

    expect(result.status).toBe("answered");
    expect(result.text).toContain("credit cards");
  });
});
