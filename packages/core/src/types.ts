import { z } from "zod";

export const ChannelSchema = z.enum([
  "website",
  "whatsapp",
  "instagram",
  "messenger",
  "tiktok",
  "telephone",
  "admin_test",
]);

export type Channel = z.infer<typeof ChannelSchema>;

export const InboundMessageSchema = z.object({
  tenantId: z.string().uuid(),
  conversationId: z.string().uuid().optional(),
  channel: ChannelSchema,
  externalUserId: z.string().min(1).max(256).optional(),
  text: z.string().min(1).max(4000),
  locale: z.string().min(2).max(16).optional(),
  metadata: z.record(z.unknown()).default({}),
});

export type InboundMessage = z.infer<typeof InboundMessageSchema>;

export type AllowedIntent = {
  name: string;
  description?: string;
  keywords: string[];
  examples: string[];
  enabled: boolean;
};

export type BlockedTopic = {
  name: string;
  terms: string[];
  response?: string;
  enabled: boolean;
};

export type EscalationPolicy = {
  enabled: boolean;
  contactLabel?: string;
  contactValue?: string;
  createHandoffRequest: boolean;
};

export type TenantPolicy = {
  tenantId: string;
  allowedIntents: AllowedIntent[];
  blockedTopics: BlockedTopic[];
  confidenceThreshold: number;
  maxMessageLength: number;
  defaultLocale: string;
  tone: "neutral" | "friendly" | "formal";
  escalation: EscalationPolicy;
};

export type KnowledgeChunk = {
  id: string;
  tenantId: string;
  documentId: string;
  sourceId: string;
  content: string;
  title?: string;
  tags: string[];
  metadata: Record<string, unknown>;
};

export type RetrievedChunk = KnowledgeChunk & {
  score: number;
};

export type UsageEstimate = {
  inputCharacters: number;
  outputCharacters: number;
  estimatedCredits: number;
};

export type AnswerStatus = "answered" | "refused" | "handoff";

export type AnswerTraceStep = {
  step: string;
  outcome: "passed" | "failed" | "skipped";
  detail?: string;
};

export type AnswerResult = {
  status: AnswerStatus;
  tenantId: string;
  channel: Channel;
  text: string;
  confidence: number;
  intent: string;
  citations: Array<{
    chunkId: string;
    documentId: string;
    sourceId: string;
    title?: string;
  }>;
  handoffRecommended: boolean;
  handoffReason?: string;
  usage: UsageEstimate;
  trace: AnswerTraceStep[];
};

export type GroundedAnswerInput = {
  question: string;
  locale?: string;
  intent: string;
  fallbackAnswer: string;
  chunks: RetrievedChunk[];
};

export type GroundedAnswerGenerator = (
  input: GroundedAnswerInput,
) => Promise<string | null>;

export type AnswerDataStore = {
  getTenantPolicy(tenantId: string): Promise<TenantPolicy>;
  searchKnowledge(
    tenantId: string,
    query: string,
    limit: number,
  ): Promise<KnowledgeChunk[]>;
  /**
   * Optional semantic search over stored embeddings. Returns chunks already
   * scored by vector similarity (0..1). When absent, the engine uses keyword
   * retrieval only.
   */
  searchKnowledgeByEmbedding?(
    tenantId: string,
    embedding: number[],
    limit: number,
  ): Promise<RetrievedChunk[]>;
};

export type HandoffInput = {
  tenantId: string;
  conversationId?: string;
  channel: Channel;
  reason: string;
  message: string;
  metadata?: Record<string, unknown>;
};

export type HandoffStore = {
  createHandoff(input: HandoffInput): Promise<unknown>;
};
