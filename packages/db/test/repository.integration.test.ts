import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  ChannelAccountConflictError,
  channelWebhookEvents,
  conversations,
  createDbClient,
  onebrainDeleteOutbox,
  stripeWebhookEvents,
  TenantRepository,
  tenants,
  type DatabaseClient,
} from "../src";

function isLocalDatabaseUrl(value: string | undefined) {
  if (!value) {
    return false;
  }
  try {
    const url = new URL(value);
    return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

const runIntegrationTests = isLocalDatabaseUrl(process.env.DATABASE_URL);

describe.skipIf(!runIntegrationTests)("TenantRepository integration", () => {
  let client: DatabaseClient;
  let repo: TenantRepository;
  const tenantIds: string[] = [];

  beforeAll(() => {
    client = createDbClient(process.env.DATABASE_URL);
    repo = new TenantRepository(client.db);
  });

  afterEach(async () => {
    if (tenantIds.length === 0) {
      return;
    }
    await client.db.delete(tenants).where(inArray(tenants.id, tenantIds));
    tenantIds.length = 0;
  });

  afterAll(async () => {
    await client?.close();
  });

  async function createTestTenant(label: string) {
    const id = crypto.randomUUID().slice(0, 8);
    const tenant = await repo.createTenant({
      name: `Integration ${label} ${id}`,
      slug: `integration-${label}-${id}`,
    });
    tenantIds.push(tenant.id);
    return tenant;
  }

  it("summarizes OneBrain sync records by tenant and status", async () => {
    const tenant = await createTestTenant("onebrain");
    const otherTenant = await createTestTenant("onebrain-other");

    await repo.recordOneBrainSyncSuccess(tenant.id, {
      sourceType: "knowledge",
      sourceId: "k1",
      sourceRef: `communication:tenant:${tenant.id}:knowledge:k1`,
      contentHash: "hash_1",
      externalRecordId: "rec_1",
    });
    await repo.recordOneBrainSyncFailure(tenant.id, {
      sourceType: "knowledge",
      sourceId: "k2",
      sourceRef: `communication:tenant:${tenant.id}:knowledge:k2`,
      contentHash: "hash_2",
      error: "Forbidden",
    });
    await repo.recordOneBrainSyncSuccess(otherTenant.id, {
      sourceType: "knowledge",
      sourceId: "k3",
      sourceRef: `communication:tenant:${otherTenant.id}:knowledge:k3`,
      contentHash: "hash_3",
      externalRecordId: "rec_3",
    });

    const summary = await repo.getOneBrainSyncSummary(tenant.id, 1);

    expect(summary).toMatchObject({
      total: 2,
      byStatus: {
        synced: 1,
        failed: 1,
        pending: 0,
        other: 0,
      },
    });
    expect(summary.lastSyncedAt).toBeInstanceOf(Date);
    expect(summary.lastFailedAt).toBeInstanceOf(Date);
    expect(summary.recentFailures).toHaveLength(1);
    expect(summary.recentFailures[0]).toMatchObject({
      sourceId: "k2",
      status: "failed",
      lastError: "Forbidden",
    });
    expect(summary.recentSynced).toHaveLength(1);
    expect(summary.recentSynced[0]).toMatchObject({
      sourceId: "k1",
      status: "synced",
      externalRecordId: "rec_1",
    });
  });

  it("matches contacts by identifier without crossing tenant boundaries", async () => {
    const tenantA = await createTestTenant("contacts-a");
    const tenantB = await createTestTenant("contacts-b");

    const first = await repo.findOrCreateConversation({
      tenantId: tenantA.id,
      publicConversationId: `conv-${crypto.randomUUID()}`,
      channel: "website",
      externalUserId: "visitor-shared",
      contact: { displayName: "Ada", email: "ada@example.com" },
    });
    await repo.addMessage({
      tenantId: tenantA.id,
      conversationId: first.id,
      channel: "website",
      direction: "inbound",
      role: "user",
      content: "Need a quote",
    });

    await repo.findOrCreateConversation({
      tenantId: tenantA.id,
      publicConversationId: `conv-${crypto.randomUUID()}`,
      channel: "website",
      externalUserId: "visitor-shared",
      contact: { displayName: "Ada Lovelace" },
    });

    await repo.findOrCreateConversation({
      tenantId: tenantB.id,
      publicConversationId: `conv-${crypto.randomUUID()}`,
      channel: "website",
      externalUserId: "visitor-shared",
      contact: { displayName: "Other tenant Ada" },
    });

    const contactsA = await repo.listContacts(tenantA.id);
    const contactsB = await repo.listContacts(tenantB.id);
    expect(contactsA).toHaveLength(1);
    expect(contactsB).toHaveLength(1);
    expect(contactsA[0]?.id).not.toBe(contactsB[0]?.id);
    expect(contactsA[0]?.displayName).toBe("Ada Lovelace");

    const inbox = await repo.listUnifiedInbox(tenantA.id);
    expect(inbox).toHaveLength(2);
    expect(new Set(inbox.map((item) => item.contact?.id))).toEqual(
      new Set([contactsA[0]?.id]),
    );
    expect(
      inbox.find((item) => item.id === first.id)?.lastMessage?.content,
    ).toBe("Need a quote");
  });

  it("exports and erases contact-owned conversation data", async () => {
    const tenant = await createTestTenant("erasure");
    const conversation = await repo.findOrCreateConversation({
      tenantId: tenant.id,
      publicConversationId: `conv-${crypto.randomUUID()}`,
      channel: "website",
      externalUserId: "export-visitor",
      contact: { email: "export@example.com" },
    });
    await repo.addMessage({
      tenantId: tenant.id,
      conversationId: conversation.id,
      channel: "website",
      direction: "inbound",
      role: "user",
      content: "Please export this",
    });

    const exported = await repo.exportTenantData(tenant.id);
    expect(exported.contacts).toHaveLength(1);
    expect(exported.conversations).toHaveLength(1);
    expect(exported.messages).toHaveLength(1);

    const result = await repo.deleteContact(
      tenant.id,
      exported.contacts[0]!.id,
    );
    expect(result).toMatchObject({
      deletedContact: true,
      deletedConversations: 1,
    });

    const afterErasure = await repo.exportTenantData(tenant.id);
    expect(afterErasure.contacts).toHaveLength(0);
    expect(afterErasure.conversations).toHaveLength(0);
    expect(afterErasure.messages).toHaveLength(0);
  });

  it("prunes only conversation data older than the retention cutoff", async () => {
    const tenant = await createTestTenant("retention");
    const oldConversation = await repo.findOrCreateConversation({
      tenantId: tenant.id,
      publicConversationId: `conv-${crypto.randomUUID()}`,
      channel: "website",
      externalUserId: "old-visitor",
    });
    const recentConversation = await repo.findOrCreateConversation({
      tenantId: tenant.id,
      publicConversationId: `conv-${crypto.randomUUID()}`,
      channel: "website",
      externalUserId: "recent-visitor",
    });

    // Raw webhook events carry personal data too and must be pruned by age.
    const oldEvent = await repo.recordChannelWebhookEvent({
      tenantId: tenant.id,
      channel: "whatsapp",
      providerEventId: `evt-old-${crypto.randomUUID()}`,
      eventType: "message.inbound",
      payload: { raw: "old" },
    });
    const recentEvent = await repo.recordChannelWebhookEvent({
      tenantId: tenant.id,
      channel: "whatsapp",
      providerEventId: `evt-recent-${crypto.randomUUID()}`,
      eventType: "message.inbound",
      payload: { raw: "recent" },
    });

    await client.db
      .update(conversations)
      .set({
        createdAt: new Date("2026-05-01T00:00:00.000Z"),
        updatedAt: new Date("2026-05-01T00:00:00.000Z"),
      })
      .where(eq(conversations.id, oldConversation.id));
    await client.db
      .update(channelWebhookEvents)
      .set({ createdAt: new Date("2026-05-01T00:00:00.000Z") })
      .where(eq(channelWebhookEvents.id, oldEvent.event.id));

    const result = await repo.deleteTenantDataOlderThanRetention(tenant.id, {
      now: new Date("2026-07-06T00:00:00.000Z"),
      retentionDays: 30,
    });

    expect(result.deletedConversations).toBe(1);
    expect(result.deletedWebhookEvents).toBe(1);
    const remaining = await repo.listConversations(tenant.id);
    expect(remaining.map((item) => item.id)).toEqual([recentConversation.id]);
    const remainingEvents = await client.db
      .select({ id: channelWebhookEvents.id })
      .from(channelWebhookEvents)
      .where(eq(channelWebhookEvents.tenantId, tenant.id));
    expect(remainingEvents.map((item) => item.id)).toEqual([
      recentEvent.event.id,
    ]);
  });

  it("erases raw webhook payloads when the tenant is deleted (cascade, not orphan)", async () => {
    const tenant = await createTestTenant("erase-webhooks");

    const channelEvent = await repo.recordChannelWebhookEvent({
      tenantId: tenant.id,
      channel: "whatsapp",
      providerEventId: `evt-${crypto.randomUUID()}`,
      eventType: "message.inbound",
      payload: { raw: "+49 170 0000000 personal message body" },
    });
    const [stripeRow] = await client.db
      .insert(stripeWebhookEvents)
      .values({
        stripeEventId: `evt_${crypto.randomUUID()}`,
        eventType: "customer.created",
        tenantId: tenant.id,
        payload: { customer: "personal data" },
      })
      .returning({ id: stripeWebhookEvents.id });
    expect(stripeRow).toBeDefined();
    const stripeRowId = stripeRow!.id;

    await repo.deleteTenantData(tenant.id);

    // Query by row id, not tenant_id: an orphaned (set-null) row would still
    // exist with tenant_id = NULL and pass a tenant_id filter. Both must be gone.
    const channelRows = await client.db
      .select({ id: channelWebhookEvents.id })
      .from(channelWebhookEvents)
      .where(eq(channelWebhookEvents.id, channelEvent.event.id));
    expect(channelRows).toEqual([]);

    const stripeRows = await client.db
      .select({ id: stripeWebhookEvents.id })
      .from(stripeWebhookEvents)
      .where(eq(stripeWebhookEvents.id, stripeRowId));
    expect(stripeRows).toEqual([]);
  });

  it("captures OneBrain deletes into an outbox that survives tenant deletion", async () => {
    const tenant = await createTestTenant("delete-outbox");
    const sourceRef = `communication:tenant:${tenant.id}:knowledge:k1`;
    await repo.recordOneBrainSyncSuccess(tenant.id, {
      sourceType: "knowledge",
      sourceId: "k1",
      sourceRef,
      contentHash: "hash_1",
      externalRecordId: "rec_1",
    });

    // Deleting the tenant cascades onebrain_sync_records away — but the ref to
    // erase remotely must be captured first into the tenant-FK-free outbox.
    await repo.deleteTenantData(tenant.id);

    const pending = await repo.listPendingOneBrainDeletes(500);
    const mine = pending.filter((row) => row.sourceRef === sourceRef);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.status).toBe("pending");
    expect(mine[0]?.externalRecordId).toBe("rec_1");

    // Draining marks the row done so it leaves the pending set.
    await repo.markOneBrainDeleteDone(mine[0]!.id);
    const afterDrain = await repo.listPendingOneBrainDeletes(500);
    expect(afterDrain.some((row) => row.id === mine[0]!.id)).toBe(false);

    // The outbox has no tenant FK, so clean it up explicitly.
    await client.db
      .delete(onebrainDeleteOutbox)
      .where(eq(onebrainDeleteOutbox.tenantId, tenant.id));
  });

  it("prevents two tenants from claiming the same provider account", async () => {
    const tenantA = await createTestTenant("channel-owner-a");
    const tenantB = await createTestTenant("channel-owner-b");

    await repo.upsertChannelConnection(tenantA.id, {
      channel: "whatsapp",
      provider: "meta-whatsapp-cloud",
      externalAccountId: "phone-shared",
      status: "connected",
    });

    await expect(
      repo.upsertChannelConnection(tenantB.id, {
        channel: "whatsapp",
        provider: "meta-whatsapp-cloud",
        externalAccountId: "phone-shared",
        status: "connected",
      }),
    ).rejects.toBeInstanceOf(ChannelAccountConflictError);

    // The owning tenant can still re-save its own connection.
    await expect(
      repo.upsertChannelConnection(tenantA.id, {
        channel: "whatsapp",
        provider: "meta-whatsapp-cloud",
        externalAccountId: "phone-shared",
        status: "connected",
      }),
    ).resolves.toMatchObject({ externalAccountId: "phone-shared" });
  });

  it("exports and erases contact-linked deliveries, handoffs, and suggestions", async () => {
    const tenant = await createTestTenant("erasure-completeness");
    const conversation = await repo.findOrCreateConversation({
      tenantId: tenant.id,
      publicConversationId: `conv-${crypto.randomUUID()}`,
      channel: "whatsapp",
      externalUserId: "4915100000000",
      contact: { phone: "4915100000000" },
    });
    const message = await repo.addMessage({
      tenantId: tenant.id,
      conversationId: conversation.id,
      channel: "whatsapp",
      direction: "inbound",
      role: "user",
      content: "Please erase me",
    });
    await repo.recordMessageDelivery({
      tenantId: tenant.id,
      conversationId: conversation.id,
      messageId: message.id,
      channel: "whatsapp",
      provider: "meta-whatsapp-cloud",
      status: "sent",
      metadata: { externalUserId: "4915100000000" },
    });
    await repo.createHandoff({
      tenantId: tenant.id,
      conversationId: conversation.id,
      channel: "whatsapp",
      reason: "customer_request",
      message: "Please erase me",
    });
    await repo.createKnowledgeSuggestion(tenant.id, {
      sourceType: "unanswered_question",
      sourceConversationId: conversation.id,
      suggestedQuestion: "Please erase me",
    });

    const exported = await repo.exportTenantData(tenant.id);
    expect(exported.messageDeliveries).toHaveLength(1);
    expect(exported.handoffRequests).toHaveLength(1);
    expect(exported.knowledgeSuggestions).toHaveLength(1);
    // Previously-omitted tables are now part of the data-subject export.
    expect(Array.isArray(exported.calls)).toBe(true);
    expect(Array.isArray(exported.callTranscripts)).toBe(true);
    expect(Array.isArray(exported.channelWebhookEvents)).toBe(true);
    expect(Array.isArray(exported.usageEvents)).toBe(true);
    expect(Array.isArray(exported.auditLogs)).toBe(true);

    const contactId = exported.contacts[0]!.id;
    const result = await repo.deleteContact(tenant.id, contactId);
    expect(result).toMatchObject({
      deletedContact: true,
      deletedConversations: 1,
      deletedDeliveries: 1,
      deletedHandoffs: 1,
      deletedSuggestions: 1,
    });

    const after = await repo.exportTenantData(tenant.id);
    expect(after.messageDeliveries).toHaveLength(0);
    expect(after.handoffRequests).toHaveLength(0);
    expect(after.knowledgeSuggestions).toHaveLength(0);
  });
});
