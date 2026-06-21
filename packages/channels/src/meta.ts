import type {
  ChannelAdapter,
  DeliveryResult,
  MessagingWindowPolicy,
  NormalizedInboundEvent,
  OutboundMessage,
  WebhookVerificationRequest
} from "./types";

export class WhatsAppCloudAdapter implements ChannelAdapter {
  readonly channel = "whatsapp" as const;
  readonly provider = "meta-whatsapp-cloud";

  constructor(private readonly verifyToken: string, private readonly accessToken?: string) {}

  verifyWebhook(request: WebhookVerificationRequest): string | null {
    if (request.mode === "subscribe" && request.verifyToken === this.verifyToken && request.challenge) {
      return request.challenge;
    }

    return null;
  }

  normalizeInbound(payload: unknown, tenantId: string): NormalizedInboundEvent[] {
    const events: NormalizedInboundEvent[] = [];
    const entries = isRecord(payload) && Array.isArray(payload.entry) ? payload.entry : [];

    for (const entry of entries) {
      const changes = isRecord(entry) && Array.isArray(entry.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = isRecord(change) && isRecord(change.value) ? change.value : undefined;
        const messages = value && Array.isArray(value.messages) ? value.messages : [];
        for (const message of messages) {
          if (!isRecord(message)) {
            continue;
          }

          const text = readNestedText(message, ["text", "body"]);
          const from = typeof message.from === "string" ? message.from : undefined;
          if (!text) {
            continue;
          }

          const event: NormalizedInboundEvent = {
            tenantId,
            channel: this.channel,
            provider: this.provider,
            text,
            raw: message
          };

          if (from) {
            event.externalUserId = from;
            event.externalConversationId = from;
          }

          events.push(event);
        }
      }
    }

    return events;
  }

  async sendMessage(message: OutboundMessage): Promise<DeliveryResult> {
    if (!this.accessToken) {
      return {
        status: "skipped",
        detail: "WHATSAPP_ACCESS_TOKEN is not configured."
      };
    }

    return {
      status: "queued",
      detail: "Meta WhatsApp Cloud API sender is intentionally credential-gated for MVP."
    };
  }
}

export class MetaMessengerAdapter implements ChannelAdapter {
  readonly provider = "meta-messenger-platform";

  constructor(
    readonly channel: "instagram" | "messenger",
    private readonly verifyToken: string,
    private readonly pageAccessToken?: string
  ) {}

  verifyWebhook(request: WebhookVerificationRequest): string | null {
    if (request.mode === "subscribe" && request.verifyToken === this.verifyToken && request.challenge) {
      return request.challenge;
    }

    return null;
  }

  normalizeInbound(payload: unknown, tenantId: string): NormalizedInboundEvent[] {
    const events: NormalizedInboundEvent[] = [];
    const entries = isRecord(payload) && Array.isArray(payload.entry) ? payload.entry : [];

    for (const entry of entries) {
      const messaging = isRecord(entry) && Array.isArray(entry.messaging) ? entry.messaging : [];
      for (const item of messaging) {
        if (!isRecord(item) || !isRecord(item.message)) {
          continue;
        }

        const text = typeof item.message.text === "string" ? item.message.text : undefined;
        const sender = isRecord(item.sender) && typeof item.sender.id === "string" ? item.sender.id : undefined;
        if (!text) {
          continue;
        }

        const event: NormalizedInboundEvent = {
          tenantId,
          channel: this.channel,
          provider: this.provider,
          text,
          raw: item
        };

        if (sender) {
          event.externalUserId = sender;
          event.externalConversationId = sender;
        }

        events.push(event);
      }
    }

    return events;
  }

  async sendMessage(message: OutboundMessage): Promise<DeliveryResult> {
    if (!this.pageAccessToken) {
      return {
        status: "skipped",
        detail: "MESSENGER_PAGE_ACCESS_TOKEN is not configured."
      };
    }

    return {
      status: "queued",
      detail: `Meta ${message.channel} sender is intentionally credential-gated for MVP.`
    };
  }
}

export const meta24HourMessagingWindow: MessagingWindowPolicy = {
  channel: "messenger",
  provider: "meta-messenger-platform",
  canRespond(lastUserMessageAt, now) {
    return now.getTime() - lastUserMessageAt.getTime() <= 24 * 60 * 60 * 1000;
  },
  reason: "Meta Messenger and Instagram messaging require awareness of the standard response window."
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNestedText(value: Record<string, unknown>, path: string[]): string | undefined {
  let current: unknown = value;
  for (const segment of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[segment];
  }

  return typeof current === "string" ? current : undefined;
}
