import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isRetryableHttpStatus,
  MetaMessengerAdapter,
  WhatsAppCloudAdapter,
} from "../src/meta";
import type { OutboundMessage } from "../src/types";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

const whatsappMessage: OutboundMessage = {
  tenantId: "11111111-1111-1111-1111-111111111111",
  channel: "whatsapp",
  provider: "meta-whatsapp-cloud",
  providerAccountId: "phone-number-1",
  externalUserId: "491701234567",
  text: "Hallo",
};

function mockFetch(impl: () => Promise<Response> | Response) {
  const fn = vi.fn(async () => impl());
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

describe("isRetryableHttpStatus", () => {
  it("treats 429 and 5xx as retryable, other 4xx as permanent", () => {
    expect(isRetryableHttpStatus(429)).toBe(true);
    expect(isRetryableHttpStatus(500)).toBe(true);
    expect(isRetryableHttpStatus(503)).toBe(true);
    expect(isRetryableHttpStatus(400)).toBe(false);
    expect(isRetryableHttpStatus(401)).toBe(false);
    expect(isRetryableHttpStatus(404)).toBe(false);
  });
});

describe("WhatsAppCloudAdapter.sendMessage delivery outcomes", () => {
  it("returns sent with the provider message id on success", async () => {
    mockFetch(
      () =>
        new Response(JSON.stringify({ messages: [{ id: "wamid.ok" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const adapter = new WhatsAppCloudAdapter("verify", "access-token");
    const result = await adapter.sendMessage(whatsappMessage);
    expect(result).toMatchObject({
      status: "sent",
      providerMessageId: "wamid.ok",
    });
  });

  it("maps a 5xx rejection to failed + retryable (not skipped)", async () => {
    mockFetch(() => new Response("upstream", { status: 503 }));
    const adapter = new WhatsAppCloudAdapter("verify", "access-token");
    const result = await adapter.sendMessage(whatsappMessage);
    expect(result.status).toBe("failed");
    expect(result.retryable).toBe(true);
  });

  it("maps a 4xx rejection to failed + non-retryable", async () => {
    mockFetch(() => new Response("bad request", { status: 400 }));
    const adapter = new WhatsAppCloudAdapter("verify", "access-token");
    const result = await adapter.sendMessage(whatsappMessage);
    expect(result.status).toBe("failed");
    expect(result.retryable).toBe(false);
  });

  it("catches a network error and reports failed + retryable instead of throwing", async () => {
    mockFetch(() => {
      throw new Error("network down");
    });
    const adapter = new WhatsAppCloudAdapter("verify", "access-token");
    const result = await adapter.sendMessage(whatsappMessage);
    expect(result.status).toBe("failed");
    expect(result.retryable).toBe(true);
    expect(result.detail).toContain("network down");
  });

  it("keeps genuine no-sends as skipped, not failed", async () => {
    const noToken = new WhatsAppCloudAdapter("verify");
    expect((await noToken.sendMessage(whatsappMessage)).status).toBe("skipped");

    const adapter = new WhatsAppCloudAdapter("verify", "access-token");
    const { externalUserId: _omitted, ...withoutRecipient } = whatsappMessage;
    void _omitted;
    const noRecipient = await adapter.sendMessage(withoutRecipient);
    expect(noRecipient.status).toBe("skipped");
  });
});

describe("MetaMessengerAdapter.sendMessage delivery outcomes", () => {
  it("maps a 5xx rejection to failed + retryable", async () => {
    mockFetch(() => new Response("upstream", { status: 500 }));
    const adapter = new MetaMessengerAdapter(
      "messenger",
      "verify",
      "page-token",
    );
    const result = await adapter.sendMessage({
      tenantId: "11111111-1111-1111-1111-111111111111",
      channel: "messenger",
      provider: "meta-messenger-platform",
      externalUserId: "psid-1",
      text: "Hallo",
    });
    expect(result.status).toBe("failed");
    expect(result.retryable).toBe(true);
  });
});

describe("WhatsAppCloudAdapter.normalizeStatusUpdates", () => {
  const statusPayload = {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: "phone-number-1" },
              statuses: [
                {
                  id: "wamid.1",
                  status: "delivered",
                  timestamp: "1700000000",
                  recipient_id: "491701234567",
                },
                {
                  id: "wamid.2",
                  status: "failed",
                  errors: [{ code: 131026, title: "Message undeliverable" }],
                },
                { id: "wamid.3", status: "deleted" },
              ],
            },
          },
        ],
      },
    ],
  };

  it("parses delivered/failed statuses and ignores unknown states", () => {
    const adapter = new WhatsAppCloudAdapter("verify", "access-token");
    expect(adapter.normalizeStatusUpdates(statusPayload)).toEqual([
      {
        providerMessageId: "wamid.1",
        status: "delivered",
        timestamp: "1700000000",
        recipientId: "491701234567",
      },
      {
        providerMessageId: "wamid.2",
        status: "failed",
        error: { code: 131026, title: "Message undeliverable" },
      },
    ]);
  });

  it("returns nothing for a message (non-status) payload", () => {
    const adapter = new WhatsAppCloudAdapter("verify", "access-token");
    expect(adapter.normalizeStatusUpdates({ entry: [] })).toEqual([]);
  });
});

describe("MetaMessengerAdapter.normalizeStatusUpdates", () => {
  it("maps delivery mids to delivered updates and skips read watermarks", () => {
    const adapter = new MetaMessengerAdapter(
      "messenger",
      "verify",
      "page-token",
    );
    const payload = {
      entry: [
        {
          id: "page-1",
          messaging: [
            { delivery: { mids: ["mid.a", "mid.b"], watermark: 1700000000 } },
            { read: { watermark: 1700000000 } },
          ],
        },
      ],
    };
    expect(adapter.normalizeStatusUpdates(payload)).toEqual([
      { providerMessageId: "mid.a", status: "delivered" },
      { providerMessageId: "mid.b", status: "delivered" },
    ]);
  });
});
