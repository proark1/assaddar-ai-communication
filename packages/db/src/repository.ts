import type {
  AnswerDataStore,
  AllowedIntent,
  BlockedTopic,
  Channel,
  HandoffInput,
  HandoffStore,
  KnowledgeChunk,
  TenantPolicy
} from "@assaddar/core";
import { createDefaultTenantPolicy, rankChunks } from "@assaddar/core";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Database } from "./client";
import {
  allowedIntents,
  auditLogs,
  blockedTopics,
  conversations,
  escalationRules,
  handoffRequests,
  knowledgeChunks,
  knowledgeDocuments,
  knowledgeSources,
  messages,
  tenants,
  usageEvents,
  type WidgetTheme
} from "./schema";
import { assertTenantId } from "./tenant-scope";

export type TenantSummary = typeof tenants.$inferSelect;

export type CreateTenantInput = {
  name: string;
  slug: string;
  defaultLocale?: string;
  theme?: WidgetTheme;
};

export type AddFaqInput = {
  question: string;
  answer: string;
  tags?: string[];
};

export type ConversationRecord = typeof conversations.$inferSelect;

export type MessageRecord = typeof messages.$inferSelect;

export class TenantRepository implements AnswerDataStore, HandoffStore {
  constructor(private readonly db: Database) {}

  async createTenant(input: CreateTenantInput) {
    const [tenant] = await this.db
      .insert(tenants)
      .values({
        name: input.name,
        slug: input.slug,
        publicId: createPublicAssistantId(),
        defaultLocale: input.defaultLocale ?? "en",
        theme: input.theme ?? {
          primaryColor: "#155eef",
          openingMessage: "Hi, how can I help?"
        }
      })
      .returning();

    if (!tenant) {
      throw new Error("Failed to create tenant.");
    }

    await this.createDefaultEscalationRule(tenant.id);
    await this.audit(tenant.id, "tenant.created", "tenant", tenant.id, {
      name: tenant.name,
      slug: tenant.slug
    });

    return tenant;
  }

  async listTenants() {
    return this.db.select().from(tenants).orderBy(desc(tenants.createdAt));
  }

  async getTenant(tenantId: string) {
    assertTenantId(tenantId);
    const [tenant] = await this.db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    return tenant ?? null;
  }

  async getTenantBySlug(slug: string) {
    const [tenant] = await this.db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
    return tenant ?? null;
  }

  async getTenantByPublicId(publicId: string) {
    const [tenant] = await this.db
      .select()
      .from(tenants)
      .where(and(eq(tenants.publicId, publicId), eq(tenants.status, "active")))
      .limit(1);
    return tenant ?? null;
  }

  async getWidgetConfig(publicId: string) {
    const tenant = await this.getTenantByPublicId(publicId);
    if (!tenant) {
      return null;
    }

    return {
      assistantId: tenant.publicId,
      tenantName: tenant.name,
      defaultLocale: tenant.defaultLocale,
      theme: tenant.theme,
      limits: {
        maxMessageLength: tenant.maxMessageLength
      }
    };
  }

  async addFaq(tenantId: string, input: AddFaqInput) {
    assertTenantId(tenantId);
    const tenant = await this.getTenant(tenantId);
    if (!tenant) {
      throw new Error("Tenant not found.");
    }

    const [source] = await this.db
      .insert(knowledgeSources)
      .values({
        tenantId,
        type: "manual_faq",
        name: "Manual FAQ",
        metadata: {
          entryType: "faq"
        }
      })
      .returning();

    if (!source) {
      throw new Error("Failed to create knowledge source.");
    }

    const content = `Question: ${input.question}\nAnswer: ${input.answer}`;
    const [document] = await this.db
      .insert(knowledgeDocuments)
      .values({
        tenantId,
        sourceId: source.id,
        title: input.question,
        content,
        metadata: {
          question: input.question,
          answer: input.answer
        }
      })
      .returning();

    if (!document) {
      throw new Error("Failed to create knowledge document.");
    }

    const [chunk] = await this.db
      .insert(knowledgeChunks)
      .values({
        tenantId,
        sourceId: source.id,
        documentId: document.id,
        title: input.question,
        content,
        tags: input.tags ?? ["faq"],
        metadata: {
          question: input.question,
          answer: input.answer
        }
      })
      .returning();

    if (!chunk) {
      throw new Error("Failed to create knowledge chunk.");
    }

    await this.audit(tenantId, "knowledge.faq.created", "knowledge_document", document.id, {
      question: input.question
    });

    return { source, document, chunk };
  }

