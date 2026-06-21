import type { ChannelAdapter, DeliveryResult, NormalizedInboundEvent, OutboundMessage } from "./types";

export class TikTokBusinessMessagingMockAdapter implements ChannelAdapter {
  readonly channel = "tiktok" as const;
  readonly provider = "tiktok-business-messaging-mock";

  normalizeInbound(payload: unknown, tenantId: string): NormalizedInboundEvent[] {
    if (!isRecord(payload) || typeof payload.text !== "string") {
      return [];
    }

    const event: NormalizedInboundEvent = {
      tenantId,
      channel: this.channel,
      provider: this.provider,
      text: payload.text,
      raw: payload
    };

    if (typeof payload.threadId === "string") {
      event.externalConversationId = payload.threadId;
    }

    if (typeof payload.userId === "string") {
      event.externalUserId = payload.userId;
    }

    return [event];
  }

  async sendMessage(_message: OutboundMessage): Promise<DeliveryResult> {
    return {
      status: "skipped",
      detail: "TikTok Business Messaging is mocked until app credentials and partner access are available."
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
