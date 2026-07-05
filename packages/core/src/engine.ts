import {
  createDefaultTenantPolicy,
  DEFAULT_ALLOWED_INTENTS,
  DEFAULT_BLOCKED_TOPICS,
} from "./policy";
import {
  containsPhrase,
  normalizeText,
  stableKeywordScore,
  tokenOverlapScore,
} from "./text";
import type {
  AllowedIntent,
  AnswerDataStore,
  AnswerResult,
  AnswerTraceStep,
  GroundedAnswerGenerator,
  HandoffStore,
  InboundMessage,
  KnowledgeChunk,
  RetrievedChunk,
  TenantPolicy,
} from "./types";

const DEFAULT_REFUSAL =
  "I don't have that information in the approved business knowledge. I can take a message or connect you with the team.";
const DEFAULT_REFUSAL_DE =
  "Dazu habe ich keine freigegebene Information. Ich kann Ihre Nachricht aufnehmen oder das an das Team weitergeben.";
const MAX_GENERATED_ANSWER_LENGTH = 900;
const MAX_DIRECT_TELEPHONE_ANSWER_LENGTH = 360;
const NO_GROUNDED_ANSWER = "__NO_GROUNDED_ANSWER__";

/**
 * Process-wide tally of semantic-search failures. Previously these errors were
 * swallowed silently; exposing a counter lets ops surface (and alarm on) a
 * degraded embedding provider without changing the graceful fallback. Reset is
 * only intended for tests.
 */
let semanticSearchFailureCount = 0;

/** Read the number of semantic-search failures observed since startup/reset. */
export function getSemanticSearchFailureCount(): number {
  return semanticSearchFailureCount;
}

/** Reset the failure counter. Intended for tests. */
export function resetSemanticSearchFailureCount(): void {
  semanticSearchFailureCount = 0;
}

export type AnswerEngineOptions = {
  dataStore: AnswerDataStore;
  handoffStore?: HandoffStore;
  retrievalLimit?: number;
  /**
   * Optional query embedder. When provided alongside a data store that supports
   * `searchKnowledgeByEmbedding`, retrieval becomes hybrid (keyword + semantic).
   * Returning `null` (e.g. transient provider failure) degrades gracefully to
   * keyword-only retrieval for that request.
   */
  embedder?: (text: string) => Promise<number[] | null>;
  /**
   * Optional hook invoked when semantic retrieval throws. Lets callers wire the
   * failure into their own logging/metrics. The engine always logs a warning
   * and falls back to keyword-only retrieval regardless of this callback.
   */
  onSemanticSearchError?: (error: unknown, tenantId: string) => void;
  /**
   * Optional answer writer. It only runs after approved knowledge has already
   * matched the user question, and receives only those approved chunks.
   */
  groundedGenerator?: GroundedAnswerGenerator;
  /**
   * Optional hook invoked when grounded generation fails. The engine falls back
   * to the exact approved answer so customer calls never depend on model prose.
   */
  onGroundedGenerationError?: (error: unknown, tenantId: string) => void;
  /**
   * For latency-sensitive phone calls, return the approved FAQ answer directly
   * when retrieval is already confident instead of asking a model to rewrite it.
   */
  preferDirectTelephoneAnswers?: boolean;
};

export class AnswerEngine {
  private readonly dataStore: AnswerDataStore;
  private readonly handoffStore: HandoffStore | undefined;
  private readonly retrievalLimit: number;
  private readonly embedder: AnswerEngineOptions["embedder"];
  private readonly onSemanticSearchError: AnswerEngineOptions["onSemanticSearchError"];
  private readonly groundedGenerator: AnswerEngineOptions["groundedGenerator"];
  private readonly onGroundedGenerationError: AnswerEngineOptions["onGroundedGenerationError"];
  private readonly preferDirectTelephoneAnswers: boolean;

  constructor(options: AnswerEngineOptions) {
    this.dataStore = options.dataStore;
    this.handoffStore = options.handoffStore;
    this.retrievalLimit = options.retrievalLimit ?? 8;
    this.embedder = options.embedder;
    this.onSemanticSearchError = options.onSemanticSearchError;
    this.groundedGenerator = options.groundedGenerator;
    this.onGroundedGenerationError = options.onGroundedGenerationError;
    this.preferDirectTelephoneAnswers =
      options.preferDirectTelephoneAnswers ?? false;
  }

