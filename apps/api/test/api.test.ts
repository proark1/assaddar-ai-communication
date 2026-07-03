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
import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildServer,
  parseTrustProxy,
  type PlatformStore,
} from "../src/server";

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
    contactId?: string | null;
    externalUserId?: string | null;
    locale?: string;
    createdAt: Date;
    updatedAt: Date;
  }> = [];
  messages: Array<Record<string, unknown>> = [];
  contacts: Array<{
    id: string;
    tenantId: string;
    displayName?: string | null;
    email?: string | null;
    phone?: string | null;
    company?: string | null;
    identifiers: Record<string, string[]>;
    metadata: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
  }> = [];
  whatsappTemplates: Array<{
    id: string;
    tenantId: string;
    name: string;
    language: string;
    category: string;
    status: string;
    body: string;
    variables: string[];
    createdAt: Date;
    updatedAt: Date;
  }> = [];
  deliveries: Array<Record<string, unknown>> = [];
  webhookEvents: Array<{
    id: string;
    tenantId?: string | null;
    channel: Channel;
    providerEventId?: string | null;
    eventType: string;
    payload: Record<string, unknown>;
    status: string;
    error?: string | null;
    processedAt?: Date | null;
    createdAt: Date;
  }> = [];
  channelConnections: Array<{
    id: string;
    tenantId: string;
    channel: Channel;
    provider: string;
    externalAccountId?: string | null;
    status: string;
    settings: Record<string, unknown>;
    updatedAt: Date;
  }> = [];
  users: Array<{
    id: string;
    authUserId?: string | null;
    email: string;
    name: string;
    status: string;
    passwordHash?: string | null;
    createdAt: Date;
    updatedAt: Date;
  }> = [];
  memberships: Array<{
    id: string;
    tenantId: string;
    userId: string;
    role:
      | "platform_owner"
      | "tenant_owner"
      | "tenant_admin"
      | "operator"
      | "viewer";
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }> = [];
  sessions: Array<{
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    createdAt: Date;
    lastSeenAt: Date;
  }> = [];
  invites: Array<{
    id: string;
    tenantId: string;
    email: string;
    roleName:
      | "platform_owner"
      | "tenant_owner"
      | "tenant_admin"
      | "operator"
      | "viewer";
    tokenHash: string;
    status: string;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
  }> = [];
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

  async listTenantsForUser(userId: string) {
    const tenantIds = new Set(
      this.memberships
        .filter((item) => item.userId === userId && item.status === "active")
        .map((item) => item.tenantId),
    );
    return this.tenants.filter((tenant) => tenantIds.has(tenant.id));
  }

  async findUserByEmailForAuth(email: string) {
    return (
      this.users.find(
        (user) => user.email.toLowerCase() === email.toLowerCase(),
      ) ?? null
    );
  }

  async createUserSession(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    const session = {
      id: crypto.randomUUID(),
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      createdAt: new Date(),
      lastSeenAt: new Date(),
    };
    this.sessions.push(session);
    return session;
  }

  async getAuthSession(tokenHash: string) {
    const session = this.sessions.find((item) => item.tokenHash === tokenHash);
    if (!session || session.expiresAt.getTime() <= Date.now()) {
      return null;
    }
    const user = this.users.find((item) => item.id === session.userId);
    if (!user || user.status !== "active") {
      return null;
    }
    return {
      sessionId: session.id,
      expiresAt: session.expiresAt,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        status: user.status,
      },
      memberships: this.memberships
        .filter((item) => item.userId === user.id && item.status === "active")
        .map((item) => {
          const tenant = this.tenants.find(
            (candidate) => candidate.id === item.tenantId,
          );
          return {
            tenantId: item.tenantId,
            tenantName: tenant?.name ?? "Tenant",
            tenantSlug: tenant?.slug ?? "tenant",
            role: item.role,
            status: item.status,
          };
        }),
    };
  }

  async getAuthSessionBySupabaseUser(input: {
    authUserId: string;
    email: string;
    name?: string | null;
    expiresAt: Date;
  }) {
    const email = input.email.toLowerCase();
    let user =
      this.users.find((item) => item.authUserId === input.authUserId) ??
      this.users.find((item) => item.email === email);
    if (!user) {
      user = {
        id: crypto.randomUUID(),
        authUserId: input.authUserId,
        email,
        name: input.name ?? email,
        status: "active",
        passwordHash: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.users.push(user);
    } else if (!user.authUserId) {
      user.authUserId = input.authUserId;
      user.updatedAt = new Date();
    }
    if (user.status !== "active") {
      return null;
    }
    return {
      sessionId: `supabase:${input.authUserId}`,
      expiresAt: input.expiresAt,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        status: user.status,
      },
      memberships: this.memberships
        .filter((item) => item.userId === user.id && item.status === "active")
        .map((item) => {
          const tenant = this.tenants.find(
            (candidate) => candidate.id === item.tenantId,
          );
          return {
            tenantId: item.tenantId,
            tenantName: tenant?.name ?? "Tenant",
            tenantSlug: tenant?.slug ?? "tenant",
            role: item.role,
            status: item.status,
          };
        }),
    };
  }

  async deleteUserSession(tokenHash: string) {
    this.sessions = this.sessions.filter(
      (session) => session.tokenHash !== tokenHash,
    );
  }

  async deleteExpiredSessions(now = new Date()) {
    const before = this.sessions.length;
    this.sessions = this.sessions.filter(
      (session) => session.expiresAt.getTime() > now.getTime(),
    );
    return before - this.sessions.length;
  }

  async ping() {
    return true;
  }

  async getTenantMembership(userId: string, tenantId: string) {
    const membership = this.memberships.find(
      (item) =>
        item.userId === userId &&
        item.tenantId === tenantId &&
        item.status === "active",
    );
    if (!membership) {
      return null;
    }
    const tenant = this.tenants.find((item) => item.id === tenantId);
    return {
      tenantId,
      tenantName: tenant?.name ?? "Tenant",
      tenantSlug: tenant?.slug ?? "tenant",
      role: membership.role,
      status: membership.status,
    };
  }

  async listTenantUsers(tenantId: string) {
    return this.memberships
      .filter((membership) => membership.tenantId === tenantId)
      .map((membership) => {
        const user = this.users.find((item) => item.id === membership.userId);
        return {
          id: user?.id ?? membership.userId,
          email: user?.email ?? "missing@example.com",
          name: user?.name ?? "Missing user",
          status: user?.status ?? "disabled",
          role: membership.role,
          membershipStatus: membership.status,
        };
      });
  }

  async upsertTenantUser(
    tenantId: string,
    input: {
      email: string;
      name: string;
      role:
        | "platform_owner"
        | "tenant_owner"
        | "tenant_admin"
        | "operator"
        | "viewer";
      authUserId?: string | null;
      passwordHash?: string | null;
    },
  ) {
    const email = input.email.toLowerCase();
    let user = this.users.find((item) => item.email === email);
    if (!user) {
      user = {
        id: crypto.randomUUID(),
        authUserId: input.authUserId ?? null,
        email,
        name: input.name,
        status: "active",
        passwordHash: input.passwordHash ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.users.push(user);
    } else {
      user.name = input.name || user.name;
      if (input.authUserId) {
        user.authUserId = input.authUserId;
      }
      if (input.passwordHash) {
        user.passwordHash = input.passwordHash;
      }
      user.updatedAt = new Date();
    }

    let membership = this.memberships.find(
      (item) => item.tenantId === tenantId && item.userId === user.id,
    );
    if (!membership) {
      membership = {
        id: crypto.randomUUID(),
        tenantId,
        userId: user.id,
        role: input.role,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.memberships.push(membership);
    } else {
      membership.role = input.role;
      membership.status = "active";
      membership.updatedAt = new Date();
    }

    return { ...user, role: input.role };
  }

  async createTenantInvite(
    tenantId: string,
    input: {
      email: string;
      role:
        | "platform_owner"
        | "tenant_owner"
        | "tenant_admin"
        | "operator"
        | "viewer";
      tokenHash: string;
      expiresAt: Date;
    },
  ) {
    const invite = {
      id: crypto.randomUUID(),
      tenantId,
      email: input.email.toLowerCase(),
      roleName: input.role,
      tokenHash: input.tokenHash,
      status: "pending",
      expiresAt: input.expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.invites.push(invite);
    return invite;
  }

  async listTenantInvites(tenantId: string) {
    return this.invites.filter((invite) => invite.tenantId === tenantId);
  }

  async acceptTenantInvite(input: {
    tokenHash: string;
    name: string;
    passwordHash: string;
  }) {
    const invite = this.invites.find(
      (item) => item.tokenHash === input.tokenHash,
    );
    if (
      !invite ||
      invite.status !== "pending" ||
      invite.expiresAt.getTime() <= Date.now()
    ) {
      return null;
    }
    invite.status = "accepted";
    invite.updatedAt = new Date();
    return this.upsertTenantUser(invite.tenantId, {
      email: invite.email,
      name: input.name,
      role: invite.roleName,
      passwordHash: input.passwordHash,
    });
  }

  async listChannelConnections(tenantId: string) {
    return this.channelConnections.filter(
      (connection) => connection.tenantId === tenantId,
    );
  }

  async upsertChannelConnection(
    tenantId: string,
    input: {
      channel: Channel;
      provider: string;
      externalAccountId?: string | null | undefined;
      status?: "pending" | "connected" | "disabled" | undefined;
      settings?: Record<string, unknown> | undefined;
    },
  ) {
    const existing = this.channelConnections.find(
      (connection) =>
        connection.tenantId === tenantId &&
        connection.channel === input.channel &&
        connection.provider === input.provider,
    );
    if (existing) {
      existing.externalAccountId = input.externalAccountId ?? null;
      existing.status = input.status ?? existing.status;
      existing.settings = input.settings ?? existing.settings;
      existing.updatedAt = new Date();
      return existing;
    }

    const connection = {
      id: crypto.randomUUID(),
      tenantId,
      channel: input.channel,
      provider: input.provider,
      externalAccountId: input.externalAccountId ?? null,
      status: input.status ?? "pending",
      settings: input.settings ?? {},
      updatedAt: new Date(),
    };
    this.channelConnections.push(connection);
    return connection;
  }

  async getTenantByChannelConnection(
    channel: Channel,
    provider: string,
    externalAccountId: string,
  ) {
    const connection = this.channelConnections.find(
      (item) =>
        item.channel === channel &&
        item.provider === provider &&
        item.externalAccountId === externalAccountId &&
        item.status === "connected",
    );
    if (!connection) {
      return null;
    }
    return this.getTenant(connection.tenantId);
  }

  async recordChannelWebhookEvent(input: {
    tenantId?: string | null;
    channel: Channel;
    providerEventId?: string | null;
    eventType: string;
    payload: Record<string, unknown>;
    status?: string;
  }) {
    const existing = input.providerEventId
      ? this.webhookEvents.find(
          (event) =>
            event.channel === input.channel &&
            event.providerEventId === input.providerEventId,
        )
      : undefined;
    if (existing) {
      return { event: existing, duplicate: true };
    }

    const event = {
      id: crypto.randomUUID(),
      tenantId: input.tenantId ?? null,
      channel: input.channel,
      providerEventId: input.providerEventId ?? null,
      eventType: input.eventType,
      payload: input.payload,
      status: input.status ?? "received",
      error: null,
      processedAt: null,
      createdAt: new Date(),
    };
    this.webhookEvents.push(event);
    return { event, duplicate: false };
  }

  async markChannelWebhookEventProcessed(
    eventId: string,
    status = "processed",
  ) {
    const event = this.webhookEvents.find((item) => item.id === eventId);
    if (event) {
      event.status = status;
      event.error = null;
      event.processedAt = new Date();
    }
  }

  async markChannelWebhookEventFailed(eventId: string, error: string) {
    const event = this.webhookEvents.find((item) => item.id === eventId);
    if (event) {
      event.status = "failed";
      event.error = error;
      event.processedAt = new Date();
    }
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
    externalUserId?: string | undefined;
    locale?: string | undefined;
    contact?: {
      displayName?: string | null | undefined;
      email?: string | null | undefined;
      phone?: string | null | undefined;
      company?: string | null | undefined;
      metadata?: Record<string, unknown> | undefined;
    };
  }) {
    const contact = this.upsertContact(input.tenantId, {
      channel: input.channel,
      externalUserId: input.externalUserId,
      ...(input.contact ?? {}),
    });
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
      contactId: contact?.id ?? null,
      externalUserId: input.externalUserId ?? null,
      locale: input.locale ?? "en",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.conversations.push(conversation);
    return conversation;
  }

  async enrichConversationContact(input: {
    tenantId: string;
    conversationId: string;
    channel?: Channel;
    externalUserId?: string | null | undefined;
    contact: {
      displayName?: string | null | undefined;
      email?: string | null | undefined;
      phone?: string | null | undefined;
      company?: string | null | undefined;
      metadata?: Record<string, unknown> | undefined;
    };
  }) {
    const conversation = this.conversations.find(
      (item) =>
        item.tenantId === input.tenantId && item.id === input.conversationId,
    );
    if (!conversation) {
      throw new Error("Conversation not found.");
    }
    const contact = this.upsertContact(input.tenantId, {
      channel: input.channel ?? conversation.channel,
      externalUserId: input.externalUserId ?? conversation.externalUserId,
      ...input.contact,
    });
    if (contact) {
      conversation.contactId = contact.id;
      conversation.updatedAt = new Date();
    }
    return contact;
  }

  async addMessage(input: Record<string, unknown>) {
    const message = {
      id: crypto.randomUUID(),
      createdAt: new Date(),
      ...input,
    };
    this.messages.push(message);
    const conversation = this.conversations.find(
      (item) => item.id === input.conversationId,
    );
    if (conversation) {
      conversation.updatedAt = new Date();
    }
    return message;
  }

  async listConversations(tenantId: string) {
    return this.conversations.filter(
      (conversation) => conversation.tenantId === tenantId,
    );
  }

  async listUnifiedInbox(tenantId: string) {
    return this.conversations
      .filter((conversation) => conversation.tenantId === tenantId)
      .map((conversation) => {
        const contact =
          this.contacts.find((item) => item.id === conversation.contactId) ??
          null;
        const conversationMessages = this.messages.filter(
          (message) => message.conversationId === conversation.id,
        );
        const lastMessage =
          conversationMessages[conversationMessages.length - 1] ?? null;
        return {
          ...conversation,
          contact,
          lastMessage,
          messageCount: conversationMessages.length,
          openHandoffs: this.handoffs.filter(
            (handoff) =>
              handoff.conversationId === conversation.id &&
              ["open", "in_progress"].includes(handoff.status),
          ),
          nextAction: "Monitor",
        };
      });
  }

  async listContacts(tenantId: string) {
    return this.contacts.filter((contact) => contact.tenantId === tenantId);
  }

  async listConversationMessages(tenantId: string, conversationId: string) {
    return this.messages.filter(
      (message) =>
        message.tenantId === tenantId &&
        message.conversationId === conversationId,
    );
  }

  auditEvents: Array<{
    tenantId: string;
    action: string;
    actorType: string;
    actorId: string | null;
  }> = [];

  async recordAuditEvent(
    tenantId: string,
    entry: {
      action: string;
      targetType: string;
      targetId: string;
      actorType: string;
      actorId?: string | null;
      metadata?: Record<string, unknown>;
    },
  ) {
    this.auditEvents.push({
      tenantId,
      action: entry.action,
      actorType: entry.actorType,
      actorId: entry.actorId ?? null,
    });
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
    const metadata =
      input.reason === "lead_capture" || input.reason === "readiness_assessment"
        ? { pipelineStage: "new", ...(input.metadata ?? {}) }
        : (input.metadata ?? {});

    const handoff = {
      ...input,
      id: crypto.randomUUID(),
      status: "open",
      requesterMessage: input.message,
      metadata,
      createdAt: new Date(),
    };
    this.handoffs.push(handoff);
    return handoff;
  }

  async captureWebsiteLead(input: {
    tenantId: string;
    channel: Channel;
    locale?: string | undefined;
    publicConversationId?: string | undefined;
    externalUserId?: string | undefined;
    contact: {
      displayName?: string | null | undefined;
      email?: string | null | undefined;
      phone?: string | null | undefined;
      company?: string | null | undefined;
      metadata?: Record<string, unknown> | undefined;
    };
    message: string;
    trace?: Record<string, unknown> | undefined;
    reason: string;
    handoffMetadata?: Record<string, unknown> | undefined;
    idempotencyKey?: string | null | undefined;
  }) {
    const conversationInput: Parameters<
      MemoryPlatformStore["findOrCreateConversation"]
    >[0] = {
      tenantId: input.tenantId,
      channel: input.channel,
    };
    if (input.locale !== undefined) {
      conversationInput.locale = input.locale;
    }
    if (input.publicConversationId !== undefined) {
      conversationInput.publicConversationId = input.publicConversationId;
    }
    if (input.externalUserId !== undefined) {
      conversationInput.externalUserId = input.externalUserId;
    }

    const conversation = await this.findOrCreateConversation(conversationInput);

    await this.enrichConversationContact({
      tenantId: input.tenantId,
      conversationId: conversation.id,
      channel: input.channel,
      externalUserId: input.externalUserId ?? null,
      contact: input.contact,
    });

    await this.addMessage({
      tenantId: input.tenantId,
      conversationId: conversation.id,
      channel: input.channel,
      direction: "inbound",
      role: "user",
      content: input.message,
      trace: input.trace ?? {},
    });

    const key = input.idempotencyKey ?? null;
    const existing = key
      ? this.handoffs.find(
          (handoff) =>
            handoff.tenantId === input.tenantId &&
            handoff.conversationId === conversation.id &&
            (handoff.metadata as Record<string, unknown> | undefined)
              ?.idempotencyKey === key,
        )
      : undefined;
    if (existing) {
      return { conversation, handoff: existing };
    }

    const handoff = await this.createHandoff({
      tenantId: input.tenantId,
      conversationId: conversation.id,
      channel: input.channel,
      reason: input.reason,
      message: input.message,
      ...(input.handoffMetadata ? { metadata: input.handoffMetadata } : {}),
    });
    if (key) {
      handoff.metadata = { ...(handoff.metadata ?? {}), idempotencyKey: key };
    }
    return { conversation, handoff };
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
      contacts: this.contacts.filter((contact) => contact.tenantId === tenantId)
        .length,
      usageByStatus: this.usageEvents.filter(
        (event) => event.tenantId === tenantId,
      ),
    };
  }

  async recordMessageDelivery(input: Record<string, unknown>) {
    const delivery = {
      id: crypto.randomUUID(),
      createdAt: new Date(),
      ...input,
    };
    this.deliveries.push(delivery);
    return delivery;
  }

  async listWhatsappTemplates(tenantId: string) {
    return this.whatsappTemplates.filter(
      (template) => template.tenantId === tenantId,
    );
  }

  async upsertWhatsappTemplate(
    tenantId: string,
    input: {
      name: string;
      language?: string | undefined;
      category?: string | undefined;
      status?: string | undefined;
      body: string;
      variables?: string[] | undefined;
    },
  ) {
    const language = input.language ?? "de";
    const name = input.name.toLowerCase().replace(/[^a-z0-9_]+/g, "_");
    const existing = this.whatsappTemplates.find(
      (template) =>
        template.tenantId === tenantId &&
        template.name === name &&
        template.language === language,
    );
    if (existing) {
      Object.assign(existing, input, { name, language, updatedAt: new Date() });
      return existing;
    }
    const template = {
      id: crypto.randomUUID(),
      tenantId,
      name,
      language,
      category: input.category ?? "utility",
      status: input.status ?? "draft",
      body: input.body,
      variables: input.variables ?? [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.whatsappTemplates.push(template);
    return template;
  }

  async getWhatsappCompliance(tenantId: string) {
    const templates = await this.listWhatsappTemplates(tenantId);
    const lastInbound = [...this.messages]
      .reverse()
      .find(
        (message) =>
          message.tenantId === tenantId &&
          message.channel === "whatsapp" &&
          message.direction === "inbound",
      );
    const lastInboundAt =
      lastInbound?.createdAt instanceof Date ? lastInbound.createdAt : null;
    const windowClosesAt = lastInboundAt
      ? new Date(lastInboundAt.getTime() + 24 * 60 * 60 * 1000)
      : null;
    return {
      lastInboundAt,
      windowClosesAt,
      canUseFreeformReply: Boolean(
        windowClosesAt && windowClosesAt.getTime() > Date.now(),
      ),
      templates: {
        total: templates.length,
        approved: templates.filter((template) => template.status === "approved")
          .length,
        draft: templates.filter((template) => template.status === "draft")
          .length,
        needsAttention: 0,
      },
      recentDeliveries: this.deliveries.filter(
        (delivery) =>
          delivery.tenantId === tenantId && delivery.channel === "whatsapp",
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

  private upsertContact(
    tenantId: string,
    input: {
      channel: Channel;
      externalUserId?: string | null | undefined;
      displayName?: string | null | undefined;
      email?: string | null | undefined;
      phone?: string | null | undefined;
      company?: string | null | undefined;
      metadata?: Record<string, unknown> | undefined;
    },
  ) {
    if (
      !input.externalUserId &&
      !input.displayName &&
      !input.email &&
      !input.phone &&
      !input.company
    ) {
      return null;
    }
    const email = input.email?.toLowerCase() ?? null;
    const phone = input.phone ?? null;
    const existing = this.contacts.find(
      (contact) =>
        contact.tenantId === tenantId &&
        ((email && contact.email === email) ||
          (phone && contact.phone === phone) ||
          (input.externalUserId &&
            Object.values(contact.identifiers).some((values) =>
              values.includes(input.externalUserId ?? ""),
            ))),
    );
    const key = `${input.channel}Ids`;
    if (existing) {
      existing.displayName = input.displayName ?? existing.displayName ?? null;
      existing.email = email ?? existing.email ?? null;
      existing.phone = phone ?? existing.phone ?? null;
      existing.company = input.company ?? existing.company ?? null;
      existing.identifiers[key] = Array.from(
        new Set([
          ...(existing.identifiers[key] ?? []),
          ...(input.externalUserId ? [input.externalUserId] : []),
        ]),
      );
      existing.metadata = { ...existing.metadata, ...(input.metadata ?? {}) };
      existing.updatedAt = new Date();
      return existing;
    }
    const contact = {
      id: crypto.randomUUID(),
      tenantId,
      displayName:
        input.displayName ?? input.company ?? email ?? phone ?? "New contact",
      email,
      phone,
      company: input.company ?? null,
      identifiers: input.externalUserId
        ? { [key]: [input.externalUserId] }
        : {},
      metadata: input.metadata ?? {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.contacts.push(contact);
    return contact;
  }
}

/**
 * Bearer token recognised by {@link memberSupabaseAuth}. Content/PII routes
 * disable the platform bypass, so tests that read tenant personal data must
 * authenticate as a real tenant member rather than with the admin token.
 */
const MEMBER_BEARER = "member-bearer-token";

function memberSupabaseAuth(authUserId: string) {
  return {
    async verifyAccessToken(token: string) {
      return token === MEMBER_BEARER
        ? {
            authUserId,
            email: "member@example.com",
            name: "Member User",
            expiresAt: new Date(Date.now() + 60_000),
          }
        : null;
    },
    async createUser() {
      throw new Error("not used");
    },
    async createInviteLink() {
      throw new Error("not used");
    },
  };
}

/**
 * Build a server plus a genuine tenant-member identity for the given tenant.
 * Returns headers that authenticate as that member via the Supabase bearer
 * path, which carries a real membership and therefore passes the personal-data
 * route guards.
 */
async function buildServerWithMember(
  store: MemoryPlatformStore,
  tenantId: string,
  role:
    | "viewer"
    | "operator"
    | "tenant_admin"
    | "tenant_owner" = "tenant_owner",
) {
  const authUserId = crypto.randomUUID();
  const app = await buildServer({
    store,
    adminToken: "test-token",
    allowedOrigins: ["*"],
    supabaseAuth: memberSupabaseAuth(authUserId),
  });
  await store.upsertTenantUser(tenantId, {
    email: "member@example.com",
    name: "Member User",
    role,
    authUserId,
  });
  return {
    app,
    authUserId,
    memberHeaders: { authorization: `Bearer ${MEMBER_BEARER}` },
  };
}

describe("parseTrustProxy", () => {
  it("defaults to trusting nobody when unset or falsy", () => {
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy("")).toBe(false);
    expect(parseTrustProxy("  ")).toBe(false);
    expect(parseTrustProxy("false")).toBe(false);
  });

  it("parses a hop count and passes CIDR allowlists through", () => {
    expect(parseTrustProxy("1")).toBe(1);
    expect(parseTrustProxy("2")).toBe(2);
    expect(parseTrustProxy("true")).toBe(true);
    expect(parseTrustProxy("10.0.0.0/8")).toBe("10.0.0.0/8");
  });
});

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

  it("lets project users log in and access only their assigned tenant", async () => {
    const store = new MemoryPlatformStore();
    const app = await buildServer({
      store,
      adminToken: "test-token",
      allowedOrigins: ["*"],
    });
    const assignedTenant = await store.createTenant({
      name: "Assigned",
      slug: "assigned",
    });
    const otherTenant = await store.createTenant({
      name: "Other",
      slug: "other",
    });

    const createUserResponse = await app.inject({
      method: "POST",
      url: `/admin/tenants/${assignedTenant.id}/users`,
      headers: { "x-admin-token": "test-token" },
      payload: {
        email: "owner@example.com",
        name: "Project Owner",
        role: "tenant_owner",
        password: "secure-password",
      },
    });
    expect(createUserResponse.statusCode).toBe(201);

    const loginResponse = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "owner@example.com",
        password: "secure-password",
      },
    });
    expect(loginResponse.statusCode).toBe(200);
    expect(loginResponse.json()).toMatchObject({
      authType: "user_session",
      user: {
        email: "owner@example.com",
        role: "tenant_owner",
      },
    });
    const cookie = loginResponse.headers["set-cookie"];
    expect(cookie).toBeTruthy();

    const tenantsResponse = await app.inject({
      method: "GET",
      url: "/admin/tenants",
      headers: { cookie: String(cookie) },
    });
    expect(tenantsResponse.statusCode).toBe(200);
    expect(tenantsResponse.json<Array<{ id: string }>>()).toEqual([
      expect.objectContaining({ id: assignedTenant.id }),
    ]);

    const allowedResponse = await app.inject({
      method: "GET",
      url: `/admin/tenants/${assignedTenant.id}/knowledge`,
      headers: { cookie: String(cookie) },
    });
    expect(allowedResponse.statusCode).toBe(200);

    const blockedResponse = await app.inject({
      method: "GET",
      url: `/admin/tenants/${otherTenant.id}/knowledge`,
      headers: { cookie: String(cookie) },
    });
    expect(blockedResponse.statusCode).toBe(403);
    await app.close();
  });

  it("accepts Supabase bearer tokens and reuses tenant memberships", async () => {
    const store = new MemoryPlatformStore();
    const authUserId = crypto.randomUUID();
    const app = await buildServer({
      store,
      adminToken: "test-token",
      allowedOrigins: ["*"],
      supabaseAuth: {
        async verifyAccessToken(token) {
          return token === "valid-supabase-token"
            ? {
                authUserId,
                email: "owner@example.com",
                name: "Project Owner",
                expiresAt: new Date(Date.now() + 60_000),
              }
            : null;
        },
        async createUser() {
          throw new Error("not used");
        },
        async createInviteLink() {
          throw new Error("not used");
        },
      },
    });
    const tenant = await store.createTenant({
      name: "Assigned",
      slug: "assigned",
    });
    await store.upsertTenantUser(tenant.id, {
      email: "owner@example.com",
      name: "Project Owner",
      role: "tenant_owner",
      authUserId,
    });

    const sessionResponse = await app.inject({
      method: "GET",
      url: "/admin/session",
      headers: { authorization: "Bearer valid-supabase-token" },
    });
    expect(sessionResponse.statusCode).toBe(200);
    expect(sessionResponse.json()).toMatchObject({
      authType: "user_session",
      user: {
        email: "owner@example.com",
        role: "tenant_owner",
      },
    });

    const tenantResponse = await app.inject({
      method: "GET",
      url: `/admin/tenants/${tenant.id}/knowledge`,
      headers: { authorization: "Bearer valid-supabase-token" },
    });
    expect(tenantResponse.statusCode).toBe(200);

    const rejectedResponse = await app.inject({
      method: "GET",
      url: "/admin/session",
      headers: { authorization: "Bearer invalid-supabase-token" },
    });
    expect(rejectedResponse.statusCode).toBe(401);
    await app.close();
  });

  it("creates and accepts project invite links", async () => {
    const store = new MemoryPlatformStore();
    const app = await buildServer({
      store,
      adminToken: "test-token",
      allowedOrigins: ["*"],
      adminPublicUrl: "https://admin.example.com",
    });
    const tenant = await store.createTenant({
      name: "Tenant One",
      slug: "tenant-one",
    });

    const inviteResponse = await app.inject({
      method: "POST",
      url: `/admin/tenants/${tenant.id}/invites`,
      headers: { "x-admin-token": "test-token" },
      payload: {
        email: "operator@example.com",
        role: "operator",
      },
    });
    expect(inviteResponse.statusCode).toBe(201);
    const invite = inviteResponse.json<{ token: string; acceptUrl: string }>();
    expect(invite.acceptUrl).toContain(encodeURIComponent(invite.token));

    const acceptResponse = await app.inject({
      method: "POST",
      url: "/auth/invites/accept",
      payload: {
        token: invite.token,
        name: "Operator User",
        password: "secure-password",
      },
    });
    expect(acceptResponse.statusCode).toBe(200);
    expect(acceptResponse.json()).toMatchObject({
      authType: "user_session",
      user: {
        email: "operator@example.com",
        role: "operator",
      },
    });
    await app.close();
  });

  it("prevents tenant admins from escalating tenant or platform roles", async () => {
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

    const createAdminResponse = await app.inject({
      method: "POST",
      url: `/admin/tenants/${tenant.id}/users`,
      headers: { "x-admin-token": "test-token" },
      payload: {
        email: "tenant-admin@example.com",
        name: "Tenant Admin",
        role: "tenant_admin",
        password: "secure-password",
      },
    });
    expect(createAdminResponse.statusCode).toBe(201);

    const loginResponse = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "tenant-admin@example.com",
        password: "secure-password",
      },
    });
    expect(loginResponse.statusCode).toBe(200);
    const cookie = String(loginResponse.headers["set-cookie"]);

    const platformOwnerResponse = await app.inject({
      method: "POST",
      url: `/admin/tenants/${tenant.id}/users`,
      headers: { cookie },
      payload: {
        email: "platform-owner@example.com",
        name: "Platform Owner",
        role: "platform_owner",
        password: "secure-password",
      },
    });
    expect(platformOwnerResponse.statusCode).toBe(400);

    const tenantOwnerResponse = await app.inject({
      method: "POST",
      url: `/admin/tenants/${tenant.id}/users`,
      headers: { cookie },
      payload: {
        email: "tenant-owner@example.com",
        name: "Tenant Owner",
        role: "tenant_owner",
        password: "secure-password",
      },
    });
    expect(tenantOwnerResponse.statusCode).toBe(403);

    const operatorResponse = await app.inject({
      method: "POST",
      url: `/admin/tenants/${tenant.id}/users`,
      headers: { cookie },
      payload: {
        email: "operator@example.com",
        name: "Operator",
        role: "operator",
        password: "secure-password",
      },
    });
    expect(operatorResponse.statusCode).toBe(201);

    const tenantOwnerInviteResponse = await app.inject({
      method: "POST",
      url: `/admin/tenants/${tenant.id}/invites`,
      headers: { cookie },
      payload: {
        email: "invited-owner@example.com",
        role: "tenant_owner",
      },
    });
    expect(tenantOwnerInviteResponse.statusCode).toBe(403);

    await app.close();
  });

  it("allows viewers to read tenant data but blocks tenant mutations", async () => {
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

    const createViewerResponse = await app.inject({
      method: "POST",
      url: `/admin/tenants/${tenant.id}/users`,
      headers: { "x-admin-token": "test-token" },
      payload: {
        email: "viewer@example.com",
        name: "Viewer",
        role: "viewer",
        password: "secure-password",
      },
    });
    expect(createViewerResponse.statusCode).toBe(201);

    const loginResponse = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "viewer@example.com",
        password: "secure-password",
      },
    });
    expect(loginResponse.statusCode).toBe(200);
    const cookie = String(loginResponse.headers["set-cookie"]);

    const readResponse = await app.inject({
      method: "GET",
      url: `/admin/tenants/${tenant.id}/knowledge`,
      headers: { cookie },
    });
    expect(readResponse.statusCode).toBe(200);

    const writeResponse = await app.inject({
      method: "POST",
      url: `/admin/tenants/${tenant.id}/knowledge/faqs`,
      headers: { cookie },
      payload: {
        question: "Can I edit?",
        answer: "No.",
      },
    });
    expect(writeResponse.statusCode).toBe(403);

    const settingsResponse = await app.inject({
      method: "PATCH",
      url: `/admin/tenants/${tenant.id}`,
      headers: { cookie },
      payload: {
        defaultLocale: "de",
      },
    });
    expect(settingsResponse.statusCode).toBe(403);

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
        widgetUrl:
          "https://assaddar-widget-production.up.railway.app/widget.js",
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
    const tenant = await store.createTenant({
      name: "Tenant One",
      slug: "tenant-one",
    });
    const { app, memberHeaders } = await buildServerWithMember(
      store,
      tenant.id,
    );

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
        pipelineStage: "qualified",
        automationReason: "lead_details",
      },
    });

    const handoff = store.handoffs[0];
    if (!handoff) {
      throw new Error("Expected a handoff.");
    }
    const updateResponse = await app.inject({
      method: "PATCH",
      url: `/admin/tenants/${tenant.id}/handoffs/${handoff.id}`,
      headers: memberHeaders,
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
      adminPublicUrl: "https://admin.example.com",
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
    expect(sentEmails).toHaveLength(2);
    expect(sentEmails[0]).toMatchObject({
      to: "owner@example.com",
      subject: "Website lead - Tenant One",
    });
    expect(sentEmails[0]?.text).toContain("ada@example.com");
    expect(sentEmails[0]?.text).toContain("https://assad-dar.de/de");
    expect(sentEmails[0]?.text).toContain(
      `https://admin.example.com/?tenantId=${tenant.id}&tab=leads&handoffId=${store.handoffs[0]?.id}`,
    );
    expect(sentEmails[1]).toMatchObject({
      to: "ada@example.com",
      subject: "AI consultation request received - Tenant One",
    });
    expect(store.handoffs[0]?.metadata).toMatchObject({
      pipelineStage: "qualified",
      automationReason: "lead_details",
    });
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
        pipelineStage: "qualified",
        automationReason: "readiness_score",
      },
    });
    await app.close();
  });

  it("can send a weekly owner report from admin automation", async () => {
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

    await app.inject({
      method: "POST",
      url: "/widget/leads",
      payload: {
        assistantId: tenant.publicId,
        visitorId: "visitor-one",
        fields: {
          name: "Ada",
          email: "ada@example.com",
          company: "Example GmbH",
          budget: "10k",
        },
      },
    });

    const response = await app.inject({
      method: "POST",
      url: `/admin/tenants/${tenant.id}/weekly-report`,
      headers: { "x-admin-token": "test-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ sent: boolean }>().sent).toBe(true);
    expect(sentEmails.at(-1)).toMatchObject({
      to: "owner@example.com",
      subject: "Weekly AI assistant report - Tenant One",
    });
    expect(sentEmails.at(-1)?.text).toContain("Total leads: 1");
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
        eventType: "intake_mode_selected",
        metadata: {
          mode: "readiness",
        },
      },
    });

    expect(response.statusCode).toBe(202);
    expect(store.usageEvents[0]).toMatchObject({
      tenantId: tenant.id,
      eventType: "intake_mode_selected",
      credits: 0,
      metadata: {
        visitorId: "visitor-one",
        mode: "readiness",
      },
    });
    await app.close();
  });

  it("lists and saves channel connections for admin setup", async () => {
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

    const listResponse = await app.inject({
      method: "GET",
      url: `/admin/tenants/${tenant.id}/channel-connections`,
      headers: { "x-admin-token": "test-token" },
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json<Array<{ channel: string }>>()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ channel: "telephone" }),
        expect.objectContaining({ channel: "whatsapp" }),
      ]),
    );

    const saveResponse = await app.inject({
      method: "PUT",
      url: `/admin/tenants/${tenant.id}/channel-connections/telephone`,
      headers: { "x-admin-token": "test-token" },
      payload: {
        provider: "twilio",
        externalAccountId: "+49123456789",
        status: "connected",
      },
    });
    expect(saveResponse.statusCode).toBe(200);
    expect(saveResponse.json()).toMatchObject({
      channel: "telephone",
      provider: "twilio",
      externalAccountId: "+49123456789",
      status: "connected",
    });
    await app.close();
  });

  it("returns a clear error when Twilio number automation credentials are missing", async () => {
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
      method: "GET",
      url: `/admin/tenants/${tenant.id}/telephone/twilio/search`,
      headers: { "x-admin-token": "test-token" },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: "Twilio credentials are not configured.",
    });
    await app.close();
  });

  it("searches Twilio inventory for available AI phone numbers", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (
        url.includes("pricing.twilio.com") ||
        url.includes("/v1/PhoneNumbers")
      ) {
        return new Response(
          JSON.stringify({
            price_unit: "EUR",
            phone_number_prices: [
              {
                number_type: "local",
                current_price: "1.50",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          available_phone_numbers: [
            {
              phone_number: "+49301234567",
              friendly_name: "+49 30 1234567",
              locality: "Berlin",
              region: "Berlin",
              iso_country: "DE",
              capabilities: { voice: true, SMS: false, MMS: false },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
    const store = new MemoryPlatformStore();
    const app = await buildServer({
      store,
      adminToken: "test-token",
      allowedOrigins: ["*"],
      twilioAccountSid: "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      twilioAuthToken: "auth-token",
      voicePublicUrl: "https://voice.example.com",
    });
    const tenant = await store.createTenant({
      name: "Tenant One",
      slug: "tenant-one",
    });

    const response = await app.inject({
      method: "GET",
      url: `/admin/tenants/${tenant.id}/telephone/twilio/search?country=DE&numberType=local&locality=Berlin`,
      headers: { "x-admin-token": "test-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      webhookUrl: `https://voice.example.com/twilio/voice?assistantId=${tenant.publicId}`,
      numbers: [
        {
          phoneNumber: "+49301234567",
          monthlyPrice: "1.50",
          currency: "EUR",
        },
      ],
    });
    await app.close();
  });

  it("purchases a Twilio phone number and connects it to telephone AI", async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          sid: "PNaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          phone_number: "+49301234567",
          friendly_name: "Tenant One AI phone",
          iso_country: "DE",
          capabilities: { voice: true, SMS: false, MMS: false },
          voice_url:
            "https://voice.example.com/twilio/voice?assistantId=asst_test",
          voice_method: "POST",
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
    const store = new MemoryPlatformStore();
    const app = await buildServer({
      store,
      adminToken: "test-token",
      allowedOrigins: ["*"],
      twilioAccountSid: "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      twilioAuthToken: "auth-token",
      voicePublicUrl: "https://voice.example.com",
    });
    const tenant = await store.createTenant({
      name: "Tenant One",
      slug: "tenant-one",
    });

    const response = await app.inject({
      method: "POST",
      url: `/admin/tenants/${tenant.id}/telephone/twilio/purchase`,
      headers: { "x-admin-token": "test-token" },
      payload: {
        phoneNumber: "+49301234567",
        numberType: "local",
        friendlyName: "Tenant One AI phone",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      number: {
        sid: "PNaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        phoneNumber: "+49301234567",
      },
    });
    expect(store.channelConnections[0]).toMatchObject({
      channel: "telephone",
      provider: "twilio",
      externalAccountId: "+49301234567",
      status: "connected",
      settings: {
        mode: "purchased_twilio",
        providerNumberSid: "PNaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
    });
    await app.close();
  });

  it("connects an existing Twilio number by phone number", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("IncomingPhoneNumbers.json")) {
        return new Response(
          JSON.stringify({
            incoming_phone_numbers: [
              {
                sid: "PNbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                phone_number: "+49307654321",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          sid: "PNbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          phone_number: "+49307654321",
          capabilities: { voice: true, SMS: false, MMS: false },
          voice_url:
            "https://voice.example.com/twilio/voice?assistantId=asst_test",
          voice_method: "POST",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
    const store = new MemoryPlatformStore();
    const app = await buildServer({
      store,
      adminToken: "test-token",
      allowedOrigins: ["*"],
      twilioAccountSid: "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      twilioAuthToken: "auth-token",
      voicePublicUrl: "https://voice.example.com",
    });
    const tenant = await store.createTenant({
      name: "Tenant One",
      slug: "tenant-one",
    });

    const response = await app.inject({
      method: "POST",
      url: `/admin/tenants/${tenant.id}/telephone/twilio/connect-existing`,
      headers: { "x-admin-token": "test-token" },
      payload: {
        phoneNumber: "+49307654321",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(store.channelConnections[0]).toMatchObject({
      channel: "telephone",
      externalAccountId: "+49307654321",
      status: "connected",
      settings: {
        mode: "existing_twilio",
        providerNumberSid: "PNbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
    });
    await app.close();
  });

  it("saves provider number, forwarding, and SIP trunk telephone setup modes", async () => {
    const store = new MemoryPlatformStore();
    const app = await buildServer({
      store,
      adminToken: "test-token",
      allowedOrigins: ["*"],
      voicePublicUrl: "http://127.0.0.1:1",
    });
    const tenant = await store.createTenant({
      name: "Tenant One",
      slug: "tenant-one",
    });

    const newNumberResponse = await app.inject({
      method: "POST",
      url: `/admin/tenants/${tenant.id}/telephone/new-number`,
      headers: { "x-admin-token": "test-token" },
      payload: {
        provider: "easybell",
        requestedCountry: "DE",
        numberType: "local",
        areaCode: "030",
        locality: "Berlin",
        orderedNumber: "+49303333333",
        sipRegistrar: "sip.easybell.de",
        sipUsername: "tenant-one",
        sipConfigured: true,
      },
    });

    expect(newNumberResponse.statusCode).toBe(201);
    expect(newNumberResponse.json()).toMatchObject({
      sipTarget: expect.stringContaining("asst_"),
      instructions: expect.arrayContaining([
        expect.stringContaining("easybell"),
      ]),
    });
    expect(
      store.channelConnections.find(
        (connection) => connection.provider === "easybell",
      ),
    ).toMatchObject({
      externalAccountId: "+49303333333",
      status: "connected",
      settings: {
        mode: "new_number_provider",
        setupType: "new_number",
        provider: "easybell",
      },
    });

    const forwardingResponse = await app.inject({
      method: "POST",
      url: `/admin/tenants/${tenant.id}/telephone/carrier-forwarding`,
      headers: { "x-admin-token": "test-token" },
      payload: {
        provider: "sipgate",
        existingNumber: "+49301111111",
        aiNumber: "+49302222222",
        carrierName: "Telekom",
      },
    });

    expect(forwardingResponse.statusCode).toBe(200);
    expect(forwardingResponse.json()).toMatchObject({
      instructions: expect.arrayContaining([
        expect.stringContaining("+49302222222"),
      ]),
    });
    expect(
      store.channelConnections.find(
        (connection) => connection.provider === "sipgate",
      ),
    ).toMatchObject({
      externalAccountId: "+49301111111",
      status: "pending",
      settings: {
        mode: "carrier_forwarding",
        provider: "sipgate",
      },
    });

    const sipResponse = await app.inject({
      method: "POST",
      url: `/admin/tenants/${tenant.id}/telephone/sip-byoc`,
      headers: { "x-admin-token": "test-token" },
      payload: {
        provider: "custom_sip",
        carrierName: "PBX",
        sipDomain: "pbx.example.com",
        sipRegistrar: "sip.example.com",
        sipUsername: "tenant-one",
        publicNumber: "+49304444444",
        sipConfigured: true,
      },
    });

    expect(sipResponse.statusCode).toBe(200);
    expect(
      store.channelConnections.find(
        (connection) => connection.provider === "custom_sip",
      ),
    ).toMatchObject({
      externalAccountId: "+49304444444",
      status: "connected",
      settings: {
        mode: "sip_byoc",
        setupType: "sip_trunk",
        provider: "custom_sip",
      },
    });

    const settingsResponse = await app.inject({
      method: "PUT",
      url: `/admin/tenants/${tenant.id}/telephone/settings`,
      headers: { "x-admin-token": "test-token" },
      payload: {
        provider: "easybell",
        setupChecklist: {
          numberOrdered: true,
          sipConfigured: true,
          testCallCompleted: true,
          fallbackSet: true,
          disclosureConfirmed: true,
        },
        businessHours: {
          mode: "business_hours",
          timezone: "Europe/Berlin",
          hours: "Mo-Fr 09:00-18:00",
          afterHoursAction: "callback",
        },
        handoffRules: {
          lowConfidence: true,
          urgentKeywords: true,
          officeHoursTransfer: false,
          repeatedFailure: true,
          askBeforeTransfer: true,
        },
        gdpr: {
          disclosureText: "AI disclosure",
          recordingEnabled: false,
          storeTranscripts: true,
          transcriptRetentionDays: 90,
        },
        voiceQuality: {
          language: "de-DE",
          speakingStyle: "professional",
          maxAnswerLength: 450,
          askBeforeTransfer: true,
        },
        testCall: {
          status: "passed",
          phoneNumber: "+491701234567",
          notes: "Call answered.",
        },
      },
    });

    expect(settingsResponse.statusCode).toBe(200);
    expect(settingsResponse.json()).toMatchObject({
      warnings: [],
    });
    expect(
      store.channelConnections.find(
        (connection) => connection.provider === "easybell",
      ),
    ).toMatchObject({
      settings: {
        businessHours: {
          mode: "business_hours",
        },
        gdpr: {
          transcriptRetentionDays: 90,
        },
        testCall: {
          status: "passed",
        },
      },
    });

    const edgeResponse = await app.inject({
      method: "GET",
      url: `/admin/tenants/${tenant.id}/telephone/voice-edge-status`,
      headers: { "x-admin-token": "test-token" },
    });
    expect(edgeResponse.statusCode).toBe(200);
    expect(edgeResponse.json()).toMatchObject({
      status: "offline",
      url: "http://127.0.0.1:1/health",
    });
    await app.close();
  });

  it("routes WhatsApp webhooks through a mapped channel connection", async () => {
    const store = new MemoryPlatformStore();
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    const app = await buildServer({
      store,
      adminToken: "test-token",
      allowedOrigins: ["*"],
      whatsappAccessToken: "whatsapp-token",
      metaGraphApiVersion: "v25.0",
    });
    const tenant = await store.createTenant({
      name: "Tenant One",
      slug: "tenant-one",
    });
    await store.addFaq(tenant.id, {
      question: "What do you do?",
      answer: "We implement practical AI automation.",
      tags: ["faq"],
    });
    await store.upsertChannelConnection(tenant.id, {
      channel: "whatsapp",
      provider: "meta-whatsapp-cloud",
      externalAccountId: "phone-number-1",
      status: "connected",
    });

    const response = await app.inject({
      method: "POST",
      url: "/webhooks/meta/whatsapp",
      payload: {
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: {
                    phone_number_id: "phone-number-1",
                  },
                  messages: [
                    {
                      id: "wamid.inbound.1",
                      from: "491701234567",
                      text: {
                        body: "What do you do?",
                      },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ routed: number }>().routed).toBe(1);
    expect(store.conversations[0]).toMatchObject({
      tenantId: tenant.id,
      channel: "whatsapp",
    });
    expect(store.messages).toHaveLength(2);
    expect(store.messages[1]?.trace).toMatchObject({
      delivery: {
        status: "sent",
        providerMessageId: "wamid.1",
      },
    });
    expect(store.deliveries[0]).toMatchObject({
      messageId: store.messages[1]?.id,
      status: "sent",
      providerMessageId: "wamid.1",
    });
    expect(store.webhookEvents[0]).toMatchObject({
      providerEventId: "wamid.inbound.1",
      status: "processed",
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://graph.facebook.com/v25.0/phone-number-1/messages",
      expect.objectContaining({
        method: "POST",
      }),
    );
    await app.close();
  });

  it("deduplicates provider webhook events before creating messages or replies", async () => {
    const store = new MemoryPlatformStore();
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    const app = await buildServer({
      store,
      adminToken: "test-token",
      allowedOrigins: ["*"],
      whatsappAccessToken: "whatsapp-token",
    });
    const tenant = await store.createTenant({
      name: "Tenant One",
      slug: "tenant-one",
    });
    await store.addFaq(tenant.id, {
      question: "What do you do?",
      answer: "We implement practical AI automation.",
    });
    await store.upsertChannelConnection(tenant.id, {
      channel: "whatsapp",
      provider: "meta-whatsapp-cloud",
      externalAccountId: "phone-number-1",
      status: "connected",
    });

    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "phone-number-1" },
                messages: [
                  {
                    id: "wamid.duplicate",
                    from: "491701234567",
                    text: { body: "What do you do?" },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const first = await app.inject({
      method: "POST",
      url: "/webhooks/meta/whatsapp",
      payload,
    });
    const second = await app.inject({
      method: "POST",
      url: "/webhooks/meta/whatsapp",
      payload,
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(
      second.json<{ results: Array<{ status?: string }> }>().results,
    ).toEqual([expect.objectContaining({ status: "duplicate" })]);
    expect(store.messages).toHaveLength(2);
    expect(store.webhookEvents).toHaveLength(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("reprocesses a retried webhook whose prior delivery failed", async () => {
    const store = new MemoryPlatformStore();
    let sendAttempts = 0;
    globalThis.fetch = vi.fn(async () => {
      sendAttempts += 1;
      // The provider's Graph API is down on the first attempt, healthy on the
      // retry — this is exactly the transient failure webhooks retry for.
      if (sendAttempts === 1) {
        throw new Error("network down");
      }
      return new Response(JSON.stringify({ messages: [{ id: "wamid.ok" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    const app = await buildServer({
      store,
      adminToken: "test-token",
      allowedOrigins: ["*"],
      whatsappAccessToken: "whatsapp-token",
    });
    const tenant = await store.createTenant({
      name: "Tenant One",
      slug: "tenant-one",
    });
    await store.addFaq(tenant.id, {
      question: "What do you do?",
      answer: "We implement practical AI automation.",
    });
    await store.upsertChannelConnection(tenant.id, {
      channel: "whatsapp",
      provider: "meta-whatsapp-cloud",
      externalAccountId: "phone-number-1",
      status: "connected",
    });

    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "phone-number-1" },
                messages: [
                  {
                    id: "wamid.retry",
                    from: "491701234567",
                    text: { body: "What do you do?" },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    // First delivery fails downstream: the webhook returns 5xx so the provider
    // will retry, and the event row is left in a non-processed state.
    const first = await app.inject({
      method: "POST",
      url: "/webhooks/meta/whatsapp",
      payload,
    });
    expect(first.statusCode).toBe(500);
    expect(store.webhookEvents).toHaveLength(1);
    expect(store.webhookEvents[0]?.status).toBe("failed");

    // The provider retries the same event id — it must be reprocessed, not
    // dropped as a duplicate, and this time it succeeds.
    const second = await app.inject({
      method: "POST",
      url: "/webhooks/meta/whatsapp",
      payload,
    });
    expect(second.statusCode).toBe(200);
    const results = second.json<{
      results: Array<{ status?: string; retried?: boolean }>;
    }>().results;
    expect(results[0]?.status).not.toBe("duplicate");
    expect(results[0]?.retried).toBe(true);
    expect(store.webhookEvents).toHaveLength(1);
    expect(store.webhookEvents[0]?.status).toBe("processed");
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    await app.close();
  });

  it("blocks stale freeform channel replies before calling the provider", async () => {
    const store = new MemoryPlatformStore();
    const originalAddMessage = store.addMessage.bind(store);
    store.addMessage = async (input: Record<string, unknown>) => {
      const message = await originalAddMessage(input);
      if (input.direction === "inbound") {
        message.createdAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
      }
      return message;
    };
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    const app = await buildServer({
      store,
      adminToken: "test-token",
      allowedOrigins: ["*"],
      whatsappAccessToken: "whatsapp-token",
    });
    const tenant = await store.createTenant({
      name: "Tenant One",
      slug: "tenant-one",
    });
    await store.addFaq(tenant.id, {
      question: "What do you do?",
      answer: "We implement practical AI automation.",
    });
    await store.upsertChannelConnection(tenant.id, {
      channel: "whatsapp",
      provider: "meta-whatsapp-cloud",
      externalAccountId: "phone-number-1",
      status: "connected",
    });

    const response = await app.inject({
      method: "POST",
      url: "/webhooks/meta/whatsapp",
      payload: {
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: "phone-number-1" },
                  messages: [
                    {
                      id: "wamid.stale",
                      from: "491701234567",
                      text: { body: "What do you do?" },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(store.deliveries[0]).toMatchObject({
      status: "skipped",
      detail: expect.stringContaining("24-hour customer-service window"),
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

  it("creates contact profiles and unified inbox entries from captured leads", async () => {
    const store = new MemoryPlatformStore();
    const tenant = await store.createTenant({
      name: "Tenant One",
      slug: "tenant-one",
    });
    const { app, memberHeaders } = await buildServerWithMember(
      store,
      tenant.id,
    );

    const leadResponse = await app.inject({
      method: "POST",
      url: "/widget/leads",
      payload: {
        assistantId: tenant.publicId,
        conversationId: "conv_lead_test",
        visitorId: "visitor-1",
        fields: {
          name: "Mina Mustermann",
          email: "mina@example.com",
          phone: "+49 170 1234567",
          company: "Mina GmbH",
          projectType: "AI support automation",
        },
      },
    });
    expect(leadResponse.statusCode).toBe(201);

    const contactsResponse = await app.inject({
      method: "GET",
      url: `/admin/tenants/${tenant.id}/contacts`,
      headers: memberHeaders,
    });
    expect(contactsResponse.statusCode).toBe(200);
    expect(
      contactsResponse.json<Array<{ email: string; company: string }>>()[0],
    ).toMatchObject({
      email: "mina@example.com",
      company: "Mina GmbH",
    });

    const inboxResponse = await app.inject({
      method: "GET",
      url: `/admin/tenants/${tenant.id}/inbox`,
      headers: memberHeaders,
    });
    expect(inboxResponse.statusCode).toBe(200);
    expect(
      inboxResponse.json<
        Array<{ contact: { displayName: string }; openHandoffs: unknown[] }>
      >()[0],
    ).toMatchObject({
      contact: {
        displayName: "Mina Mustermann",
      },
      openHandoffs: expect.any(Array),
    });

    const suggestionsResponse = await app.inject({
      method: "GET",
      url: `/admin/tenants/${tenant.id}/workflows/suggestions`,
      headers: memberHeaders,
    });
    expect(suggestionsResponse.statusCode).toBe(200);
    expect(
      suggestionsResponse
        .json<{ suggestions: Array<{ id: string }> }>()
        .suggestions.some(
          (suggestion) => suggestion.id === "handoff_assignment",
        ),
    ).toBe(true);

    await app.close();
  });

  it("manages WhatsApp templates and compliance state", async () => {
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

    const templateResponse = await app.inject({
      method: "POST",
      url: `/admin/tenants/${tenant.id}/whatsapp/templates`,
      headers: { "x-admin-token": "test-token" },
      payload: {
        name: "continue conversation",
        language: "de",
        category: "utility",
        status: "approved",
        body: "Hallo {{name}}, bitte antworten Sie, damit wir Ihre Anfrage weiter bearbeiten koennen.",
      },
    });
    expect(templateResponse.statusCode).toBe(201);
    expect(
      templateResponse.json<{ name: string; status: string }>(),
    ).toMatchObject({
      name: "continue_conversation",
      status: "approved",
    });

    const complianceResponse = await app.inject({
      method: "GET",
      url: `/admin/tenants/${tenant.id}/whatsapp/compliance`,
      headers: { "x-admin-token": "test-token" },
    });
    expect(complianceResponse.statusCode).toBe(200);
    expect(
      complianceResponse.json<{ templates: { approved: number } }>().templates,
    ).toMatchObject({
      approved: 1,
    });

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
    const tenant = await store.createTenant({
      name: "Tenant One",
      slug: "tenant-one",
    });
    const { app, memberHeaders } = await buildServerWithMember(
      store,
      tenant.id,
    );
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
      headers: memberHeaders,
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
      headers: memberHeaders,
    });
    expect(messagesResponse.statusCode).toBe(200);
    expect(messagesResponse.json<unknown[]>()).toHaveLength(2);

    const handoffsResponse = await app.inject({
      method: "GET",
      url: `/admin/tenants/${tenant.id}/handoffs`,
      headers: memberHeaders,
    });
    expect(handoffsResponse.statusCode).toBe(200);
    const handoff = handoffsResponse.json<Array<{ id: string }>>()[0];
    if (!handoff) {
      throw new Error("Expected a handoff.");
    }

    const unansweredResponse = await app.inject({
      method: "GET",
      url: `/admin/tenants/${tenant.id}/unanswered`,
      headers: memberHeaders,
    });
    expect(unansweredResponse.statusCode).toBe(200);
    expect(
      unansweredResponse.json<Array<{ reason: string; question: string }>>()[0],
    ).toMatchObject({
      reason: "competitor",
      question: "Tell me about a competitor",
    });

    const dashboardResponse = await app.inject({
      method: "GET",
      url: `/admin/tenants/${tenant.id}/dashboard`,
      headers: memberHeaders,
    });
    expect(dashboardResponse.statusCode).toBe(200);
    expect(
      dashboardResponse.json<{
        analytics: { conversations: number; totalHandoffs: number };
        conversations: unknown[];
        unifiedInbox: unknown[];
        handoffs: unknown[];
        unansweredQuestions: unknown[];
        workflowSuggestions: { counts: { suggestions: number } };
        productionReadiness: { score: number; summary: { failed: number } };
      }>(),
    ).toMatchObject({
      analytics: {
        conversations: 2,
        totalHandoffs: 1,
      },
      conversations: expect.any(Array),
      unifiedInbox: expect.any(Array),
      handoffs: expect.any(Array),
      unansweredQuestions: expect.any(Array),
      workflowSuggestions: {
        counts: {
          suggestions: expect.any(Number),
        },
      },
      productionReadiness: {
        score: expect.any(Number),
        summary: {
          failed: expect.any(Number),
        },
      },
    });

    const updateHandoffResponse = await app.inject({
      method: "PATCH",
      url: `/admin/tenants/${tenant.id}/handoffs/${handoff.id}`,
      headers: memberHeaders,
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

  it("scores production readiness from tenant, channel, quality, and ops signals", async () => {
    const previousEnv = {
      CHANNEL_CREDENTIAL_MASTER_KEY: process.env.CHANNEL_CREDENTIAL_MASTER_KEY,
      REDIS_URL: process.env.REDIS_URL,
      RETENTION_CLEANUP_ENABLED: process.env.RETENTION_CLEANUP_ENABLED,
      SENTRY_DSN: process.env.SENTRY_DSN,
      AI_EVAL_ENABLED: process.env.AI_EVAL_ENABLED,
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    };
    process.env.CHANNEL_CREDENTIAL_MASTER_KEY = "test-master-key";
    process.env.REDIS_URL = "redis://localhost:6379";
    process.env.RETENTION_CLEANUP_ENABLED = "true";
    process.env.SENTRY_DSN = "https://example@sentry.invalid/1";
    process.env.AI_EVAL_ENABLED = "true";
    process.env.STRIPE_SECRET_KEY = "sk_test_ready";

    const store = new MemoryPlatformStore();
    const app = await buildServer({
      store,
      adminToken: "test-token",
      allowedOrigins: ["*"],
      metaAppSecret: "meta-secret",
      whatsappAccessToken: "whatsapp-token",
    });

    try {
      const tenant = await store.createTenant({
        name: "Tenant One",
        slug: "tenant-one",
      });
      await store.updateTenant(tenant.id, { retentionDays: 90 });
      await store.upsertTenantUser(tenant.id, {
        email: "owner@example.com",
        name: "Owner",
        role: "tenant_owner",
      });
      for (let index = 0; index < 8; index += 1) {
        await store.addFaq(tenant.id, {
          question: `Approved question ${index}?`,
          answer: `Approved answer ${index} about services and privacy.`,
        });
      }
      await store.upsertChannelConnection(tenant.id, {
        channel: "whatsapp",
        provider: "meta-whatsapp-cloud",
        externalAccountId: "15551234567",
        status: "connected",
      });
      await store.upsertWhatsappTemplate(tenant.id, {
        name: "continue conversation",
        language: "de",
        category: "utility",
        status: "approved",
        body: "Hallo {{name}}, wir koennen Ihre Anfrage weiter bearbeiten.",
      });
      await store.upsertChannelConnection(tenant.id, {
        channel: "telephone",
        provider: "easybell",
        externalAccountId: "+49123456789",
        status: "connected",
        settings: {
          setupChecklist: {
            numberOrdered: true,
            sipConfigured: true,
            testCallCompleted: true,
            fallbackSet: true,
            disclosureConfirmed: true,
          },
          gdpr: {
            disclosureText: "This call may be handled by an AI assistant.",
          },
          fallbackNumber: "+49111111111",
        },
      });

      const chatResponse = await app.inject({
        method: "POST",
        url: "/widget/chat",
        payload: {
          assistantId: tenant.publicId,
          message: "What services do you offer?",
        },
      });
      expect(chatResponse.statusCode).toBe(200);

      const readinessResponse = await app.inject({
        method: "GET",
        url: `/admin/tenants/${tenant.id}/production-readiness`,
        headers: { "x-admin-token": "test-token" },
      });

      expect(readinessResponse.statusCode).toBe(200);
      const readiness = readinessResponse.json<{
        score: number;
        status: string;
        summary: { failed: number; nextActions: Array<{ id: string }> };
        sections: Array<{ id: string; score: number }>;
      }>();
      expect(readiness.score).toBeGreaterThanOrEqual(85);
      expect(readiness.status).toBe("ready_for_beta");
      expect(readiness.summary.failed).toBe(0);
      expect(
        readiness.sections.find((section) => section.id === "voice")?.score,
      ).toBe(100);
    } finally {
      await app.close();
      for (const [key, value] of Object.entries(previousEnv)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });

  it("rejects Meta webhooks with an invalid signature when the app secret is configured", async () => {
    const store = new MemoryPlatformStore();
    const app = await buildServer({
      store,
      adminToken: "test-token",
      allowedOrigins: ["*"],
      metaAppSecret: "app-secret",
    });
    const tenant = await store.createTenant({
      name: "Tenant One",
      slug: "tenant-one",
    });
    await store.upsertChannelConnection(tenant.id, {
      channel: "whatsapp",
      provider: "meta-whatsapp-cloud",
      externalAccountId: "phone-number-1",
      status: "connected",
    });

    const rawBody = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "phone-number-1" },
                messages: [{ from: "491701234567", text: { body: "Hi" } }],
              },
            },
          ],
        },
      ],
    });

    const missing = await app.inject({
      method: "POST",
      url: "/webhooks/meta/whatsapp",
      headers: { "content-type": "application/json" },
      payload: rawBody,
    });
    expect(missing.statusCode).toBe(401);

    const tampered = await app.inject({
      method: "POST",
      url: "/webhooks/meta/whatsapp",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": "sha256=deadbeef",
      },
      payload: rawBody,
    });
    expect(tampered.statusCode).toBe(401);
    expect(store.conversations).toHaveLength(0);

    await app.close();
  });

  it("accepts Meta webhooks with a valid signature when the app secret is configured", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ) as typeof fetch;
    const store = new MemoryPlatformStore();
    const app = await buildServer({
      store,
      adminToken: "test-token",
      allowedOrigins: ["*"],
      metaAppSecret: "app-secret",
      whatsappAccessToken: "whatsapp-token",
    });
    const tenant = await store.createTenant({
      name: "Tenant One",
      slug: "tenant-one",
    });
    await store.addFaq(tenant.id, {
      question: "What do you do?",
      answer: "We implement practical AI automation.",
      tags: ["faq"],
    });
    await store.upsertChannelConnection(tenant.id, {
      channel: "whatsapp",
      provider: "meta-whatsapp-cloud",
      externalAccountId: "phone-number-1",
      status: "connected",
    });

    const rawBody = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "phone-number-1" },
                messages: [
                  { from: "491701234567", text: { body: "What do you do?" } },
                ],
              },
            },
          ],
        },
      ],
    });
    const signature = `sha256=${createHmac("sha256", "app-secret")
      .update(Buffer.from(rawBody, "utf8"))
      .digest("hex")}`;

    const response = await app.inject({
      method: "POST",
      url: "/webhooks/meta/whatsapp",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": signature,
      },
      payload: rawBody,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ routed: number }>().routed).toBe(1);
    await app.close();
  });

  it("sets security headers on responses", async () => {
    const store = new MemoryPlatformStore();
    const app = await buildServer({
      store,
      adminToken: "test-token",
      allowedOrigins: ["*"],
    });

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["content-security-policy"]).toContain(
      "frame-ancestors 'none'",
    );
    await app.close();
  });

  it("denies the platform admin token access to tenant personal data", async () => {
    const store = new MemoryPlatformStore();
    const tenant = await store.createTenant({
      name: "Tenant One",
      slug: "tenant-one",
    });
    const { app, memberHeaders } = await buildServerWithMember(
      store,
      tenant.id,
    );

    const conversation = await store.findOrCreateConversation({
      tenantId: tenant.id,
      channel: "website",
    });
    await store.addMessage({
      tenantId: tenant.id,
      conversationId: conversation.id,
      channel: "website",
      direction: "inbound",
      role: "user",
      content: "This is a private end-user message.",
    });

    // The platform admin token (and any platform_owner without a real
    // membership) must NOT be able to read tenant end-user personal data.
    const adminHeaders = { "x-admin-token": "test-token" };
    for (const url of [
      `/admin/tenants/${tenant.id}/conversations`,
      `/admin/tenants/${tenant.id}/inbox`,
      `/admin/tenants/${tenant.id}/contacts`,
      `/admin/tenants/${tenant.id}/conversations/${conversation.id}/messages`,
      `/admin/tenants/${tenant.id}/export`,
    ]) {
      const denied = await app.inject({
        method: "GET",
        url,
        headers: adminHeaders,
      });
      expect(denied.statusCode).toBe(403);
    }

    // A genuine tenant member still reads content, and that access is audited.
    const allowed = await app.inject({
      method: "GET",
      url: `/admin/tenants/${tenant.id}/conversations/${conversation.id}/messages`,
      headers: memberHeaders,
    });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json<unknown[]>()).toHaveLength(1);
    expect(
      store.auditEvents.some(
        (event) =>
          event.action === "conversation.messages.viewed" &&
          event.actorType === "user",
      ),
    ).toBe(true);

    // Aggregate, non-personal analytics stay reachable for platform operations.
    const analytics = await app.inject({
      method: "GET",
      url: `/admin/tenants/${tenant.id}/analytics`,
      headers: adminHeaders,
    });
    expect(analytics.statusCode).toBe(200);

    await app.close();
  });

  it("threads validated pagination query params into list endpoints", async () => {
    const store = new MemoryPlatformStore();
    const tenant = await store.createTenant({
      name: "Tenant One",
      slug: "tenant-one",
    });
    const { app, memberHeaders } = await buildServerWithMember(
      store,
      tenant.id,
    );
    const handoffsSpy = vi.spyOn(store, "listHandoffs");

    const response = await app.inject({
      method: "GET",
      url: `/admin/tenants/${tenant.id}/handoffs?limit=25&offset=50&q=lead&status=open`,
      headers: memberHeaders,
    });

    expect(response.statusCode).toBe(200);
    expect(handoffsSpy).toHaveBeenCalledWith(tenant.id, {
      limit: 25,
      offset: 50,
      q: "lead",
      status: "open",
    });

    // Omitting the params leaves them undefined so the store keeps its default.
    handoffsSpy.mockClear();
    const defaultResponse = await app.inject({
      method: "GET",
      url: `/admin/tenants/${tenant.id}/handoffs`,
      headers: memberHeaders,
    });
    expect(defaultResponse.statusCode).toBe(200);
    expect(handoffsSpy).toHaveBeenCalledWith(tenant.id, {
      limit: undefined,
      offset: undefined,
      q: undefined,
      status: undefined,
    });
    await app.close();
  });

  it("rejects out-of-range pagination query params", async () => {
    const store = new MemoryPlatformStore();
    const tenant = await store.createTenant({
      name: "Tenant One",
      slug: "tenant-one",
    });
    const { app, memberHeaders } = await buildServerWithMember(
      store,
      tenant.id,
    );

    const response = await app.inject({
      method: "GET",
      url: `/admin/tenants/${tenant.id}/contacts?limit=9999`,
      headers: memberHeaders,
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("dedupes retried lead submissions sharing an idempotency key", async () => {
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

    const payload = {
      assistantId: tenant.publicId,
      conversationId: "conv_dedupe_test_000001",
      visitorId: "visitor-one",
      fields: {
        name: "Ada",
        email: "ada@example.com",
      },
    };
    const headers = { "idempotency-key": "lead-key-123" };

    const first = await app.inject({
      method: "POST",
      url: "/widget/leads",
      headers,
      payload,
    });
    const second = await app.inject({
      method: "POST",
      url: "/widget/leads",
      headers,
      payload,
    });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    // The retry must not create a second handoff for the same conversation+key.
    expect(store.handoffs).toHaveLength(1);
    expect(first.json<{ conversationId: string }>().conversationId).toBe(
      second.json<{ conversationId: string }>().conversationId,
    );
    await app.close();
  });
});
