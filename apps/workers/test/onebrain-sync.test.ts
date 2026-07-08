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
      purpose: "customer_service_inbox",
    });
  });

  it("allows account and space env while keeping canonical app and purpose", () => {
    expect(
      buildOneBrainScope(tenant, {
        ONEBRAIN_ACCOUNT_ID: "account_override",
        ONEBRAIN_SPACE_ID: "sp_customer_service",
        ONEBRAIN_APP_ID: "not-communication",
        ONEBRAIN_KNOWLEDGE_PURPOSE: "not-canonical",
      } as Parameters<typeof buildOneBrainScope>[1] & {
        ONEBRAIN_APP_ID: string;
        ONEBRAIN_KNOWLEDGE_PURPOSE: string;
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
        purpose: "customer_service_inbox",
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
            space_id: "sp_customer_service",
            app_id: "communication",
            purpose: "customer_service_inbox",
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
        env: {
          ONEBRAIN_KNOWLEDGE_EXPORT_LIMIT: "1",
          ONEBRAIN_SPACE_ID: "sp_customer_service",
        },
      }),
    ).resolves.toEqual({
      tenants: 1,
      attempted: 1,
      synced: 1,
      skipped: 0,
    });
    expect(inputs).toHaveLength(1);
    expect(inputs[0]?.scope.accountId).toBe("acme");
    expect(inputs[0]?.scope.spaceId).toBe("sp_customer_service");
    expect(inputs[0]?.scope.purpose).toBe("customer_service_inbox");
    expect(successes).toHaveLength(1);
    expect(successes[0]).toMatchObject({
      provider: "onebrain",
      sourceType: "knowledge",
      sourceId: knowledge.id,
      externalRecordId: "rec_1",
    });
  });

  it("records async OneBrain intake jobs as successful handoffs", async () => {
    const successes: unknown[] = [];
    const store: OneBrainKnowledgeSyncStore = {
      async listTenants() {
        return [tenant];
      },
      async listKnowledge() {
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
      async intake() {
        return {
          job: {
            id: "job_1",
            type: "service_intake",
            status: "queued",
            tenant_id: "acme",
            account_id: "acme",
            space_id: "sp_customer_service",
            result: null,
            error: "",
            attempts: 0,
            created_at: "",
            updated_at: "",
            completed_at: "",
          },
        };
      },
      async ask() {
        return { answer: "", chunksUsed: 0 };
      },
    };

    await expect(
      syncApprovedKnowledgeToOneBrain(store, provider, {
        env: { ONEBRAIN_SPACE_ID: "sp_customer_service" },
      }),
    ).resolves.toMatchObject({
      attempted: 1,
      synced: 1,
      skipped: 0,
    });
    expect(successes[0]).toMatchObject({
      externalRecordId: "job_1",
      metadata: {
        oneBrainJobId: "job_1",
        oneBrainJobStatus: "queued",
        oneBrainJobType: "service_intake",
      },
    });
  });

  it("skips unchanged knowledge that already synced", async () => {
    const input = buildOneBrainKnowledgeIntake(tenant, knowledge, {
      ONEBRAIN_SPACE_ID: "sp_customer_service",
    });
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
      syncApprovedKnowledgeToOneBrain(store, provider, {
        env: { ONEBRAIN_SPACE_ID: "sp_customer_service" },
      }),
    ).resolves.toEqual({
      tenants: 1,
      attempted: 0,
      synced: 0,
      skipped: 1,
    });
  });

  it("resyncs when the OneBrain scope changes", async () => {
    const previousInput = buildOneBrainKnowledgeIntake(tenant, knowledge, {
      ONEBRAIN_SPACE_ID: "previous_space",
    });
    if (!previousInput) {
      throw new Error("expected knowledge intake input");
    }
    const inputs: BrainIntakeInput[] = [];
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
          contentHash: hashOneBrainIntake(previousInput),
        };
      },
      async recordOneBrainSyncSuccess() {},
      async recordOneBrainSyncFailure() {
        throw new Error("scope changes should not fail");
      },
    };
    const provider: BrainProvider = {
      kind: "onebrain",
      async intake(input) {
        inputs.push(input);
        return {
          job: {
            id: "job_scope_change",
            type: "service_intake",
            status: "queued",
            tenant_id: "acme",
            account_id: "acme",
            space_id: "sp_customer_service",
            result: null,
            error: "",
            attempts: 0,
            created_at: "",
            updated_at: "",
            completed_at: "",
          },
        };
      },
      async ask() {
        return { answer: "", chunksUsed: 0 };
      },
    };

    await expect(
      syncApprovedKnowledgeToOneBrain(store, provider, {
        env: { ONEBRAIN_SPACE_ID: "sp_customer_service" },
      }),
    ).resolves.toMatchObject({
      attempted: 1,
      synced: 1,
      skipped: 0,
    });
    expect(inputs[0]?.scope.spaceId).toBe("sp_customer_service");
    expect(inputs[0]?.scope.purpose).toBe("customer_service_inbox");
  });
});
