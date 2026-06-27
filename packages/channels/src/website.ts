import type {
  ChannelAdapter,
  DeliveryResult,
  NormalizedInboundEvent,
  OutboundMessage,
} from "./types";

export class WebsiteAdapter implements ChannelAdapter {
  readonly channel = "website" as const;
  readonly provider = "assaddar-widget";

  normalizeInbound(
    payload: unknown,
    tenantId: string,
  ): NormalizedInboundEvent[] {
    if (!isRecord(payload) || typeof payload.message !== "string") {
      return [];
    }

    const event: NormalizedInboundEvent = {
      tenantId,
      channel: this.channel,
      provider: this.provider,
      text: payload.message,
      raw: payload,
    };

    if (typeof payload.conversationId === "string") {
      event.externalConversationId = payload.conversationId;
    }

    if (typeof payload.visitorId === "string") {
      event.externalUserId = payload.visitorId;
    }

    return [event];
  }

  async sendMessage(message: OutboundMessage): Promise<DeliveryResult> {
    return {
      status: "sent",
      detail: `Website replies are returned directly by the API for tenant ${message.tenantId}.`,
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
