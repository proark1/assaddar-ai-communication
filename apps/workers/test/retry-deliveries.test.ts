import { describe, expect, it, vi } from "vitest";
import type { ChannelAdapterRegistry } from "@assaddar/channels";
import type { DeliveryResult } from "@assaddar/channels";
import type { RetryableDelivery } from "@assaddar/db";
import {
  retryFailedDeliveries,
  type DeliveryRetryRepository,
} from "../src/retry-deliveries";

function makeDelivery(
  overrides: Partial<RetryableDelivery> = {},
): RetryableDelivery {
  return {
    id: "delivery-1",
    tenantId: "11111111-1111-1111-1111-111111111111",
    channel: "whatsapp",
    provider: "meta-whatsapp-cloud",
    text: "Hallo",
    providerAccountId: "phone-1",
    externalConversationId: "491700000000",
    externalUserId: "491700000000",
    attempts: 1,
    ...overrides,
  };
}

type RecordedOutcome = Parameters<
  DeliveryRetryRepository["applyDeliveryRetryOutcome"]
>[2] & { tenantId: string; deliveryId: string };

function fakeRepository(deliveries: RetryableDelivery[]) {
  const outcomes: RecordedOutcome[] = [];
  const listArgs: Array<{
    before: Date;
    maxAttempts: number;
    limit: number;
  }> = [];
  const repository: DeliveryRetryRepository = {
    async listRetryableDeliveries(options) {
      listArgs.push(options);
      return deliveries;
    },
    async applyDeliveryRetryOutcome(tenantId, deliveryId, outcome) {
      outcomes.push({ tenantId, deliveryId, ...outcome });
    },
  };
  return { repository, outcomes, listArgs };
}

function fakeRegistry(send: (message: unknown) => Promise<DeliveryResult>): {
  registry: ChannelAdapterRegistry;
  sendMock: ReturnType<typeof vi.fn>;
} {
  const sendMock = vi.fn(send);
  const adapter = {
    channel: "whatsapp",
    provider: "meta-whatsapp-cloud",
    normalizeInbound: () => [],
    sendMessage: sendMock,
  };
  const registry = {
    whatsapp: adapter,
    messenger: adapter,
    instagram: adapter,
    tiktok: adapter,
    website: adapter,
  } as unknown as ChannelAdapterRegistry;
  return { registry, sendMock };
}

const NOW = new Date("2026-07-03T10:00:00.000Z");

describe("retryFailedDeliveries", () => {
  it("re-sends and marks the delivery sent on success", async () => {
    const { repository, outcomes } = fakeRepository([makeDelivery()]);
    const { registry, sendMock } = fakeRegistry(async () => ({
      status: "sent",
      providerMessageId: "wamid.resent",
    }));

    const result = await retryFailedDeliveries(repository, registry, {
      now: NOW,
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0]?.[0]).toMatchObject({
      channel: "whatsapp",
      externalUserId: "491700000000",
      text: "Hallo",
    });
    expect(result).toMatchObject({ considered: 1, resent: 1, exhausted: 0 });
    expect(outcomes[0]).toMatchObject({
      deliveryId: "delivery-1",
      succeeded: true,
      attempts: 2,
      providerMessageId: "wamid.resent",
    });
  });

  it("bumps the attempt counter and keeps retrying a transient failure below the ceiling", async () => {
    const { repository, outcomes } = fakeRepository([
      makeDelivery({ attempts: 1 }),
    ]);
    const { registry } = fakeRegistry(async () => ({
      status: "failed",
      retryable: true,
      detail: "503",
    }));

    const result = await retryFailedDeliveries(repository, registry, {
      now: NOW,
      maxAttempts: 5,
    });

    expect(result).toMatchObject({ resent: 0, stillFailing: 1, exhausted: 0 });
    expect(outcomes[0]).toMatchObject({
      succeeded: false,
      attempts: 2,
      exhausted: false,
    });
  });

  it("exhausts a delivery once it reaches the attempt ceiling", async () => {
    const { repository, outcomes } = fakeRepository([
      makeDelivery({ attempts: 4 }),
    ]);
    const { registry } = fakeRegistry(async () => ({
      status: "failed",
      retryable: true,
    }));

    const result = await retryFailedDeliveries(repository, registry, {
      now: NOW,
      maxAttempts: 5,
    });

    expect(result).toMatchObject({ stillFailing: 0, exhausted: 1 });
    expect(outcomes[0]).toMatchObject({ attempts: 5, exhausted: true });
  });

  it("stops retrying a non-retryable / skipped result immediately", async () => {
    const { repository, outcomes } = fakeRepository([
      makeDelivery({ attempts: 1 }),
    ]);
    const { registry } = fakeRegistry(async () => ({
      status: "failed",
      retryable: false,
      detail: "400",
    }));

    const result = await retryFailedDeliveries(repository, registry, {
      now: NOW,
      maxAttempts: 5,
    });

    expect(result).toMatchObject({ exhausted: 1, stillFailing: 0 });
    expect(outcomes[0]).toMatchObject({ exhausted: true });
  });

  it("passes a backoff cutoff derived from retryAfterMs to the repository", async () => {
    const { repository, listArgs } = fakeRepository([]);
    const { registry } = fakeRegistry(async () => ({ status: "sent" }));

    await retryFailedDeliveries(repository, registry, {
      now: NOW,
      retryAfterMs: 60_000,
      maxAttempts: 7,
      batchSize: 25,
    });

    expect(listArgs[0]).toEqual({
      before: new Date(NOW.getTime() - 60_000),
      maxAttempts: 7,
      limit: 25,
    });
  });
});