  async listKnowledge(tenantId: string) {
    assertTenantId(tenantId);
    return this.db
      .select({
        id: knowledgeChunks.id,
        title: knowledgeChunks.title,
        content: knowledgeChunks.content,
        tags: knowledgeChunks.tags,
        status: knowledgeChunks.status,
        metadata: knowledgeChunks.metadata,
        createdAt: knowledgeChunks.createdAt
      })
      .from(knowledgeChunks)
      .where(eq(knowledgeChunks.tenantId, tenantId))
      .orderBy(desc(knowledgeChunks.createdAt));
  }

  async getTenantPolicy(tenantId: string): Promise<TenantPolicy> {
    assertTenantId(tenantId);
    const tenant = await this.getTenant(tenantId);
    if (!tenant) {
      throw new Error("Tenant not found.");
    }

    const [storedAllowedIntents, storedBlockedTopics, [escalationRule]] = await Promise.all([
      this.db.select().from(allowedIntents).where(eq(allowedIntents.tenantId, tenantId)),
      this.db.select().from(blockedTopics).where(eq(blockedTopics.tenantId, tenantId)),
      this.db
        .select()
        .from(escalationRules)
        .where(and(eq(escalationRules.tenantId, tenantId), eq(escalationRules.enabled, true)))
        .limit(1)
    ]);

    const blocked: BlockedTopic[] = storedBlockedTopics.map((topic) => {
      const mapped: BlockedTopic = {
        name: topic.name,
        terms: topic.terms,
        enabled: topic.enabled
      };
      if (topic.response) {
        mapped.response = topic.response;
      }
      return mapped;
    });

    const mappedAllowedIntents: AllowedIntent[] = storedAllowedIntents.map((intent) => {
      const mapped: AllowedIntent = {
        name: intent.name,
        keywords: intent.keywords,
        examples: intent.examples,
        enabled: intent.enabled
      };
      if (intent.description) {
        mapped.description = intent.description;
      }
      return mapped;
    });

    const escalation = {
      enabled: escalationRule?.enabled ?? true,
      contactLabel: escalationRule?.contactLabel ?? "team",
      createHandoffRequest: escalationRule?.createHandoffRequest ?? true
    };
    if (escalationRule?.contactValue) {
      Object.assign(escalation, { contactValue: escalationRule.contactValue });
    }

    const basePolicy = createDefaultTenantPolicy(tenantId);
    return {
      ...basePolicy,
      allowedIntents: mappedAllowedIntents,
      blockedTopics: blocked,
      confidenceThreshold: Number(tenant.confidenceThreshold),
      maxMessageLength: tenant.maxMessageLength,
      defaultLocale: tenant.defaultLocale,
      tone: tenant.tone === "formal" || tenant.tone === "neutral" ? tenant.tone : "friendly",
      escalation
    };
  }

  async searchKnowledge(tenantId: string, query: string, limit: number): Promise<KnowledgeChunk[]> {
    assertTenantId(tenantId);
    const rows = await this.db
      .select()
      .from(knowledgeChunks)
      .where(and(eq(knowledgeChunks.tenantId, tenantId), eq(knowledgeChunks.status, "approved")))
      .limit(Math.max(limit * 5, limit));

    return rankChunks(
      query,
      rows.map((row) => {
        const chunk: KnowledgeChunk = {
          id: row.id,
          tenantId: row.tenantId,
          documentId: row.documentId,
          sourceId: row.sourceId,
          content: row.content,
          tags: row.tags,
          metadata: row.metadata
        };
        if (row.title) {
          chunk.title = row.title;
        }
        return chunk;
      })
    ).slice(0, limit);
  }

