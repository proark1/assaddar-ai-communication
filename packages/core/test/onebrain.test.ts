import { describe, expect, it } from "vitest";
import {
  createOneBrainProvider,
  ONEBRAIN_COMMUNICATION_APP_ID,
  ONEBRAIN_KNOWLEDGE_PURPOSE,
  OneBrainServiceClient,
  OneBrainServiceError,
  oneBrainSourceRef,
} from "../src/onebrain";

describe("OneBrainServiceClient", () => {
  it("posts intake records with scoped communication metadata", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = new OneBrainServiceClient({
      baseUrl: "https://onebrain.example/",
      serviceKey: "obk_test",
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response(
          JSON.stringify({
            record: {
              id: "rec_1",
              tenant_id: "tenant",
              account_id: "acme",
              space_id: "sp_customer_service",
              app_id: "communication",
              purpose: "knowledge_management",
              source: "communication",
              source_ref: "communication:tenant:t1:knowledge:k1",
              record_type: "document",
              intent: "knowledge_update",
              classification: "internal",
              confidence: 0.8,
              status: "stored",
              title: "Hours",
              summary: "Opening hours",
              extracted_facts: {},
              metadata: {},
              created_at: "2026-07-08T00:00:00Z",
            },
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
    });

    const result = await client.intake({
      scope: {
        tenantId: "t1",
        accountId: "acme",
        spaceId: "sp_customer_service",
      },
      title: "Hours",
      content: "Open 09:00-17:00.",
      sourceRef: oneBrainSourceRef({
        tenantId: "t1",
        type: "knowledge",
        id: "k1",
      }),
    });

    expect(result.record.id).toBe("rec_1");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://onebrain.example/api/service/intake");
    expect(calls[0]?.init.headers).toMatchObject({
      authorization: "Bearer obk_test",
      "content-type": "application/json",
    });
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      account_id: "acme",
      space_id: "sp_customer_service",
      app_id: ONEBRAIN_COMMUNICATION_APP_ID,
      purpose: ONEBRAIN_KNOWLEDGE_PURPOSE,
      source: "communication",
      source_ref: "communication:tenant:t1:knowledge:k1",
      record_type: "document",
      intent: "knowledge_update",
      title: "Hours",
      content: "Open 09:00-17:00.",
    });
  });

  it("maps service ask responses to camel case", async () => {
    const client = new OneBrainServiceClient({
      baseUrl: "https://onebrain.example",
      serviceKey: "obk_test",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            answer: "Use the approved answer.",
            chunks_used: 2,
          }),
        ),
    });

    await expect(
      client.ask({
        scope: { tenantId: "t1", accountId: "acme" },
        question: "What should I say?",
      }),
    ).resolves.toEqual({
      answer: "Use the approved answer.",
      chunksUsed: 2,
    });
  });

  it("throws a typed error for non-2xx responses", async () => {
    const client = new OneBrainServiceClient({
      baseUrl: "https://onebrain.example",
      serviceKey: "obk_test",
      fetchImpl: async () => new Response("forbidden", { status: 403 }),
    });

    await expect(client.capabilities()).rejects.toMatchObject({
      name: "OneBrainServiceError",
      status: 403,
      detail: "forbidden",
    });
  });
});

describe("createOneBrainProvider", () => {
  it("is dormant without a service URL and key", () => {
    expect(createOneBrainProvider({})).toBeNull();
    expect(
      createOneBrainProvider({ ONEBRAIN_API_BASE_URL: "https://onebrain" }),
    ).toBeNull();
  });

  it("creates a provider when required env vars are present", () => {
    expect(
      createOneBrainProvider({
        ONEBRAIN_API_BASE_URL: "https://onebrain",
        ONEBRAIN_SERVICE_KEY: "obk_test",
      }),
    ).not.toBeNull();
  });
});