  async answer(input: InboundMessage): Promise<AnswerResult> {
    const trace: AnswerTraceStep[] = [];
    const normalized = normalizeText(input.text);
    trace.push({
      step: "normalize",
      outcome: normalized ? "passed" : "failed",
    });

    const policy = await this.loadPolicy(input.tenantId);
    if (normalized.length > policy.maxMessageLength) {
      return this.refuse(
        input,
        policy,
        trace,
        "message_length",
        "Message is too long for this assistant.",
      );
    }

    const blockedTopic = findBlockedTopic(normalized, policy.blockedTopics);
    if (blockedTopic) {
      trace.push({
        step: "blocked_topic",
        outcome: "failed",
        detail: blockedTopic.name,
      });

      return this.refuse(
        input,
        policy,
        trace,
        blockedTopic.name,
        blockedTopic.response ??
          "I can only answer questions about this business.",
      );
    }
    trace.push({ step: "blocked_topic", outcome: "passed" });

    const intent = classifyIntent(normalized, policy.allowedIntents);
    if (!intent.allowed) {
      trace.push({
        step: "intent_policy",
        outcome: "failed",
        detail: intent.name,
      });
      return this.refuse(
        input,
        policy,
        trace,
        "intent_not_allowed",
        defaultRefusal(input.locale),
      );
    }
    trace.push({
      step: "intent_policy",
      outcome: "passed",
      detail: intent.name,
    });

    const keywordSearch = this.dataStore.searchKnowledge(
      input.tenantId,
      normalized,
      this.retrievalLimit,
    );
    const semanticSearch = this.semanticSearch(input.tenantId, normalized);
    const [chunks, semanticRanked] = await Promise.all([
      keywordSearch,
      semanticSearch,
    ]);
    const keywordRanked = rankChunks(normalized, chunks);
    const rankedChunks = mergeRankedChunks(keywordRanked, semanticRanked);
    if (semanticRanked.length > 0) {
      trace.push({
        step: "semantic_retrieval",
        outcome: "passed",
        detail: String(semanticRanked.length),
      });
    }
    const bestChunk = rankedChunks[0];
    if (!bestChunk || bestChunk.score < policy.confidenceThreshold) {
      trace.push({
        step: "retrieve_knowledge",
        outcome: "failed",
        detail: bestChunk ? String(bestChunk.score) : "no_chunks",
      });
      return this.refuse(
        input,
        policy,
        trace,
        "knowledge_not_found",
        defaultRefusal(input.locale),
      );
    }
    trace.push({
      step: "retrieve_knowledge",
      outcome: "passed",
      detail: String(bestChunk.score),
    });

    const fallbackAnswer = extractGroundedAnswer(bestChunk);
    if (!fallbackAnswer) {
      trace.push({
        step: "validate_answer",
        outcome: "failed",
        detail: "empty_grounded_answer",
      });
      return this.refuse(
        input,
        policy,
        trace,
        "answer_validation_failed",
        defaultRefusal(input.locale),
      );
    }
    if (
      this.preferDirectTelephoneAnswers &&
      isDirectTelephoneAnswer(input, bestChunk, fallbackAnswer)
    ) {
      trace.push({
        step: "grounded_generation",
        outcome: "skipped",
        detail: "direct_telephone_answer",
      });
      trace.push({ step: "generate_grounded_answer", outcome: "passed" });
      trace.push({ step: "validate_answer", outcome: "passed" });

      const citation: AnswerResult["citations"][number] = {
        chunkId: bestChunk.id,
        documentId: bestChunk.documentId,
        sourceId: bestChunk.sourceId,
      };
      if (bestChunk.title) {
        citation.title = bestChunk.title;
      }

      return {
        status: "answered",
        tenantId: input.tenantId,
        channel: input.channel,
        text: applyTone(fallbackAnswer, policy),
        confidence: bestChunk.score,
        intent: intent.name,
        citations: [citation],
        handoffRecommended: false,
        usage: estimateUsage(normalized, fallbackAnswer),
        trace,
      };
    }

    const supportingChunks = rankedChunks
      .filter((chunk) => chunk.score >= policy.confidenceThreshold)
      .slice(0, 3);
    const answer = await this.generateGroundedAnswer({
      input,
      policy,
      trace,
      intent: intent.name,
      fallbackAnswer,
      chunks: supportingChunks.length > 0 ? supportingChunks : [bestChunk],
    });

    trace.push({ step: "generate_grounded_answer", outcome: "passed" });
    trace.push({ step: "validate_answer", outcome: "passed" });

    const citation: AnswerResult["citations"][number] = {
      chunkId: bestChunk.id,
      documentId: bestChunk.documentId,
      sourceId: bestChunk.sourceId,
    };
    if (bestChunk.title) {
      citation.title = bestChunk.title;
    }

    return {
      status: "answered",
      tenantId: input.tenantId,
      channel: input.channel,
      text: applyTone(answer, policy),
      confidence: bestChunk.score,
      intent: intent.name,
      citations: [citation],
      handoffRecommended: false,
      usage: estimateUsage(normalized, answer),
      trace,
    };
  }

