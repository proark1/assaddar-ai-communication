import { describe, expect, it } from "vitest";
import {
  createOneBrainProvider,
  ONEBRAIN_COMMUNICATION_APP_ID,
  ONEBRAIN_CUSTOMER_SERVICE_ANSWER_PURPOSE,
  ONEBRAIN_KNOWLEDGE_PURPOSE,
  OneBrainServiceClient,
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
              purpose: ONEBRAIN_KNOWLEDGE_PURPOSE,
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
        appId: "not-communication",
        purpose: "not-canonical",
      },
      title: "Hours",
      content: "Open 09:00-17:00.",
      sourceRef: oneBrainSourceRef({
        tenantId: "t1",
        type: "knowledge",
        id: "k1",
      }),
    });

    expect("record" in result).toBe(true);
    if (!("record" in result)) {
      throw new Error("expected immediate intake record");
    }
    expect(result.record.id).toBe("rec_1");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://onebrain.example/api/service/intake");
    expect(calls[0]?.init.headers).toMatchObject({
      Authorization: "Bearer obk_test",
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
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = new OneBrainServiceClient({
      baseUrl: "https://onebrain.example",
      serviceKey: "obk_test",
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response(
          JSON.stringify({
            answer: "Use the approved answer.",
            chunks_used: 2,
          }),
        );
      },
    });

    await expect(
      client.ask({
        scope: {
          tenantId: "t1",
          accountId: "acme",
          spaceId: "sp_customer_service",
          appId: "not-communication",
          purpose: "not-canonical",
        },
        question: "What should I say?",
      }),
    ).resolves.toEqual({
      answer: "Use the approved answer.",
      chunksUsed: 2,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://onebrain.example/api/service/ask");
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      account_id: "acme",
      space_id: "sp_customer_service",
      app_id: ONEBRAIN_COMMUNICATION_APP_ID,
      purpose: ONEBRAIN_CUSTOMER_SERVICE_ANSWER_PURPOSE,
      question: "What should I say?",
    });
  });

  it("accepts async intake job responses", async () => {
    const client = new OneBrainServiceClient({
      baseUrl: "https://onebrain.example",
      serviceKey: "obk_test",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            id: "job_1",
            type: "service_intake",
            status: "queued",
            tenant_id: "acme",
            account_id: "acme",
            space_id: "sp_customer_service",
            attempts: 0,
          }),
          { status: 202 },
        ),
    });

    await expect(
      client.intake({
        scope: {
          tenantId: "t1",
          accountId: "acme",
          spaceId: "sp_customer_service",
        },
        content: "Open 09:00-17:00.",
      }),
    ).resolves.toMatchObject({
      job: {
        id: "job_1",
        type: "service_intake",
        status: "queued",
        tenant_id: "acme",
      },
    });
  });

  it("surfaces intake failures instead of falling back to legacy capture", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = new OneBrainServiceClient({
      baseUrl: "https://onebrain.example",
      serviceKey: "obk_test",
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        if (String(url).endsWith("/api/service/intake")) {
          return new Response('{"detail":"Not Found"}', { status: 404 });
        }
        throw new Error("legacy capture should not be called");
      },
    });

    await expect(
      client.intake({
        scope: {
          tenantId: "t1",
          accountId: "acme",
          spaceId: "sp_customer_service",
        },
        title: "Hours",
        content: "Open 09:00-17:00.",
      }),
    ).rejects.toMatchObject({
      name: "OneBrainServiceError",
      status: 404,
    });

    expect(calls.map((call) => call.url)).toEqual([
      "https://onebrain.example/api/service/intake",
    ]);
  });

  it("erases a record by source_ref through the records delete endpoint", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = new OneBrainServiceClient({
      baseUrl: "https://onebrain.example",
      serviceKey: "obk_test",
      accountId: "acme",
      spaceId: "sp_customer_service",
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response(
          JSON.stringify({
            source_ref: "communication:tenant:t1:knowledge:k1",
            deleted: 1,
            audit_event_id: "aud_1",
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
    });

    await expect(
      client.deleteRecord({
        sourceRef: "communication:tenant:t1:knowledge:k1",
      }),
    ).resolves.toEqual({
      source_ref: "communication:tenant:t1:knowledge:k1",
      deleted: 1,
      audit_event_id: "aud_1",
    });
    expect(calls[0]?.url).toBe(
      "https://onebrain.example/api/service/records/delete",
    );
    // account_id is defaulted from config (a mismatch would fail loud); space_id
    // is intentionally omitted so a drifted config can't silently miss the delete.
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      source_ref: "communication:tenant:t1:knowledge:k1",
      account_id: "acme",
    });
  });

  it("requires explicit account and space scope before ask or intake", async () => {
    const client = new OneBrainServiceClient({
      baseUrl: "https://onebrain.example",
      serviceKey: "obk_test",
      fetchImpl: async () => {
        throw new Error("request should not be sent");
      },
    });

    await expect(
      client.ask({
        scope: { tenantId: "t1", accountId: "acme" },
        question: "What should I say?",
      }),
    ).rejects.toMatchObject({
      name: "OneBrainConfigurationError",
      message: "Missing OneBrain service scope: space_id",
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
  it("is dormant without canonical service URL, key, and space", () => {
    expect(createOneBrainProvider({})).toBeNull();
    expect(
      createOneBrainProvider({ ONEBRAIN_API_BASE_URL: "https://onebrain" }),
    ).toBeNull();
    expect(
      createOneBrainProvider({
        ONEBRAIN_API_BASE_URL: "https://onebrain",
        ONEBRAIN_SERVICE_KEY: "obk_test",
      }),
    ).toBeNull();
    const legacyEnv = {
      ONEBRAIN_URL: "https://onebrain",
      ONEBRAIN_SERVICE_KEY: "obk_test",
      ONEBRAIN_SPACE_ID: "sp_customer_service",
    };
    expect(createOneBrainProvider(legacyEnv)).toBeNull();
  });

  it("creates a provider when required env vars are present", () => {
    expect(
      createOneBrainProvider({
        ONEBRAIN_API_BASE_URL: "https://onebrain",
        ONEBRAIN_SERVICE_KEY: "obk_test",
        ONEBRAIN_SPACE_ID: "sp_customer_service",
      }),
    ).not.toBeNull();
  });
});
