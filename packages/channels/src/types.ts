import { ChannelSchema, type Channel } from "@assaddar/core";
import { z } from "zod";

export const NormalizedInboundEventSchema = z.object({
  tenantId: z.string().uuid(),
  channel: ChannelSchema,
  provider: z.string().min(1),
  providerAccountId: z.string().min(1).optional(),
  externalConversationId: z.string().min(1).optional(),
  externalUserId: z.string().min(1).optional(),
  text: z.string().min(1).max(4000),
  raw: z.record(z.unknown()).default({}),
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
  status: "sent" | "queued" | "skipped";
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
