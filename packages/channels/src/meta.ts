import type {
  ChannelAdapter,
  DeliveryResult,
  DeliveryStatusUpdate,
  MessagingWindowPolicy,
  NormalizedInboundEvent,
  OutboundMessage,
  WebhookVerificationRequest,
} from "./types";

const META_GRAPH_TIMEOUT_MS = 10_000;

export class WhatsAppCloudAdapter implements ChannelAdapter {
  readonly channel = "whatsapp" as const;
  readonly provider = "meta-whatsapp-cloud";

  constructor(
    private readonly verifyToken: string,
    private readonly accessToken?: string,
    private readonly graphApiVersion = "v25.0",
  ) {}

  verifyWebhook(request: WebhookVerificationRequest): string | null {
    if (
      request.mode === "subscribe" &&
      request.verifyToken === this.verifyToken &&
      request.challenge
    ) {
      return request.challenge;
    }

    return null;
  }

  normalizeInbound(
    payload: unknown,
    tenantId: string,
  ): NormalizedInboundEvent[] {
    const events: NormalizedInboundEvent[] = [];
    const entries =
      isRecord(payload) && Array.isArray(payload.entry) ? payload.entry : [];

    for (const entry of entries) {
      const changes =
        isRecord(entry) && Array.isArray(entry.changes) ? entry.changes : [];
      for (const change of changes) {
        const value =
          isRecord(change) && isRecord(change.value) ? change.value : undefined;
        const messages =
          value && Array.isArray(value.messages) ? value.messages : [];
        const metadata =
          value && isRecord(value.metadata) ? value.metadata : undefined;
        const phoneNumberId =
          typeof metadata?.phone_number_id === "string"
            ? metadata.phone_number_id
            : undefined;
        for (const message of messages) {
          if (!isRecord(message)) {
            continue;
          }

          const text = readNestedText(message, ["text", "body"]);
          const from =
            typeof message.from === "string" ? message.from : undefined;
          if (!text) {
            continue;
          }

          const event: NormalizedInboundEvent = {
            tenantId,
            channel: this.channel,
            provider: this.provider,
            text,
            raw: {
              message,
              value,
            },
          };

          if (typeof message.id === "string") {
            event.providerEventId = message.id;
          }

          if (phoneNumberId) {
            event.providerAccountId = phoneNumberId;
          }

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

  normalizeStatusUpdates(payload: unknown): DeliveryStatusUpdate[] {
    const updates: DeliveryStatusUpdate[] = [];
    const entries =
      isRecord(payload) && Array.isArray(payload.entry) ? payload.entry : [];

    for (const entry of entries) {
      const changes =
        isRecord(entry) && Array.isArray(entry.changes) ? entry.changes : [];
      for (const change of changes) {
        const value =
          isRecord(change) && isRecord(change.value) ? change.value : undefined;
        const statuses =
          value && Array.isArray(value.statuses) ? value.statuses : [];
        for (const status of statuses) {
          if (!isRecord(status)) {
            continue;
          }
          const id = typeof status.id === "string" ? status.id : undefined;
          const statusName = normalizeMetaDeliveryStatus(status.status);
          if (!id || !statusName) {
            continue;
          }
          const update: DeliveryStatusUpdate = {
            providerMessageId: id,
            status: statusName,
          };
          if (typeof status.timestamp === "string") {
            update.timestamp = status.timestamp;
          }
          if (typeof status.recipient_id === "string") {
            update.recipientId = status.recipient_id;
          }
          const error = readFirstMetaError(status.errors);
          if (error) {
            update.error = error;
          }
          updates.push(update);
        }
      }
    }

    return updates;
  }

  async sendMessage(message: OutboundMessage): Promise<DeliveryResult> {
    if (!this.accessToken) {
      return {
        status: "skipped",
        detail: "WHATSAPP_ACCESS_TOKEN is not configured.",
      };
    }
    if (!message.providerAccountId) {
      return {
        status: "skipped",
        detail: "WhatsApp phone number ID is not mapped to this tenant.",
      };
    }
    if (!message.externalUserId) {
      return {
        status: "skipped",
        detail: "WhatsApp recipient is missing.",
      };
    }

    let response: Response;
    try {
      response = await fetch(
        `https://graph.facebook.com/${this.graphApiVersion}/${message.providerAccountId}/messages`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${this.accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: message.externalUserId,
            type: "text",
            text: {
              preview_url: false,
              body: truncateMessage(message.text),
            },
          }),
          signal: AbortSignal.timeout(META_GRAPH_TIMEOUT_MS),
        },
      );
    } catch (error) {
      // Network error or timeout: a real, transient failure. Report it as
      // `failed` (retryable) instead of throwing, so the caller records a
      // truthful delivery outcome and the retry worker can re-attempt it.
      return {
        status: "failed",
        retryable: true,
        detail: `WhatsApp send errored: ${
          error instanceof Error ? error.message : String(error)
        }.`,
      };
    }

    if (!response.ok) {
      return {
        status: "failed",
        retryable: isRetryableHttpStatus(response.status),
        detail: `WhatsApp send failed with ${response.status}.`,
      };
    }

    const body = (await response.json().catch(() => ({}))) as {
      messages?: Array<{ id?: string }>;
    };

    const result: DeliveryResult = {
      status: "sent",
    };
    if (body.messages?.[0]?.id) {
      result.providerMessageId = body.messages[0].id;
    }
    return result;
  }
}

export class MetaMessengerAdapter implements ChannelAdapter {
  readonly provider = "meta-messenger-platform";

  constructor(
    readonly channel: "instagram" | "messenger",
    private readonly verifyToken: string,
    private readonly pageAccessToken?: string,
    private readonly graphApiVersion = "v25.0",
  ) {}

  verifyWebhook(request: WebhookVerificationRequest): string | null {
    if (
      request.mode === "subscribe" &&
      request.verifyToken === this.verifyToken &&
      request.challenge
    ) {
      return request.challenge;
    }

    return null;
  }

  normalizeInbound(
    payload: unknown,
    tenantId: string,
  ): NormalizedInboundEvent[] {
    const events: NormalizedInboundEvent[] = [];
    const entries =
      isRecord(payload) && Array.isArray(payload.entry) ? payload.entry : [];

    for (const entry of entries) {
      const accountId =
        isRecord(entry) && typeof entry.id === "string" ? entry.id : undefined;
      const messaging =
        isRecord(entry) && Array.isArray(entry.messaging)
          ? entry.messaging
          : [];
      for (const item of messaging) {
        if (!isRecord(item) || !isRecord(item.message)) {
          continue;
        }

        const text =
          typeof item.message.text === "string" ? item.message.text : undefined;
        const sender =
          isRecord(item.sender) && typeof item.sender.id === "string"
            ? item.sender.id
            : undefined;
        if (!text) {
          continue;
        }

        const event: NormalizedInboundEvent = {
          tenantId,
          channel: this.channel,
          provider: this.provider,
          text,
          raw: item,
        };

        if (typeof item.message.mid === "string") {
          event.providerEventId = item.message.mid;
        }

        if (accountId) {
          event.providerAccountId = accountId;
        }

        if (sender) {
          event.externalUserId = sender;
          event.externalConversationId = sender;
        }

        events.push(event);
      }
    }

    return events;
  }

  normalizeStatusUpdates(payload: unknown): DeliveryStatusUpdate[] {
    const updates: DeliveryStatusUpdate[] = [];
    const entries =
      isRecord(payload) && Array.isArray(payload.entry) ? payload.entry : [];

    for (const entry of entries) {
      const messaging =
        isRecord(entry) && Array.isArray(entry.messaging)
          ? entry.messaging
          : [];
      for (const item of messaging) {
        // Messenger reports delivery per message id (`delivery.mids`). Read
        // receipts are watermark-based (a timestamp, not message ids), so they
        // cannot be mapped to a specific stored delivery and are skipped here.
        const delivery =
          isRecord(item) && isRecord(item.delivery) ? item.delivery : undefined;
        const mids =
          delivery && Array.isArray(delivery.mids) ? delivery.mids : [];
        for (const mid of mids) {
          if (typeof mid === "string") {
            updates.push({ providerMessageId: mid, status: "delivered" });
          }
        }
      }
    }

    return updates;
  }

  async sendMessage(message: OutboundMessage): Promise<DeliveryResult> {
    if (!this.pageAccessToken) {
      return {
        status: "skipped",
        detail: "MESSENGER_PAGE_ACCESS_TOKEN is not configured.",
      };
    }
    if (!message.externalUserId) {
      return {
        status: "skipped",
        detail: `Meta ${message.channel} recipient is missing.`,
      };
    }

    let response: Response;
    try {
      response = await fetch(
        `https://graph.facebook.com/${this.graphApiVersion}/me/messages`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${this.pageAccessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            recipient: {
              id: message.externalUserId,
            },
            message: {
              text: truncateMessage(message.text),
            },
          }),
          signal: AbortSignal.timeout(META_GRAPH_TIMEOUT_MS),
        },
      );
    } catch (error) {
      return {
        status: "failed",
        retryable: true,
        detail: `Meta ${message.channel} send errored: ${
          error instanceof Error ? error.message : String(error)
        }.`,
      };
    }

    if (!response.ok) {
      return {
        status: "failed",
        retryable: isRetryableHttpStatus(response.status),
        detail: `Meta ${message.channel} send failed with ${response.status}.`,
      };
    }

    const body = (await response.json().catch(() => ({}))) as {
      message_id?: string;
    };

    const result: DeliveryResult = {
      status: "sent",
    };
    if (body.message_id) {
      result.providerMessageId = body.message_id;
    }
    return result;
  }
}

