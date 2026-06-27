import { describe, expect, it } from "vitest";
import {
  classifyIntent,
  createDefaultTenantPolicy,
  DEFAULT_ALLOWED_INTENTS,
  DEFAULT_BLOCKED_TOPICS,
  extractGroundedAnswer,
  rankChunks,
  type AllowedIntent,
  type KnowledgeChunk,
} from "../src";

const tenantId = "11111111-1111-4111-8111-111111111111";

function chunk(overrides: Partial<KnowledgeChunk> = {}): KnowledgeChunk {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    tenantId,
    documentId: "doc",
    sourceId: "src",
    content: overrides.content ?? "",
    tags: overrides.tags ?? [],
    metadata: overrides.metadata ?? {},
    ...(overrides.title !== undefined ? { title: overrides.title } : {}),
  };
}

describe("createDefaultTenantPolicy", () => {
  it("wires the tenant id and the default intents/blocked topics", () => {
    const policy = createDefaultTenantPolicy(tenantId);
    expect(policy.tenantId).toBe(tenantId);
    expect(policy.allowedIntents).toBe(DEFAULT_ALLOWED_INTENTS);
    expect(policy.blockedTopics).toBe(DEFAULT_BLOCKED_TOPICS);
    expect(policy.confidenceThreshold).toBeGreaterThan(0);
    expect(policy.escalation.enabled).toBe(true);
  });
});

describe("classifyIntent", () => {
  it("matches the opening_hours intent for an English hours question", () => {
    const result = classifyIntent(
      "When are you open today?",
      DEFAULT_ALLOWED_INTENTS,
    );
    expect(result.allowed).toBe(true);
    expect(result.name).toBe("opening_hours");
    expect(result.score).toBeGreaterThan(0);
  });

  it("matches the prices intent for a German pricing question", () => {
    const result = classifyIntent(
      "Was kosten Ihre Preise?",
      DEFAULT_ALLOWED_INTENTS,
    );
    expect(result.allowed).toBe(true);
    expect(result.name).toBe("prices");
  });

  it("returns not-allowed/unknown when no keyword matches", () => {
    const result = classifyIntent(
      "zxqwfoo barbazqux gibberish",
      DEFAULT_ALLOWED_INTENTS,
    );
    expect(result.allowed).toBe(false);
    expect(result.name).toBe("unknown");
    expect(result.score).toBe(0);
  });

  it("ignores disabled intents", () => {
    const intents: AllowedIntent[] = [
      {
        name: "hours",
        keywords: ["open", "hours"],
        examples: [],
        enabled: false,
      },
    ];
    const result = classifyIntent("When are you open?", intents);
    expect(result.allowed).toBe(false);
    expect(result.name).toBe("unknown");
  });

  it("can match against an intent's example sentences", () => {
    const intents: AllowedIntent[] = [
      {
        name: "booking",
        keywords: [],
        examples: ["Can I book an appointment?"],
        enabled: true,
      },
    ];
    const result = classifyIntent("I want to book an appointment", intents);
    expect(result.allowed).toBe(true);
    expect(result.name).toBe("booking");
  });

  it("picks the highest-scoring intent when several match", () => {
    const intents: AllowedIntent[] = [
      { name: "weak", keywords: ["open"], examples: [], enabled: true },
      {
        name: "strong",
        keywords: ["open", "hours", "weekend"],
        examples: [],
        enabled: true,
      },
    ];
    const result = classifyIntent("open hours weekend", intents);
    expect(result.name).toBe("strong");
  });
});

describe("blocked-topic detection (via DEFAULT_BLOCKED_TOPICS terms)", () => {
  // The engine matches blocked topics with containsPhrase over topic.terms;
  // assert the default term lists cover the intended risky phrases.
  const generalKnowledge = DEFAULT_BLOCKED_TOPICS.find(
    (topic) => topic.name === "general_knowledge",
  );
  const advice = DEFAULT_BLOCKED_TOPICS.find(
    (topic) => topic.name === "medical_legal_financial_advice",
  );

  it("includes general-knowledge trap phrases", () => {
    expect(generalKnowledge?.terms).toContain("capital of");
    expect(generalKnowledge?.terms).toContain("homework");
    expect(generalKnowledge?.enabled).toBe(true);
  });

  it("includes regulated-advice phrases with a refusal response", () => {
    expect(advice?.terms).toContain("legal advice");
    expect(advice?.terms).toContain("tax advice");
    expect(advice?.response).toBeTruthy();
  });
});

describe("rankChunks", () => {
  it("orders chunks by descending token-overlap score", () => {
    const best = chunk({
      id: "best",
      content: "We are open on the weekend and on holidays.",
    });
    const worse = chunk({
      id: "worse",
      content: "We are open on the weekend.",
    });
    const ranked = rankChunks("open weekend holiday", [worse, best]);
    expect(ranked.map((c) => c.id)).toEqual(["best", "worse"]);
    expect(ranked[0]!.score).toBeGreaterThan(ranked[1]!.score);
  });

  it("drops chunks with zero overlap", () => {
    const matching = chunk({ id: "match", content: "opening hours weekend" });
    const irrelevant = chunk({ id: "noise", content: "completely different" });
    const ranked = rankChunks("opening hours", [matching, irrelevant]);
    expect(ranked.map((c) => c.id)).toEqual(["match"]);
  });

  it("includes title, tags, and metadata question/answer in the scored text", () => {
    const viaTitle = chunk({
      id: "title",
      title: "weekend hours",
      content: "",
    });
    const viaTags = chunk({ id: "tags", content: "", tags: ["weekend"] });
    const viaMeta = chunk({
      id: "meta",
      content: "",
      metadata: { question: "weekend?", answer: "weekend yes" },
    });
    const ranked = rankChunks("weekend", [viaTitle, viaTags, viaMeta]);
    expect(ranked.map((c) => c.id).sort()).toEqual(["meta", "tags", "title"]);
  });

  it("clamps the score at 1", () => {
    const c = chunk({ id: "c", content: "weekend weekend weekend" });
    const ranked = rankChunks("weekend", [c]);
    expect(ranked[0]!.score).toBeLessThanOrEqual(1);
  });

  it("returns an empty list when nothing matches", () => {
    const c = chunk({ id: "c", content: "totally unrelated text" });
    expect(rankChunks("weekend hours", [c])).toEqual([]);
  });
});

describe("extractGroundedAnswer", () => {
  it("prefers the metadata answer when present", () => {
    const c = chunk({
      content: "Question: x\nAnswer: from content",
      metadata: { answer: "  from metadata  " },
    });
    expect(extractGroundedAnswer(c)).toBe("from metadata");
  });

  it("falls back to the Answer: marker in content", () => {
    const c = chunk({ content: "Question: hours?\nAnswer: 9 to 5" });
    expect(extractGroundedAnswer(c)).toBe("9 to 5");
  });

  it("falls back to the whole trimmed content with no markers", () => {
    const c = chunk({ content: "  just some content  " });
    expect(extractGroundedAnswer(c)).toBe("just some content");
  });

  it("ignores an empty/whitespace metadata answer", () => {
    const c = chunk({ content: "real content", metadata: { answer: "   " } });
    expect(extractGroundedAnswer(c)).toBe("real content");
  });
});
