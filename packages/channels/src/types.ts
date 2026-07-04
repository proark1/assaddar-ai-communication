import { ChannelSchema, type Channel } from "@assaddar/core";
import { z } from "zod";

export const NormalizedInboundEventSchema = z.object({
  tenantId: z.string().uuid(),
  channel: ChannelSchema,
  provider: z.string().min(1),
  providerEventId: z.string().min(1).optional(),
  providerAccountId: z.string().min(1).optional(),
  externalConversationId: z.string().min(1).optional(),
  externalUserId: z.string().min(1).optional(),
  text: z.string().min(1).max(4000),
  raw: z.record(z.string(), z.unknown()).default({}),
});

export type NormalizedInboundEvent = z.infer<
  typeof NormalizedInboundEventSchema
>;

export type OutboundMessage = {
  tenantId: string;
  channel: Channel;
  provider: string;
  providerAccountId?: string;
  externalConversationId?: string;
  externalUserId?: string;
  text: string;
};

export type DeliveryResult = {
  providerMessageId?: string;
  /**
   * - `sent`    — accepted by the provider.
   * - `queued`  — accepted but not yet confirmed delivered.
   * - `skipped` — intentionally not sent (missing credentials/recipient, or a
   *               channel policy blocked it). NOT a failure; never retried.
   * - `failed`  — we tried to send and the provider rejected it or the call
   *               errored. Distinct from `skipped` so real problems are visible
   *               in analytics and eligible for retry.
   */
  status: "sent" | "queued" | "skipped" | "failed";
  /**
   * Only meaningful for `failed`. `true` for transient errors (network/timeout,
   * HTTP 429/5xx) that are worth retrying; `false`/undefined for permanent ones
   * (HTTP 4xx other than 429) that a retry cannot fix.
   */
  retryable?: boolean;
  detail?: string;
};

export type WebhookVerificationRequest = {
  mode?: string;
  verifyToken?: string;
  challenge?: string;
};

export type ChannelAdapter = {
  channel: Channel;
  provider: string;
  verifyWebhook?(request: WebhookVerificationRequest): string | null;
  normalizeInbound(
    payload: unknown,
    tenantId: string,
  ): NormalizedInboundEvent[];
  sendMessage(message: OutboundMessage): Promise<DeliveryResult>;
};

export type MessagingWindowPolicy = {
  channel: Channel;
  provider: string;
  canRespond: (lastUserMessageAt: Date, now: Date) => boolean;
  reason: string;
};