  private async generateGroundedAnswer({
    input,
    policy,
    trace,
    intent,
    fallbackAnswer,
    chunks,
  }: {
    input: InboundMessage;
    policy: TenantPolicy;
    trace: AnswerTraceStep[];
    intent: string;
    fallbackAnswer: string;
    chunks: RetrievedChunk[];
  }): Promise<string> {
    if (!this.groundedGenerator) {
      trace.push({
        step: "grounded_generation",
        outcome: "skipped",
        detail: "not_configured",
      });
      return fallbackAnswer;
    }

    try {
      const generated = await this.groundedGenerator({
        question: input.text,
        ...((input.locale ?? policy.defaultLocale)
          ? { locale: input.locale ?? policy.defaultLocale }
          : {}),
        intent,
        fallbackAnswer,
        chunks,
      });
      const safe = sanitizeGroundedAnswer(generated);
      if (!safe) {
        trace.push({
          step: "grounded_generation",
          outcome: "skipped",
          detail: "empty_or_unsafe",
        });
        return fallbackAnswer;
      }
      trace.push({
        step: "grounded_generation",
        outcome: "passed",
        detail: "model",
      });
      return safe;
    } catch (error) {
      console.warn(
        `[answer-engine] grounded answer generation failed for tenant ${input.tenantId}; ` +
          "falling back to approved answer",
        error,
      );
      this.onGroundedGenerationError?.(error, input.tenantId);
      trace.push({
        step: "grounded_generation",
        outcome: "skipped",
        detail: "error",
      });
      return fallbackAnswer;
    }
  }

  private async semanticSearch(
    tenantId: string,
    normalized: string,
  ): Promise<RetrievedChunk[]> {
    if (!this.embedder || !this.dataStore.searchKnowledgeByEmbedding) {
      return [];
    }
    try {
      const embedding = await this.embedder(normalized);
      if (!embedding || embedding.length === 0) {
        return [];
      }
      return await this.dataStore.searchKnowledgeByEmbedding(
        tenantId,
        embedding,
        this.retrievalLimit,
      );
    } catch (error) {
      // Semantic search is best-effort and still falls back to keyword
      // retrieval, but the failure must no longer be silent: increment the
      // process-wide counter, log a warning with context, and surface it to the
      // optional callback so ops can detect a degraded embedding provider.
      semanticSearchFailureCount += 1;
      console.warn(
        `[answer-engine] semantic search failed for tenant ${tenantId}; ` +
          `falling back to keyword retrieval (failures so far: ${semanticSearchFailureCount})`,
        error,
      );
      this.onSemanticSearchError?.(error, tenantId);
      return [];
    }
  }

  private async loadPolicy(tenantId: string): Promise<TenantPolicy> {
    const storedPolicy = await this.dataStore.getTenantPolicy(tenantId);
    return {
      ...createDefaultTenantPolicy(tenantId),
      ...storedPolicy,
      allowedIntents: storedPolicy.allowedIntents.length
        ? storedPolicy.allowedIntents
        : DEFAULT_ALLOWED_INTENTS,
      blockedTopics: [...DEFAULT_BLOCKED_TOPICS, ...storedPolicy.blockedTopics],
    };
  }

  private async refuse(
    input: InboundMessage,
    policy: TenantPolicy,
    trace: AnswerTraceStep[],
    reason: string,
    message: string,
  ): Promise<AnswerResult> {
    const handoffRecommended = policy.escalation.enabled;
    if (
      handoffRecommended &&
      policy.escalation.createHandoffRequest &&
      this.handoffStore
    ) {
      const handoffInput = {
        tenantId: input.tenantId,
        channel: input.channel,
        reason,
        message: input.text,
      };
      if (input.conversationId) {
        Object.assign(handoffInput, { conversationId: input.conversationId });
      }
      await this.handoffStore.createHandoff(handoffInput);
      trace.push({
        step: "handoff_request",
        outcome: "passed",
        detail: reason,
      });
    }

    return {
      status: handoffRecommended ? "handoff" : "refused",
      tenantId: input.tenantId,
      channel: input.channel,
      text: message,
      confidence: 0,
      intent: reason,
      citations: [],
      handoffRecommended,
      handoffReason: reason,
      usage: estimateUsage(input.text, message),
      trace,
    };
  }
}

