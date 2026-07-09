import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  channelWebhookEvents,
  conversations,
  createDbClient,
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
});
