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
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildServer, type PlatformStore } from "../src/server";

const originalFetch = globalThis.fetch;

class MemoryPlatformStore
  implements PlatformStore, AnswerDataStore, HandoffStore
{
  tenants: Array<{
    id: string;
    publicId: string;
    name: string;
    slug: string;
    defaultLocale: string;
    tone?: "friendly" | "neutral" | "formal";
    theme?: Record<string, unknown>;
    confidenceThreshold?: number;
    maxMessageLength?: number;
    retentionDays?: number;
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
      requesterMessage?: string;
      assignedTo?: string | null;
      metadata?: Record<string, unknown>;
      createdAt: Date;
    }
  > = [];
  usageEvents: Array<{
    tenantId: string;
    eventType: string;
    credits: number;
    metadata?: Record<string, unknown>;
  }> = [];

  async createTenant(input: { name: string; slug: string }) {
    const tenant = {
      id: crypto.randomUUID(),
      publicId: `asst_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`,
      name: input.name,
      slug: input.slug,
      defaultLocale: "en",
      tone: "friendly" as const,
      theme: {
        primaryColor: "#155eef",
        openingMessage: "Hi",
      },
      maxMessageLength: 1200,
    };
    this.tenants.push(tenant);
    return tenant;
  }

  async updateTenant(
    tenantId: string,
    input: {
      name?: string;
      slug?: string;
      defaultLocale?: string;
      tone?: "friendly" | "neutral" | "formal";
      confidenceThreshold?: number;
      maxMessageLength?: number;
      retentionDays?: number;
      theme?: Record<string, unknown>;
    },
  ) {
    const tenant = this.tenants.find((item) => item.id === tenantId);
    if (!tenant) {
      throw new Error("Tenant not found.");
    }

    Object.assign(tenant, {
      ...input,
      theme: {
        ...(tenant.theme ?? {}),
        ...(input.theme ?? {}),
      },
    });
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
      theme: tenant.theme,
      limits: {
        maxMessageLength: tenant.maxMessageLength ?? 1200,
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
    metadata?: Record<string, unknown>;
  }) {
    this.usageEvents.push(input);
  }

  async createHandoff(input: HandoffInput) {
    this.handoffs.push({
      ...input,
      id: crypto.randomUUID(),
      status: "open",
      requesterMessage: input.message,
      metadata:
        input.reason === "lead_capture" ||
        input.reason === "readiness_assessment"
          ? { pipelineStage: "new" }
          : {},
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
      pipelineStage?:
        | "new"
        | "contacted"
        | "qualified"
        | "proposal"
        | "won"
        | "lost"
        | undefined;
      note?: string | undefined;
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
    if (input.pipelineStage || input.note) {
      handoff.metadata = {
        ...(handoff.metadata ?? {}),
        ...(input.pipelineStage ? { pipelineStage: input.pipelineStage } : {}),
      };
      if (input.note) {
        handoff.metadata.notes = [
          ...((handoff.metadata.notes as unknown[]) ?? []),
          { body: input.note },
        ];
      }
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
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns an authenticated admin session with role permissions", async () => {
    const store = new MemoryPlatformStore();
    const app = await buildServer({
      store,
      adminToken: "test-token",
      allowedOrigins: ["*"],
      adminUser: {
        email: "admin@example.com",
        name: "Admin User",
        role: "operator",
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/admin/session",
      headers: { "x-admin-token": "test-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(
      response.json<{ user: { role: string }; permissions: string[] }>(),
    ).toMatchObject({
      user: { role: "operator" },
      permissions: ["knowledge:write", "leads:write"],
    });
    await app.close();
  });

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

  it("updates tenant settings and returns them through widget config", async () => {
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

    const updateResponse = await app.inject({
      method: "PATCH",
      url: `/admin/tenants/${tenant.id}`,
      headers: { "x-admin-token": "test-token" },
      payload: {
        defaultLocale: "de",
        tone: "formal",
        theme: {
          primaryColor: "#0f766e",
          launcherLabel: "KI Chat",
          leadCaptureEnabled: true,
          leadCaptureFields: ["name", "email", "company"],
        },
      },
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(
      updateResponse.json<{
        defaultLocale: string;
        theme: { launcherLabel: string };
      }>(),
    ).toMatchObject({
      defaultLocale: "de",
      theme: {
        launcherLabel: "KI Chat",
      },
    });

    const configResponse = await app.inject({
      method: "GET",
      url: `/widget/config/${tenant.publicId}`,
    });

    expect(configResponse.statusCode).toBe(200);
    expect(
      configResponse.json<{
        defaultLocale: string;
        theme: { leadCaptureEnabled: boolean };
      }>(),
    ).toMatchObject({
      defaultLocale: "de",
      theme: {
        leadCaptureEnabled: true,
      },
    });
    await app.close();
  });

  it("imports multi-page website content into suggested FAQs and checks widget install", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const isAbout = url.includes("/about");
      return new Response(
        isAbout
          ? `<!doctype html>
        <title>About Assaddar</title>
        <main>
          <p>Datenschutz, DSGVO und Unternehmensdaten werden vor jedem KI Projekt sauber geklaert.</p>
        </main>`
          : `<!doctype html>
        <title>Assaddar AI Consultancy</title>
        <meta name="description" content="AI consulting and automation for German SMEs.">
        <main>
          <h1>KI Beratung fuer KMU</h1>
          <p>Wir helfen Unternehmen mit KI Beratung, Automatisierung, Workshops und Roadmaps fuer bessere Prozesse.</p>
          <p>Kontaktieren Sie uns fuer ein Beratungsgespraech und eine konkrete Umsetzungsplanung.</p>
          <a href="/about">About</a>
          <script src="https://assaddar-widget-production.up.railway.app/widget.js" data-assistant-id="asst_1234567890"></script>
        </main>`,
        {
          status: 200,
          headers: { "content-type": "text/html" },
        },
      );
    }) as typeof fetch;

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

    const importResponse = await app.inject({
      method: "POST",
      url: `/admin/tenants/${tenant.id}/knowledge/import-website`,
      headers: { "x-admin-token": "test-token" },
      payload: {
        url: "https://assad-dar.de",
        maxPages: 2,
      },
    });

    expect(importResponse.statusCode).toBe(200);
    const importBody = importResponse.json<{
      pagesScanned: unknown[];
      suggestedFaqs: Array<{ question: string }>;
    }>();
    expect(importBody.pagesScanned).toHaveLength(2);
    expect(importBody.suggestedFaqs.length).toBeGreaterThan(0);

    const checkResponse = await app.inject({
      method: "POST",
      url: `/admin/tenants/${tenant.id}/install-check`,
      headers: { "x-admin-token": "test-token" },
      payload: {
        url: "https://assad-dar.de",
        assistantId: "asst_1234567890",
        widgetUrl: "https://assaddar-widget-production.up.railway.app/widget.js",
      },
    });

    expect(checkResponse.statusCode).toBe(200);
    expect(checkResponse.json<{ installed: boolean }>()).toMatchObject({
      installed: true,
    });
    await app.close();
  });

  it("captures widget leads as conversations and handoffs", async () => {
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

    const response = await app.inject({
      method: "POST",
      url: "/widget/leads",
      payload: {
        assistantId: tenant.publicId,
        visitorId: "visitor-one",
        pageUrl: "https://assad-dar.de/de",
        fields: {
          name: "Ada",
          email: "ada@example.com",
          company: "Example GmbH",
          projectType: "Support automation",
        },
      },
    });

    expect(response.statusCode).toBe(201);
    expect(store.conversations).toHaveLength(1);
    expect(store.messages[0]?.content).toContain("ada@example.com");
    expect(store.handoffs[0]).toMatchObject({
      reason: "lead_capture",
      status: "open",
      metadata: {
        pipelineStage: "new",
      },
    });

    const handoff = store.handoffs[0];
    if (!handoff) {
      throw new Error("Expected a handoff.");
    }
    const updateResponse = await app.inject({
      method: "PATCH",
      url: `/admin/tenants/${tenant.id}/handoffs/${handoff.id}`,
      headers: { "x-admin-token": "test-token" },
      payload: {
        pipelineStage: "qualified",
        note: "Good fit",
      },
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(
      updateResponse.json<{ metadata: { pipelineStage: string } }>().metadata
        .pipelineStage,
    ).toBe("qualified");
    await app.close();
  });

  it("sends lead notification emails when an email sender is configured", async () => {
    const sentEmails: Array<{ to: string; subject: string; text: string }> = [];
    const store = new MemoryPlatformStore();
    const app = await buildServer({
      store,
      adminToken: "test-token",
      allowedOrigins: ["*"],
      leadNotificationEmailTo: "owner@example.com",
      leadNotificationEmailSender: async (email) => {
        sentEmails.push(email);
      },
    });
    const tenant = await store.createTenant({
      name: "Tenant One",
      slug: "tenant-one",
    });

    const response = await app.inject({
      method: "POST",
      url: "/widget/leads",
      payload: {
        assistantId: tenant.publicId,
        visitorId: "visitor-one",
        pageUrl: "https://assad-dar.de/de",
        fields: {
          name: "Ada",
          email: "ada@example.com",
          company: "Example GmbH",
          projectType: "Support automation",
        },
      },
    });

    expect(response.statusCode).toBe(201);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]).toMatchObject({
      to: "owner@example.com",
      subject: "Website lead - Tenant One",
    });
    expect(sentEmails[0]?.text).toContain("ada@example.com");
    expect(sentEmails[0]?.text).toContain("https://assad-dar.de/de");
    await app.close();
  });

  it("captures AI readiness assessments as lead handoffs", async () => {
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

    const response = await app.inject({
      method: "POST",
      url: "/widget/readiness",
      payload: {
        assistantId: tenant.publicId,
        visitorId: "visitor-one",
        pageUrl: "https://assad-dar.de/de",
        answers: {
          goal: "Automate support",
          processPain: "Manual email sorting",
          systems: "HubSpot and Excel",
          timeline: "This quarter",
        },
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json<{ score: number }>().score).toBeGreaterThan(60);
    expect(store.handoffs[0]).toMatchObject({
      reason: "readiness_assessment",
      metadata: {
        pipelineStage: "new",
      },
    });
    await app.close();
  });

  it("logs widget events for funnel analytics", async () => {
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

    const response = await app.inject({
      method: "POST",
      url: "/widget/events",
      payload: {
        assistantId: tenant.publicId,
        visitorId: "visitor-one",
        pageUrl: "https://assad-dar.de/de",
        eventType: "quick_reply_clicked",
        metadata: {
          reply: "Termin buchen",
        },
      },
    });

    expect(response.statusCode).toBe(202);
    expect(store.usageEvents[0]).toMatchObject({
      tenantId: tenant.id,
      eventType: "quick_reply_clicked",
      credits: 0,
      metadata: {
        visitorId: "visitor-one",
        reply: "Termin buchen",
      },
    });
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

    const unansweredResponse = await app.inject({
      method: "GET",
      url: `/admin/tenants/${tenant.id}/unanswered`,
      headers: { "x-admin-token": "test-token" },
    });
    expect(unansweredResponse.statusCode).toBe(200);
    expect(
      unansweredResponse.json<Array<{ reason: string; question: string }>>()[0],
    ).toMatchObject({
      reason: "competitor",
      question: "Tell me about a competitor",
    });

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
