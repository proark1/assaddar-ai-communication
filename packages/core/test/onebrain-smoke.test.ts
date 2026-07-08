import { describe, expect, it } from "vitest";
import {
  runOneBrainSmoke,
  ONEBRAIN_COMMUNICATION_APP_ID,
  ONEBRAIN_KNOWLEDGE_PURPOSE,
} from "../src";

describe("runOneBrainSmoke", () => {
  it("requires service URL and key without echoing secrets", async () => {
    await expect(
      runOneBrainSmoke({
        ONEBRAIN_API_BASE_URL: "https://onebrain.example",
      }),
    ).rejects.toThrow("Missing OneBrain smoke config: ONEBRAIN_SERVICE_KEY");
  });

  it("checks capabilities with the expected communication scope", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          tenant_id: "tenant",
          account_id: "acme",
          app_id: ONEBRAIN_COMMUNICATION_APP_ID,
          scopes: ["service"],
          space_ids: ["sp_customer_service"],
          purposes: [ONEBRAIN_KNOWLEDGE_PURPOSE],
        }),
      );

    await expect(
      runOneBrainSmoke(
        {
          ONEBRAIN_API_BASE_URL: "https://onebrain.example",
          ONEBRAIN_SERVICE_KEY: "obk_secret",
          ONEBRAIN_SPACE_ID: "sp_customer_service",
        },
        { fetchImpl },
      ),
    ).resolves.toMatchObject({
      expected: {
        accountId: "acme",
        appId: ONEBRAIN_COMMUNICATION_APP_ID,
        purpose: ONEBRAIN_KNOWLEDGE_PURPOSE,
        spaceId: "sp_customer_service",
      },
      intake: null,
    });
  });

  it("rejects capabilities for another app", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          tenant_id: "tenant",
          app_id: "another-app",
          purposes: [ONEBRAIN_KNOWLEDGE_PURPOSE],
        }),
      );

    await expect(
      runOneBrainSmoke(
        {
          ONEBRAIN_API_BASE_URL: "https://onebrain.example",
          ONEBRAIN_SERVICE_KEY: "obk_secret",
        },
        { fetchImpl },
      ),
    ).rejects.toThrow("OneBrain smoke app mismatch");
  });

  it("sends synthetic intake only when explicitly enabled", async () => {
    const calls: Array<{ body?: string; url: string }> = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      calls.push({ body: String(init?.body ?? ""), url: String(url) });
      if (String(url).endsWith("/api/service/capabilities")) {
        return new Response(
          JSON.stringify({
            tenant_id: "tenant",
            account_id: "acme",
            app_id: ONEBRAIN_COMMUNICATION_APP_ID,
            space_ids: ["sp_customer_service"],
            purposes: [ONEBRAIN_KNOWLEDGE_PURPOSE],
          }),
        );
      }
      return new Response(
        JSON.stringify({
          id: "job_1",
          type: "service_intake",
          status: "queued",
          tenant_id: "tenant",
          account_id: "acme",
        }),
        { status: 202 },
      );
    };

    const result = await runOneBrainSmoke(
      {
        ONEBRAIN_API_BASE_URL: "https://onebrain.example",
        ONEBRAIN_SERVICE_KEY: "obk_secret",
        ONEBRAIN_SMOKE_INTAKE: "true",
      },
      {
        fetchImpl,
        now: () => new Date("2026-07-08T12:00:00.000Z"),
      },
    );

    expect(result.intake).toEqual({
      accepted: "job",
      id: "job_1",
      status: "queued",
    });
    expect(calls).toHaveLength(2);
    expect(JSON.parse(calls[1]?.body ?? "{}")).toMatchObject({
      account_id: "acme",
      app_id: ONEBRAIN_COMMUNICATION_APP_ID,
      intent: "knowledge_update",
      purpose: ONEBRAIN_KNOWLEDGE_PURPOSE,
      source_ref: "communication:smoke:2026-07-08T12:00:00.000Z",
    });
  });
});
