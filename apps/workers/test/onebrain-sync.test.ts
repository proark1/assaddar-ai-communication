import { describe, expect, it } from "vitest";
import type { BrainProvider, BrainIntakeInput } from "@assaddar/core";
import {
  buildOneBrainKnowledgeIntake,
  buildOneBrainScope,
  hashOneBrainIntake,
  syncApprovedKnowledgeToOneBrain,
  type OneBrainKnowledgeSyncStore,
} from "../src/onebrain-sync";

const tenant = {
  id: "11111111-1111-1111-1111-111111111111",
  publicId: "asst_public",
  slug: "acme",
  name: "Acme",
  status: "active",
};

const knowledge = {
  id: "22222222-2222-2222-2222-222222222222",
  documentId: "33333333-3333-3333-3333-333333333333",
  sourceId: "44444444-4444-4444-4444-444444444444",
  title: "Opening hours",
  content: "Question: When are you open?\nAnswer: 09:00-17:00.",
  tags: ["faq"],
  status: "approved",
  metadata: { question: "When are you open?" },
  createdAt: new Date("2026-07-08T08:00:00Z"),
  updatedAt: new Date("2026-07-08T09:00:00Z"),
};

describe("buildOneBrainScope", () => {
  it("maps tenant slug to OneBrain account and applies communication defaults", () => {
    expect(buildOneBrainScope(tenant)).toEqual({
      tenantId: tenant.id,
      accountId: "acme",
      appId: "communication",
      purpose: "knowledge_management",
    });
  });

  it("allows deployment env overrides for account, space, app, and purpose", () => {
    expect(
      buildOneBrainScope(tenant, {
        ONEBRAIN_ACCOUNT_ID: "account_override",
        ONEBRAIN_SPACE_ID: "sp_customer_service",
        ONEBRAIN_APP_ID: "communication",
        ONEBRAIN_KNOWLEDGE_PURPOSE: "customer_service_inbox",
      }),
    ).toEqual({
      tenantId: tenant.id,
      accountId: "account_override",
      spaceId: "sp_customer_service",
      appId: "communication",
      purpose: "customer_service_inbox",
    });
  });
});

describe("buildOneBrainKnowledgeIntake", () => {
  it("maps approved knowledge into a OneBrain intake record", () => {
    expect(
      buildOneBrainKnowledgeIntake(tenant, knowledge, {
        ONEBRAIN_SPACE_ID: "sp_customer_service",
      }),
    ).toMatchObject({
      scope: {
        tenantId: tenant.id,
        accountId: "acme",
        spaceId: "sp_customer_service",
        appId: "communication",
        purpose: "knowledge_management",
      },
      title: "Opening hours",
      content: "Question: When are you open?\nAnswer: 09:00-17:00.",
      source: "communication",
      sourceRef:
        "communication:tenant:11111111-1111-1111-1111-111111111111:knowledge:22222222-2222-2222-2222-222222222222",
      recordType: "document",
      intent: "knowledge_update",
      metadata: {
        communicationTenantId: tenant.id,
        knowledgeId: knowledge.id,
        documentId: knowledge.documentId,
        sourceId: knowledge.sourceId,
        tags: ["faq"],
        status: "approved",
        createdAt: "2026-07-08T08:00:00.000Z",
        updatedAt: "2026-07-08T09:00:00.000Z",
      },
    });
  });

  it("skips empty knowledge content", () => {
    expect(
      buildOneBrainKnowledgeIntake(tenant, {
        ...knowledge,
        content: "   ",
      }),
    ).toBeNull();
  });
});

describe("syncApprovedKnowledgeToOneBrain", () => {
  it("exports approved knowledge with a fake provider", async () => {
    const inputs: BrainIntakeInput[] = [];
    const successes: unknown[] = [];
    const store: OneBrainKnowledgeSyncStore = {
      async listTenants() {
        return [tenant];
      },
      async listKnowledge(tenantId, options) {
        expect(tenantId).toBe(tenant.id);
        expect(options).toEqual({
          status: "approved",
          limit: 1,
          offset: 0,
        });
        return [knowledge];
      },
      async getOneBrainSyncRecord() {
        return null;
      },
      async recordOneBrainSyncSuccess(_tenantId, input) {
        successes.push(input);
      },
      async recordOneBrainSyncFailure() {
        throw new Error("unexpected failure write");
      },
    };
    const provider: BrainProvider = {
      kind: "onebrain",
      async intake(input) {
        inputs.push(input);
        return {
          record: {
            id: "rec_1",
            tenant_id: tenant.id,
            account_id: "acme",
            space_id: "",
            app_id: "communication",
            purpose: "knowledge_management",
            source: "communication",
            source_ref: input.sourceRef ?? "",
            record_type: "document",
            intent: "knowledge_update",
            classification: "internal",
            confidence: 0.8,
            status: "stored",
            title: input.title ?? "",
            summary: "",
            extracted_facts: {},
            metadata: {},
            created_at: "",
          },
        };
      },
      async ask() {
        return { answer: "", chunksUsed: 0 };
      },
    };

    await expect(
      syncApprovedKnowledgeToOneBrain(store, provider, {
        env: { ONEBRAIN_KNOWLEDGE_EXPORT_LIMIT: "1" },
      }),
    ).resolves.toEqual({
      tenants: 1,
      attempted: 1,
      synced: 1,
      skipped: 0,
    });
    expect(inputs).toHaveLength(1);
    expect(inputs[0]?.scope.accountId).toBe("acme");
    expect(successes).toHaveLength(1);
    expect(successes[0]).toMatchObject({
      provider: "onebrain",
      sourceType: "knowledge",
      sourceId: knowledge.id,
      externalRecordId: "rec_1",
    });
  });

  it("skips unchanged knowledge that already synced", async () => {
    const input = buildOneBrainKnowledgeIntake(tenant, knowledge);
    if (!input) {
      throw new Error("expected knowledge intake input");
    }
    const store: OneBrainKnowledgeSyncStore = {
      async listTenants() {
        return [tenant];
      },
      async listKnowledge() {
        return [knowledge];
      },
      async getOneBrainSyncRecord() {
        return {
          status: "synced",
          contentHash: hashOneBrainIntake(input),
        };
      },
      async recordOneBrainSyncSuccess() {
        throw new Error("unchanged records should not be written");
      },
      async recordOneBrainSyncFailure() {
        throw new Error("unchanged records should not fail");
      },
    };
    const provider: BrainProvider = {
      kind: "onebrain",
      async intake() {
        throw new Error("unchanged records should not be sent");
      },
      async ask() {
        return { answer: "", chunksUsed: 0 };
      },
    };

    await expect(
      syncApprovedKnowledgeToOneBrain(store, provider),
    ).resolves.toEqual({
      tenants: 1,
      attempted: 0,
      synced: 0,
      skipped: 1,
    });
  });
});
