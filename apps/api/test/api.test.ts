import {
  createDefaultTenantPolicy,
  rankChunks,
  type AnswerDataStore,
  type BlockedTopic,
  type Channel,
  type HandoffInput,
  type HandoffStore,
  type KnowledgeChunk,
  type TenantPolicy
} from "@assaddar/core";
import { describe, expect, it } from "vitest";
import { buildServer, type PlatformStore } from "../src/server";

class MemoryPlatformStore implements PlatformStore, AnswerDataStore, HandoffStore {
  tenants: Array<{ id: string; publicId: string; name: string; slug: string; defaultLocale: string }> = [];
  chunks: KnowledgeChunk[] = [];
  conversations: Array<{ id: string; publicId: string; tenantId: string }> = [];
  messages: unknown[] = [];
  handoffs: HandoffInput[] = [];

  async createTenant(input: { name: string; slug: string }) {
    const tenant = {
      id: crypto.randomUUID(),
      publicId: `asst_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`,
      name: input.name,
      slug: input.slug,
      defaultLocale: "en"
    };
    this.tenants.push(tenant);
    return tenant;
  }

  async listTenants() {
    return this.tenants;
  }

  async getTenant(tenantId: string) {
    return this.tenants.find((tenant) => tenant.id === tenantId) ?? null;
  }

  async getTenantByPublicId(publicId: string) {
    return this.tenants.find((tenant) => tenant.publicId === publicId) ?? null;
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
      theme: {
        primaryColor: "#155eef",
        openingMessage: "Hi"
      }
    };
  }

  async addFaq(tenantId: string, input: { question: string; answer: string; tags?: string[] }) {
    const chunk = {
      id: crypto.randomUUID(),
      tenantId,
      documentId: crypto.randomUUID(),
      sourceId: crypto.randomUUID(),
      title: input.question,
      content: `Question: ${input.question}\nAnswer: ${input.answer}`,
      tags: input.tags ?? ["faq"],
      metadata: {
        question: input.question,
        answer: input.answer
      }
    };
    this.chunks.push(chunk);
    return { chunk };
  }

  async listKnowledge(tenantId: string) {
    return this.chunks.filter((chunk) => chunk.tenantId === tenantId);
  }

  async getTenantPolicy(tenantId: string): Promise<TenantPolicy> {
    const policy = createDefaultTenantPolicy(tenantId);
    const blockedTopic: BlockedTopic = {
      name: "competitor",
      terms: ["competitor"],
      enabled: true
    };
    return {
      ...policy,
      blockedTopics: [blockedTopic]
    };
  }

  async searchKnowledge(tenantId: string, query: string, limit: number): Promise<KnowledgeChunk[]> {
    return rankChunks(
      query,
      this.chunks.filter((chunk) => chunk.tenantId === tenantId)
    ).slice(0, limit);
  }

  async findOrCreateConversation(input: {
    tenantId: string;
    publicConversationId?: string;
    channel: Channel;
  }) {
    const existing = input.publicConversationId
      ? this.conversations.find(
          (conversation) =>
            conversation.tenantId === input.tenantId && conversation.publicId === input.publicConversationId
        )
      : undefined;
    if (existing) {
      return existing;
    }

    const conversation = {
      id: crypto.randomUUID(),
      publicId: input.publicConversationId ?? `conv_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`,
      tenantId: input.tenantId
    };
    this.conversations.push(conversation);
    return conversation;
  }

  async addMessage(input: unknown) {
    this.messages.push(input);
    return input;
  }

  async logUsage() {}

  async createHandoff(input: HandoffInput) {
    this.handoffs.push(input);
  }

  async exportTenantData(tenantId: string) {
    return {
      tenant: await this.getTenant(tenantId),
      knowledge: await this.listKnowledge(tenantId)
    };
  }

  async deleteTenantData(tenantId: string) {
    this.tenants = this.tenants.filter((tenant) => tenant.id !== tenantId);
    this.chunks = this.chunks.filter((chunk) => chunk.tenantId !== tenantId);
  }
}

describe("API", () => {
  it("creates a tenant, adds knowledge, and answers via widget endpoint", async () => {
    const store = new MemoryPlatformStore();
    const app = await buildServer({
      store,
      adminToken: "test-token",
      allowedOrigins: ["*"]
    });

    const tenantResponse = await app.inject({
      method: "POST",
      url: "/admin/tenants",
      headers: { "x-admin-token": "test-token" },
      payload: {
        name: "Tenant One",
        slug: "tenant-one"
      }
    });
    expect(tenantResponse.statusCode).toBe(201);
    const tenant = tenantResponse.json<{ id: string; publicId: string }>();

    const faqResponse = await app.inject({
      method: "POST",
      url: `/admin/tenants/${tenant.id}/knowledge/faqs`,
      headers: { "x-admin-token": "test-token" },
      payload: {
        question: "What are your opening hours?",
        answer: "We are open from 09:00 to 18:00."
      }
    });
    expect(faqResponse.statusCode).toBe(201);

    const chatResponse = await app.inject({
      method: "POST",
      url: "/widget/chat",
      payload: {
        assistantId: tenant.publicId,
        message: "When are you open?"
      }
    });

    expect(chatResponse.statusCode).toBe(200);
    expect(chatResponse.json<{ reply: string }>().reply).toContain("09:00");
    expect(store.messages).toHaveLength(2);

    await app.close();
  });

  it("rejects admin calls without the configured token", async () => {
    const store = new MemoryPlatformStore();
    const app = await buildServer({
      store,
      adminToken: "test-token",
      allowedOrigins: ["*"]
    });

    const response = await app.inject({
      method: "GET",
      url: "/admin/tenants"
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });
});
