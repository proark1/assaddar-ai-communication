import {
  createDefaultTenantPolicy,
  DEFAULT_ALLOWED_INTENTS,
  DEFAULT_BLOCKED_TOPICS
} from "./policy";
import { containsPhrase, normalizeText, stableKeywordScore, tokenOverlapScore } from "./text";
import type {
  AllowedIntent,
  AnswerDataStore,
  AnswerResult,
  AnswerTraceStep,
  HandoffStore,
  InboundMessage,
  KnowledgeChunk,
  RetrievedChunk,
  TenantPolicy
} from "./types";

const DEFAULT_REFUSAL =
  "I don't have that information in the approved business knowledge. I can take a message or connect you with the team.";

export type AnswerEngineOptions = {
  dataStore: AnswerDataStore;
  handoffStore?: HandoffStore;
  retrievalLimit?: number;
};

export class AnswerEngine {
  private readonly dataStore: AnswerDataStore;
  private readonly handoffStore: HandoffStore | undefined;
  private readonly retrievalLimit: number;

  constructor(options: AnswerEngineOptions) {
    this.dataStore = options.dataStore;
    this.handoffStore = options.handoffStore;
    this.retrievalLimit = options.retrievalLimit ?? 8;
  }

  async answer(input: InboundMessage): Promise<AnswerResult> {
    const trace: AnswerTraceStep[] = [];
    const normalized = normalizeText(input.text);
    trace.push({ step: "normalize", outcome: normalized ? "passed" : "failed" });

    const policy = await this.loadPolicy(input.tenantId);
    if (normalized.length > policy.maxMessageLength) {
      return this.refuse(input, policy, trace, "message_length", "Message is too long for this assistant.");
    }

    const blockedTopic = findBlockedTopic(normalized, policy.blockedTopics);
    if (blockedTopic) {
      trace.push({
        step: "blocked_topic",
        outcome: "failed",
        detail: blockedTopic.name
      });

      return this.refuse(
        input,
        policy,
        trace,
        blockedTopic.name,
        blockedTopic.response ?? "I can only answer questions about this business."
      );
    }
    trace.push({ step: "blocked_topic", outcome: "passed" });

    const intent = classifyIntent(normalized, policy.allowedIntents);
    if (!intent.allowed) {
      trace.push({ step: "intent_policy", outcome: "failed", detail: intent.name });
      return this.refuse(input, policy, trace, "intent_not_allowed", DEFAULT_REFUSAL);
    }
    trace.push({ step: "intent_policy", outcome: "passed", detail: intent.name });

    const chunks = await this.dataStore.searchKnowledge(input.tenantId, normalized, this.retrievalLimit);
    const rankedChunks = rankChunks(normalized, chunks);
    const bestChunk = rankedChunks[0];
    if (!bestChunk || bestChunk.score < policy.confidenceThreshold) {
      trace.push({
        step: "retrieve_knowledge",
        outcome: "failed",
        detail: bestChunk ? String(bestChunk.score) : "no_chunks"
      });
      return this.refuse(input, policy, trace, "knowledge_not_found", DEFAULT_REFUSAL);
    }
    trace.push({ step: "retrieve_knowledge", outcome: "passed", detail: String(bestChunk.score) });

    const answer = extractGroundedAnswer(bestChunk);
    if (!answer) {
      trace.push({ step: "validate_answer", outcome: "failed", detail: "empty_grounded_answer" });
      return this.refuse(input, policy, trace, "answer_validation_failed", DEFAULT_REFUSAL);
    }

    trace.push({ step: "generate_grounded_answer", outcome: "passed" });
    trace.push({ step: "validate_answer", outcome: "passed" });

    const citation: AnswerResult["citations"][number] = {
      chunkId: bestChunk.id,
      documentId: bestChunk.documentId,
      sourceId: bestChunk.sourceId
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
      trace
    };
  }

  private async loadPolicy(tenantId: string): Promise<TenantPolicy> {
    const storedPolicy = await this.dataStore.getTenantPolicy(tenantId);
    return {
      ...createDefaultTenantPolicy(tenantId),
      ...storedPolicy,
      allowedIntents: storedPolicy.allowedIntents.length
        ? storedPolicy.allowedIntents
        : DEFAULT_ALLOWED_INTENTS,
      blockedTopics: [...DEFAULT_BLOCKED_TOPICS, ...storedPolicy.blockedTopics]
    };
  }

  private async refuse(
    input: InboundMessage,
    policy: TenantPolicy,
    trace: AnswerTraceStep[],
    reason: string,
    message: string
  ): Promise<AnswerResult> {
    const handoffRecommended = policy.escalation.enabled;
    if (handoffRecommended && policy.escalation.createHandoffRequest && this.handoffStore) {
      const handoffInput = {
        tenantId: input.tenantId,
        channel: input.channel,
        reason,
        message: input.text
      };
      if (input.conversationId) {
        Object.assign(handoffInput, { conversationId: input.conversationId });
      }
      await this.handoffStore.createHandoff(handoffInput);
      trace.push({ step: "handoff_request", outcome: "passed", detail: reason });
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
      trace
    };
  }
}

export function createAnswerEngine(options: AnswerEngineOptions): AnswerEngine {
  return new AnswerEngine(options);
}

export function classifyIntent(
  message: string,
  allowedIntents: AllowedIntent[]
): { allowed: boolean; name: string; score: number } {
  const enabledIntents = allowedIntents.filter((intent) => intent.enabled);
  let best = { allowed: false, name: "unknown", score: 0 };

  for (const intent of enabledIntents) {
    const score = Math.max(
      stableKeywordScore(message, intent.keywords),
      stableKeywordScore(message, intent.examples)
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

export function rankChunks(query: string, chunks: KnowledgeChunk[]): RetrievedChunk[] {
  return chunks
    .map((chunk) => {
      const metadataQuestion =
        typeof chunk.metadata.question === "string" ? ` ${chunk.metadata.question}` : "";
      const metadataAnswer = typeof chunk.metadata.answer === "string" ? ` ${chunk.metadata.answer}` : "";
      const content = `${chunk.title ?? ""} ${chunk.content}${metadataQuestion}${metadataAnswer} ${chunk.tags.join(" ")}`;
      return {
        ...chunk,
        score: Math.min(1, tokenOverlapScore(query, content))
      };
    })
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function extractGroundedAnswer(chunk: KnowledgeChunk): string {
  if (typeof chunk.metadata.answer === "string" && chunk.metadata.answer.trim()) {
    return chunk.metadata.answer.trim();
  }

  const answerMatch = chunk.content.match(/(?:^|\n)Answer:\s*([\s\S]+)$/i);
  if (answerMatch?.[1]?.trim()) {
    return answerMatch[1].trim();
  }

  return chunk.content.trim();
}

function findBlockedTopic(message: string, blockedTopics: TenantPolicy["blockedTopics"]) {
  return blockedTopics.find((topic) => topic.enabled && containsPhrase(message, topic.terms));
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
    estimatedCredits: Math.ceil((inputCharacters + outputCharacters) / 1000)
  };
}
