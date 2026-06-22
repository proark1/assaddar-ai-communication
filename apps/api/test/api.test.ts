import {
  createDefaultTenantPolicy,
  rankChunks,
  type AnswerDataStore,
  type BlockedTopic,
  type Channel,
  type HandoffInput,
  type HandoffStore,
  type KnowledgeChunk,
  type TenantPolicy,
} from "@assaddar/core";
import { describe, expect, it } from "vitest";
import { buildServer, type PlatformStore } from "../src/server";

class MemoryPlatformStore
  implements PlatformStore, AnswerDataStore, HandoffStore
{
  tenants: Array<{
    id: string;
    publicId: string;
    name: string;
    slug: string;
    defaultLocale: string;
  }> = [];
  chunks: KnowledgeChunk[] = [];
  conversations: Array<{
    id: string;
    publicId: string;
    tenantId: string;
    channel: Channel;
    createdAt: Date;
  }> = [];
  messages: Array<Record<string, unknown>> = [];
  handoffs: Array<
    HandoffInput & {
      id: string;
      status: string;
      assignedTo?: string | null;
      createdAt: Date;
    }
  > = [];
  usageEvents: Array<{ tenantId: string; eventType: string; credits: number }> =
    [];

  async createTenant(input: { name: string; slug: string }) {
    const tenant = {
      id: crypto.randomUUID(),
      publicId: `asst_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`,
      name: input.name,
      slug: input.slug,
      defaultLocale: "en",
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
        openingMessage: "Hi",
      },
    };
  }

  async addFaq(
    tenantId: string,
    input: { question: string; answer: string; tags?: string[] },
  ) {
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
        answer: input.answer,
      },
    };
    this.chunks.push(chunk);
    return { chunk };
  }

  async listKnowledge(tenantId: string) {
    return this.chunks.filter((chunk) => chunk.tenantId === tenantId);
  }

  async updateFaq(
    tenantId: string,
    knowledgeId: string,
    input: { question: string; answer: string; tags?: string[] },
  ) {
    const chunk = this.chunks.find(
      (item) => item.tenantId === tenantId && item.id === knowledgeId,
    );
    if (!chunk) {
      throw new Error("Knowledge item not found.");
    }

    chunk.title = input.question;
    chunk.content = `Question: ${input.question}\nAnswer: ${input.answer}`;
    chunk.tags = input.tags ?? chunk.tags;
    chunk.metadata = {
      question: input.question,
      answer: input.answer,
    };
    return chunk;
  }

  async deleteKnowledge(tenantId: string, knowledgeId: string) {
    this.chunks = this.chunks.filter(
      (chunk) => !(chunk.tenantId === tenantId && chunk.id === knowledgeId),
    );
  }

  async getTenantPolicy(tenantId: string): Promise<TenantPolicy> {
    const policy = createDefaultTenantPolicy(tenantId);
    const blockedTopic: BlockedTopic = {
      name: "competitor",
      terms: ["competitor"],
      enabled: true,
    };
    return {
      ...policy,
      blockedTopics: [blockedTopic],
    };
  }

  async searchKnowledge(
    tenantId: string,
    query: string,
    limit: number,
  ): Promise<KnowledgeChunk[]> {
    return rankChunks(
      query,
      this.chunks.filter((chunk) => chunk.tenantId === tenantId),
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
            conversation.tenantId === input.tenantId &&
            conversation.publicId === input.publicConversationId,
        )
      : undefined;
    if (existing) {
      return existing;
    }

    const conversation = {
      id: crypto.randomUUID(),
      publicId:
        input.publicConversationId ??
        `conv_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`,
      tenantId: input.tenantId,
      channel: input.channel,
      createdAt: new Date(),
    };
    this.conversations.push(conversation);
    return conversation;
  }

  async addMessage(input: Record<string, unknown>) {
    this.messages.push(input);
    return input;
  }

  async listConversations(tenantId: string) {
    return this.conversations.filter(
      (conversation) => conversation.tenantId === tenantId,
    );
  }

  async listConversationMessages(tenantId: string, conversationId: string) {
    return this.messages.filter(
      (message) =>
        message.tenantId === tenantId &&
        message.conversationId === conversationId,
    );
  }

  async logUsage(input: {
    tenantId: string;
    eventType: string;
    credits: number;
  }) {
    this.usageEvents.push(input);
  }

  async createHandoff(input: HandoffInput) {
    this.handoffs.push({
      ...input,
      id: crypto.randomUUID(),
      status: "open",
      createdAt: new Date(),
    });
  }

  async listHandoffs(tenantId: string) {
    return this.handoffs.filter((handoff) => handoff.tenantId === tenantId);
  }

  async updateHandoff(
    tenantId: string,
    handoffId: string,
    input: {
      status?: "open" | "in_progress" | "resolved" | "dismissed" | undefined;
      assignedTo?: string | null | undefined;
    },
  ) {
    const handoff = this.handoffs.find(
      (item) => item.tenantId === tenantId && item.id === handoffId,
    );
    if (!handoff) {
      throw new Error("Handoff request not found.");
    }

    if (input.status) {
      handoff.status = input.status;
    }
    if ("assignedTo" in input) {
      handoff.assignedTo = input.assignedTo ?? null;
    }
    return handoff;
  }

  async getTenantAnalytics(tenantId: string) {
    return {
      conversations: this.conversations.filter(
        (conversation) => conversation.tenantId === tenantId,
      ).length,
      messages: this.messages.filter((message) => message.tenantId === tenantId)
        .length,
      approvedKnowledge: this.chunks.filter(
        (chunk) => chunk.tenantId === tenantId,
      ).length,
      openHandoffs: this.handoffs.filter(
        (handoff) => handoff.tenantId === tenantId && handoff.status === "open",
      ).length,
      totalHandoffs: this.handoffs.filter(
        (handoff) => handoff.tenantId === tenantId,
      ).length,
      usageByStatus: this.usageEvents.filter(
        (event) => event.tenantId === tenantId,
      ),
    };
  }

  async exportTenantData(tenantId: string) {
    return {
      tenant: await this.getTenant(tenantId),
      knowledge: await this.listKnowledge(tenantId),
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
      allowedOrigins: ["*"],
    });

    const tenantResponse = await app.inject({
      method: "POST",
      url: "/admin/tenants",
      headers: { "x-admin-token": "test-token" },
      payload: {
        name: "Tenant One",
        slug: "tenant-one",
      },
    });
    expect(tenantResponse.statusCode).toBe(201);
    const tenant = tenantResponse.json<{ id: string; publicId: string }>();

    const faqResponse = await app.inject({
      method: "POST",
      url: `/admin/tenants/${tenant.id}/knowledge/faqs`,
      headers: { "x-admin-token": "test-token" },
      payload: {
        question: "What are your opening hours?",
        answer: "We are open from 09:00 to 18:00.",
      },
    });
    expect(faqResponse.statusCode).toBe(201);

    const chatResponse = await app.inject({
      method: "POST",
      url: "/widget/chat",
      payload: {
        assistantId: tenant.publicId,
        message: "When are you open?",
      },
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
      allowedOrigins: ["*"],
    });

    const response = await app.inject({
      method: "GET",
      url: "/admin/tenants",
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("updates and deletes tenant knowledge", async () => {
    const store = new MemoryPlatformStore();
    const app = await buildServer({
      store,
      adminToken: "test-token",
      allowedOrigins: ["*"],
    });
    const tenant = await store.createTenant({
      name: "Tenant One",
      slug: "tenant-one",
    });
    const created = await store.addFaq(tenant.id, {
      question: "What do you offer?",
      answer: "We offer implementation support.",
    });
    const knowledgeId = created.chunk.id;

    const updateResponse = await app.inject({
      method: "PUT",
      url: `/admin/tenants/${tenant.id}/knowledge/${knowledgeId}`,
      headers: { "x-admin-token": "test-token" },
      payload: {
        question: "What services do you offer?",
        answer: "We offer AI implementation support.",
      },
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(
      updateResponse.json<{ metadata: { answer: string } }>().metadata.answer,
    ).toContain("AI implementation");

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/admin/tenants/${tenant.id}/knowledge/${knowledgeId}`,
      headers: { "x-admin-token": "test-token" },
    });

    expect(deleteResponse.statusCode).toBe(204);
    expect(await store.listKnowledge(tenant.id)).toHaveLength(0);
    await app.close();
  });

  it("lists analytics, conversations, messages, and handoffs", async () => {
    const store = new MemoryPlatformStore();
    const app = await buildServer({
      store,
      adminToken: "test-token",
      allowedOrigins: ["*"],
    });
    const tenant = await store.createTenant({
      name: "Tenant One",
      slug: "tenant-one",
    });
    await store.addFaq(tenant.id, {
      question: "What are your opening hours?",
      answer: "We are open from 09:00 to 18:00.",
    });

    await app.inject({
      method: "POST",
      url: "/widget/chat",
      payload: {
        assistantId: tenant.publicId,
        message: "When are you open?",
      },
    });

    await app.inject({
      method: "POST",
      url: "/widget/chat",
      payload: {
        assistantId: tenant.publicId,
        message: "Tell me about a competitor",
      },
    });

    const analyticsResponse = await app.inject({
      method: "GET",
      url: `/admin/tenants/${tenant.id}/analytics`,
      headers: { "x-admin-token": "test-token" },
    });
    expect(analyticsResponse.statusCode).toBe(200);
    expect(
      analyticsResponse.json<{
        conversations: number;
        messages: number;
        totalHandoffs: number;
      }>(),
    ).toMatchObject({
      conversations: 2,
      messages: 4,
      totalHandoffs: 1,
    });

    const conversationsResponse = await app.inject({
      method: "GET",
      url: `/admin/tenants/${tenant.id}/conversations`,
      headers: { "x-admin-token": "test-token" },
    });
    expect(conversationsResponse.statusCode).toBe(200);
    const conversations = conversationsResponse.json<Array<{ id: string }>>();
    expect(conversations).toHaveLength(2);
    const conversation = conversations[0];
    if (!conversation) {
      throw new Error("Expected a conversation.");
    }

    const messagesResponse = await app.inject({
      method: "GET",
      url: `/admin/tenants/${tenant.id}/conversations/${conversation.id}/messages`,
      headers: { "x-admin-token": "test-token" },
    });
    expect(messagesResponse.statusCode).toBe(200);
    expect(messagesResponse.json<unknown[]>()).toHaveLength(2);

    const handoffsResponse = await app.inject({
      method: "GET",
      url: `/admin/tenants/${tenant.id}/handoffs`,
      headers: { "x-admin-token": "test-token" },
    });
    expect(handoffsResponse.statusCode).toBe(200);
    const handoff = handoffsResponse.json<Array<{ id: string }>>()[0];
    if (!handoff) {
      throw new Error("Expected a handoff.");
    }

    const updateHandoffResponse = await app.inject({
      method: "PATCH",
      url: `/admin/tenants/${tenant.id}/handoffs/${handoff.id}`,
      headers: { "x-admin-token": "test-token" },
      payload: {
        status: "resolved",
        assignedTo: "Assad",
      },
    });
    expect(updateHandoffResponse.statusCode).toBe(200);
    expect(
      updateHandoffResponse.json<{ status: string; assignedTo: string }>(),
    ).toMatchObject({
      status: "resolved",
      assignedTo: "Assad",
    });

    await app.close();
  });
});