  async findOrCreateConversation(input: {
    tenantId: string;
    publicConversationId?: string;
    channel: Channel;
    externalUserId?: string;
    locale?: string;
  }): Promise<ConversationRecord> {
    assertTenantId(input.tenantId);
    if (input.publicConversationId) {
      const [existing] = await this.db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.tenantId, input.tenantId),
            eq(conversations.publicId, input.publicConversationId)
          )
        )
        .limit(1);
      if (existing) {
        return existing;
      }
    }

    const [conversation] = await this.db
      .insert(conversations)
      .values({
        tenantId: input.tenantId,
        publicId: input.publicConversationId ?? createPublicConversationId(),
        channel: input.channel,
        externalUserId: input.externalUserId,
        locale: input.locale ?? "en"
      })
      .returning();

    if (!conversation) {
      throw new Error("Failed to create conversation.");
    }

    return conversation;
  }

  async addMessage(input: {
    tenantId: string;
    conversationId: string;
    channel: Channel;
    direction: "inbound" | "outbound";
    role: "user" | "assistant" | "system";
    content: string;
    trace?: Record<string, unknown>;
  }): Promise<MessageRecord> {
    assertTenantId(input.tenantId);
    const [message] = await this.db
      .insert(messages)
      .values({
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        channel: input.channel,
        direction: input.direction,
        role: input.role,
        content: input.content,
        trace: input.trace ?? {}
      })
      .returning();

    if (!message) {
      throw new Error("Failed to store message.");
    }

    return message;
  }

  async listConversationMessages(tenantId: string, conversationId: string) {
    assertTenantId(tenantId);
    return this.db
      .select()
      .from(messages)
      .where(and(eq(messages.tenantId, tenantId), eq(messages.conversationId, conversationId)))
      .orderBy(messages.createdAt);
  }

  async createHandoff(input: HandoffInput) {
    assertTenantId(input.tenantId);
    await this.db.insert(handoffRequests).values({
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      channel: input.channel,
      reason: input.reason,
      requesterMessage: input.message
    });
  }

  async logUsage(input: {
    tenantId: string;
    channel: Channel;
    eventType: string;
    credits: number;
    estimatedCostCents?: number;
    metadata?: Record<string, unknown>;
  }) {
    assertTenantId(input.tenantId);
    await this.db.insert(usageEvents).values({
      tenantId: input.tenantId,
      channel: input.channel,
      eventType: input.eventType,
      credits: input.credits,
      estimatedCostCents: input.estimatedCostCents ?? 0,
      metadata: input.metadata ?? {}
    });
  }

  async exportTenantData(tenantId: string) {
    assertTenantId(tenantId);
    const [tenant, knowledge, tenantConversations, handoffs] = await Promise.all([
      this.getTenant(tenantId),
      this.listKnowledge(tenantId),
      this.db.select().from(conversations).where(eq(conversations.tenantId, tenantId)),
      this.db.select().from(handoffRequests).where(eq(handoffRequests.tenantId, tenantId))
    ]);

    return {
      tenant,
      knowledge,
      conversations: tenantConversations,
      handoffRequests: handoffs
    };
  }

  async deleteTenantData(tenantId: string) {
    assertTenantId(tenantId);
    await this.db.delete(tenants).where(eq(tenants.id, tenantId));
  }

  private async createDefaultEscalationRule(tenantId: string) {
    await this.db.insert(escalationRules).values({
      tenantId,
      name: "Default handoff",
      channel: "all",
      contactLabel: "team",
      enabled: true,
      createHandoffRequest: true
    });
  }

  private async audit(
    tenantId: string,
    action: string,
    targetType: string,
    targetId: string,
    metadata: Record<string, unknown>
  ) {
    await this.db.insert(auditLogs).values({
      tenantId,
      actorType: "system",
      action,
      targetType,
      targetId,
      metadata
    });
  }
}

export function createPublicAssistantId() {
  return `asst_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`;
}

export function createPublicConversationId() {
  return `conv_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`;
}

export async function setTenantSession(db: Database, tenantId: string) {
  assertTenantId(tenantId);
  await db.execute(sql`select set_config('app.current_tenant_id', ${tenantId}, true)`);
}