function isDirectTelephoneAnswer(
  input: InboundMessage,
  chunk: RetrievedChunk,
  fallbackAnswer: string,
) {
  if (input.channel !== "telephone") {
    return false;
  }
  if (fallbackAnswer.length > MAX_DIRECT_TELEPHONE_ANSWER_LENGTH) {
    return false;
  }
  return (
    typeof chunk.metadata.answer === "string" &&
    chunk.metadata.answer.trim() === fallbackAnswer
  );
}

export function createAnswerEngine(options: AnswerEngineOptions): AnswerEngine {
  return new AnswerEngine(options);
}

function defaultRefusal(locale: string | undefined) {
  return locale?.toLowerCase().startsWith("de")
    ? DEFAULT_REFUSAL_DE
    : DEFAULT_REFUSAL;
}

export function classifyIntent(
  message: string,
  allowedIntents: AllowedIntent[],
): { allowed: boolean; name: string; score: number } {
  const enabledIntents = allowedIntents.filter((intent) => intent.enabled);
  let best = { allowed: false, name: "unknown", score: 0 };

  for (const intent of enabledIntents) {
    const score = Math.max(
      stableKeywordScore(message, intent.keywords),
      stableKeywordScore(message, intent.examples),
    );
    if (score > best.score) {
      best = { allowed: true, name: intent.name, score };
    }
  }

  if (best.score === 0) {
    return { allowed: false, name: "unknown", score: 0 };
  }

  return best;
}

export function rankChunks(
  query: string,
  chunks: KnowledgeChunk[],
): RetrievedChunk[] {
  return chunks
    .map((chunk) => {
      const metadataQuestion =
        typeof chunk.metadata.question === "string"
          ? ` ${chunk.metadata.question}`
          : "";
      const metadataAnswer =
        typeof chunk.metadata.answer === "string"
          ? ` ${chunk.metadata.answer}`
          : "";
      const content = `${chunk.title ?? ""} ${chunk.content}${metadataQuestion}${metadataAnswer} ${chunk.tags.join(" ")}`;
      return {
        ...chunk,
        score: Math.min(1, tokenOverlapScore(query, content)),
      };
    })
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score);
}

/**
 * Combine keyword and semantic candidates into a single ranked list. A chunk's
 * score is the strongest signal from either method, so semantically-similar
 * chunks that share no keywords still surface, and vice versa.
 */
export function mergeRankedChunks(
  keyword: RetrievedChunk[],
  semantic: RetrievedChunk[],
): RetrievedChunk[] {
  const byId = new Map<string, RetrievedChunk>();
  for (const chunk of [...keyword, ...semantic]) {
    const existing = byId.get(chunk.id);
    if (!existing) {
      byId.set(chunk.id, chunk);
    } else if (chunk.score > existing.score) {
      byId.set(chunk.id, { ...existing, score: chunk.score });
    }
  }
  return [...byId.values()].sort((a, b) => b.score - a.score);
}

export function extractGroundedAnswer(chunk: KnowledgeChunk): string {
  if (
    typeof chunk.metadata.answer === "string" &&
    chunk.metadata.answer.trim()
  ) {
    return chunk.metadata.answer.trim();
  }

  const answerMatch = chunk.content.match(/(?:^|\n)Answer:\s*([\s\S]+)$/i);
  if (answerMatch?.[1]?.trim()) {
    return answerMatch[1].trim();
  }

  return chunk.content.trim();
}

export function sanitizeGroundedAnswer(answer: string | null | undefined) {
  const text =
    answer
      ?.trim()
      .replace(/^["']|["']$/g, "")
      .trim() ?? "";
  if (!text || text.includes(NO_GROUNDED_ANSWER)) {
    return null;
  }
  if (text.length > MAX_GENERATED_ANSWER_LENGTH) {
    return null;
  }
  return text;
}

function findBlockedTopic(
  message: string,
  blockedTopics: TenantPolicy["blockedTopics"],
) {
  return blockedTopics.find(
    (topic) => topic.enabled && containsPhrase(message, topic.terms),
  );
}

function applyTone(answer: string, policy: TenantPolicy): string {
  if (policy.tone === "formal") {
    return answer;
  }

  if (policy.tone === "friendly" && !/[.!?]$/.test(answer)) {
    return `${answer}.`;
  }

  return answer;
}

function estimateUsage(input: string, output: string) {
  const inputCharacters = input.length;
  const outputCharacters = output.length;

  return {
    inputCharacters,
    outputCharacters,
    estimatedCredits: Math.ceil((inputCharacters + outputCharacters) / 1000),
  };
}