export const meta24HourMessagingWindow: MessagingWindowPolicy = {
  channel: "messenger",
  provider: "meta-messenger-platform",
  canRespond(lastUserMessageAt, now) {
    return now.getTime() - lastUserMessageAt.getTime() <= 24 * 60 * 60 * 1000;
  },
  reason:
    "Meta Messenger and Instagram messaging require awareness of the standard response window.",
};

/**
 * A Graph API rejection is worth retrying only when it is transient: rate
 * limiting (429) or a server-side error (5xx). Other 4xx responses (bad
 * recipient, invalid token, policy violation) are permanent — retrying would
 * just fail again — so they are marked non-retryable.
 */
export function isRetryableHttpStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Map a Meta status string onto the delivery lifecycle we track, ignoring
 * states that do not advance it (e.g. "deleted", "warning").
 */
function normalizeMetaDeliveryStatus(
  value: unknown,
): DeliveryStatusUpdate["status"] | undefined {
  if (
    value === "sent" ||
    value === "delivered" ||
    value === "read" ||
    value === "failed"
  ) {
    return value;
  }
  return undefined;
}

function readFirstMetaError(
  value: unknown,
): DeliveryStatusUpdate["error"] | undefined {
  const first = Array.isArray(value) ? value[0] : undefined;
  if (!isRecord(first)) {
    return undefined;
  }
  const error: NonNullable<DeliveryStatusUpdate["error"]> = {};
  if (typeof first.code === "number") {
    error.code = first.code;
  }
  if (typeof first.title === "string") {
    error.title = first.title;
  }
  const errorData = isRecord(first.error_data) ? first.error_data : undefined;
  const detail =
    typeof first.message === "string"
      ? first.message
      : typeof errorData?.details === "string"
        ? errorData.details
        : undefined;
  if (detail) {
    error.detail = detail;
  }
  return Object.keys(error).length > 0 ? error : undefined;
}

function readNestedText(
  value: Record<string, unknown>,
  path: string[],
): string | undefined {
  let current: unknown = value;
  for (const segment of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[segment];
  }

  return typeof current === "string" ? current : undefined;
}

function truncateMessage(value: string) {
  return value.length > 3900 ? `${value.slice(0, 3897)}...` : value;
}
