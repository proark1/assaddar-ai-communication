import {
  adapterForChannel,
  type ChannelAdapterRegistry,
} from "@assaddar/channels";
import type { RetryableDelivery } from "@assaddar/db";

/**
 * The slice of the repository the retry worker needs. Kept minimal so the job
 * can be unit-tested with a light fake instead of a live database.
 */
export type DeliveryRetryRepository = {
  listRetryableDeliveries(options: {
    before: Date;
    maxAttempts: number;
    limit: number;
  }): Promise<RetryableDelivery[]>;
  applyDeliveryRetryOutcome(
    tenantId: string,
    deliveryId: string,
    outcome: {
      succeeded: boolean;
      attempts: number;
      exhausted?: boolean;
      providerMessageId?: string | null;
      detail?: string | null;
    },
  ): Promise<void>;
};

export type RetryFailedDeliveriesOptions = {
  now: Date;
  /** Give up after this many total send attempts (including the original). */
  maxAttempts?: number;
  /** Only retry deliveries whose last attempt is older than this many ms. */
  retryAfterMs?: number;
  /** Cap the number of deliveries processed per run. */
  batchSize?: number;
  log?: (message: string) => void;
};

export type RetryFailedDeliveriesResult = {
  considered: number;
  resent: number;
  stillFailing: number;
  exhausted: number;
};

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_RETRY_AFTER_MS = 60_000;
const DEFAULT_BATCH_SIZE = 50;

/**
 * Re-send outbound replies whose original delivery failed transiently. Each
 * delivery carries the recipient routing and the reply text, so we rebuild the
 * outbound message and push it back through the same channel adapter. Success
 * flips the row to "sent"; a repeated failure bumps the attempt counter until
 * `maxAttempts`, after which the row is left failed and no longer swept.
 */
export async function retryFailedDeliveries(
  repository: DeliveryRetryRepository,
  registry: ChannelAdapterRegistry,
  options: RetryFailedDeliveriesOptions,
): Promise<RetryFailedDeliveriesResult> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const retryAfterMs = options.retryAfterMs ?? DEFAULT_RETRY_AFTER_MS;
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const log = options.log ?? (() => {});

  const before = new Date(options.now.getTime() - retryAfterMs);
  const deliveries = await repository.listRetryableDeliveries({
    before,
    maxAttempts,
    limit: batchSize,
  });

  const result: RetryFailedDeliveriesResult = {
    considered: deliveries.length,
    resent: 0,
    stillFailing: 0,
    exhausted: 0,
  };

  for (const delivery of deliveries) {
    const adapter = adapterForChannel(registry, delivery.channel);
    if (!adapter) {
      // No outbound adapter for this channel (e.g. a website reply that is
      // returned inline): nothing to re-send, so stop retrying it.
      await repository.applyDeliveryRetryOutcome(
        delivery.tenantId,
        delivery.id,
        {
          succeeded: false,
          attempts: delivery.attempts,
          exhausted: true,
          detail: `No outbound adapter for channel ${delivery.channel}.`,
        },
      );
      result.exhausted += 1;
      continue;
    }

    const attempts = delivery.attempts + 1;
    const outbound = buildOutbound(delivery);
    const send = await adapter.sendMessage(outbound);

    if (send.status === "sent" || send.status === "queued") {
      await repository.applyDeliveryRetryOutcome(
        delivery.tenantId,
        delivery.id,
        {
          succeeded: true,
          attempts,
          providerMessageId: send.providerMessageId ?? null,
          detail: send.detail ?? null,
        },
      );
      result.resent += 1;
      continue;
    }

    // A `skipped` result (or a non-retryable `failed`) will never succeed on a
    // retry, so treat it as exhausted. A retryable failure is exhausted only
    // once it hits the attempt ceiling.
    const permanent = send.status === "skipped" || send.retryable !== true;
    const exhausted = permanent || attempts >= maxAttempts;
    await repository.applyDeliveryRetryOutcome(delivery.tenantId, delivery.id, {
      succeeded: false,
      attempts,
      exhausted,
      detail: send.detail ?? null,
    });
    if (exhausted) {
      result.exhausted += 1;
    } else {
      result.stillFailing += 1;
    }
  }

  if (result.considered > 0) {
    log(
      `retried ${result.considered} delivery(ies): ${result.resent} resent, ` +
        `${result.stillFailing} still failing, ${result.exhausted} exhausted`,
    );
  }
  return result;
}

function buildOutbound(delivery: RetryableDelivery) {
  const outbound: {
    tenantId: string;
    channel: RetryableDelivery["channel"];
    provider: string;
    text: string;
    providerAccountId?: string;
    externalConversationId?: string;
    externalUserId?: string;
  } = {
    tenantId: delivery.tenantId,
    channel: delivery.channel,
    provider: delivery.provider,
    text: delivery.text,
  };
  if (delivery.providerAccountId) {
    outbound.providerAccountId = delivery.providerAccountId;
  }
  if (delivery.externalConversationId) {
    outbound.externalConversationId = delivery.externalConversationId;
  }
  if (delivery.externalUserId) {
    outbound.externalUserId = delivery.externalUserId;
  }
  return outbound;
}
