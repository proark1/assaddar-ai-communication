import { describe, expect, it } from "vitest";
import type { EmbeddingProvider, KnowledgeChunk } from "@assaddar/core";
import type { TenantRepository } from "@assaddar/db";
import { backfillMissingEmbeddings } from "../src/backfill-embeddings";

type MissingChunk = Pick<KnowledgeChunk, "id" | "title" | "content">;

/**
 * In-memory stand-in for the slice of {@link TenantRepository} that the backfill
 * touches. It tracks which chunks still lack an embedding per tenant and pages
 * through them in batches, mirroring the real DB-backed behaviour without any
 * DB/Redis/network. Cast to `TenantRepository` for the public signature.
 */
class FakeRepository {
  /** Persisted embeddings, keyed by `${tenantId}:${chunkId}`. */
  readonly embeddings = new Map<string, number[]>();
  /** How many distinct batches each tenant returned (to assert paging). */
  readonly batchCalls: string[] = [];

  constructor(
    private readonly tenantIds: string[],
    private readonly chunksByTenant: Map<string, MissingChunk[]>,
  ) {}

  async listTenants(): Promise<Array<{ id: string }>> {
    return this.tenantIds.map((id) => ({ id }));
  }

  async listChunksMissingEmbedding(
    tenantId: string,
    limit: number,
  ): Promise<MissingChunk[]> {
    this.batchCalls.push(tenantId);
    const all = this.chunksByTenant.get(tenantId) ?? [];
    const missing = all.filter(
      (chunk) => !this.embeddings.has(`${tenantId}:${chunk.id}`),
    );
    return missing.slice(0, Math.max(limit, 1));
  }

  async setChunkEmbedding(
    tenantId: string,
    chunkId: string,
    embedding: number[],
  ): Promise<void> {
    this.embeddings.set(`${tenantId}:${chunkId}`, embedding);
  }
}

function asRepository(fake: FakeRepository): TenantRepository {
  return fake as unknown as TenantRepository;
}

function chunk(id: string, content = `content-${id}`): MissingChunk {
  return { id, title: `title-${id}`, content };
}

/** Returns a unit-ish vector per input; deterministic and length-stable. */
function fakeProvider(): EmbeddingProvider & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    model: "fake-embed",
    dimensions: 3,
    calls,
    async embed(texts: string[]) {
      calls.push(texts);
      return texts.map((_text, index) => [index, index + 1, index + 2]);
    },
  };
}

/** Provider that never produces usable vectors (simulates a degraded provider). */
function emptyProvider(): EmbeddingProvider {
  return {
    model: "broken-embed",
    dimensions: 3,
    async embed() {
      // No usable vectors: the backfill's `vectors[index]` is always undefined,
      // so it persists nothing and the stall guard must stop the loop.
      return [];
    },
  };
}

describe("backfillMissingEmbeddings", () => {
  const tenantA = "11111111-1111-4111-8111-111111111111";
  const tenantB = "22222222-2222-4222-8222-222222222222";

  it("embeds all missing chunks across multiple tenants", async () => {
    const fake = new FakeRepository(
      [tenantA, tenantB],
      new Map([
        [tenantA, [chunk("a1"), chunk("a2")]],
        [tenantB, [chunk("b1")]],
      ]),
    );
    const provider = fakeProvider();

    const result = await backfillMissingEmbeddings(
      asRepository(fake),
      provider,
      () => {},
    );

    expect(result).toEqual({ tenants: 2, embedded: 3 });
    expect(fake.embeddings.has(`${tenantA}:a1`)).toBe(true);
    expect(fake.embeddings.has(`${tenantA}:a2`)).toBe(true);
    expect(fake.embeddings.has(`${tenantB}:b1`)).toBe(true);
  });

  it("builds embed inputs from chunk title and content", async () => {
    const fake = new FakeRepository(
      [tenantA],
      new Map([[tenantA, [chunk("a1", "hello world")]]]),
    );
    const provider = fakeProvider();

    await backfillMissingEmbeddings(asRepository(fake), provider, () => {});

    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]).toEqual(["title-a1\nhello world"]);
  });

  it("is idempotent: a second run with nothing missing embeds 0", async () => {
    const fake = new FakeRepository(
      [tenantA],
      new Map([[tenantA, [chunk("a1"), chunk("a2")]]]),
    );
    const provider = fakeProvider();

    const first = await backfillMissingEmbeddings(
      asRepository(fake),
      provider,
      () => {},
    );
    expect(first.embedded).toBe(2);

    const second = await backfillMissingEmbeddings(
      asRepository(fake),
      provider,
      () => {},
    );
    expect(second).toEqual({ tenants: 1, embedded: 0 });
  });

  it("stops (stall guard) when a batch returns no usable vectors", async () => {
    const fake = new FakeRepository(
      [tenantA],
      new Map([[tenantA, [chunk("a1"), chunk("a2")]]]),
    );
    const logged: string[] = [];

    const result = await backfillMissingEmbeddings(
      asRepository(fake),
      emptyProvider(),
      (message) => logged.push(message),
    );

    expect(result).toEqual({ tenants: 1, embedded: 0 });
    // Nothing was persisted...
    expect(fake.embeddings.size).toBe(0);
    // ...and the loop did not spin forever re-fetching the same batch.
    expect(fake.batchCalls.filter((id) => id === tenantA)).toHaveLength(1);
    expect(logged.some((line) => line.includes("could not be embedded"))).toBe(
      true,
    );
  });

  it("returns the tenant count even when no tenants have missing chunks", async () => {
    const fake = new FakeRepository(
      [tenantA, tenantB],
      new Map([
        [tenantA, []],
        [tenantB, []],
      ]),
    );

    const result = await backfillMissingEmbeddings(
      asRepository(fake),
      fakeProvider(),
      () => {},
    );

    expect(result).toEqual({ tenants: 2, embedded: 0 });
  });
});
