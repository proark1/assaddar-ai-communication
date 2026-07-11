import { describe, expect, it } from "vitest";
import {
  consumeTombstoneFeed,
  type TenantResolution,
  type TombstoneItem,
} from "../src/onebrain-tombstone-consume";

function tombstone(
  id: string,
  overrides: Partial<TombstoneItem> = {},
): TombstoneItem {
  return {
    id,
    seq: Number(id.replace(/\D/g, "")) || 1,
    accountId: "acct",
    spaceId: "",
    targetType: "account",
    targetRef: "",
    ...overrides,
  };
}

function harness(
  tombstones: TombstoneItem[],
  resolve: (accountId: string) => TenantResolution,
  startCursor = 0,
) {
  let cursor = startCursor;
  const erased: string[] = [];
  const acked: string[] = [];
  const store = {
    getCursor: async () => cursor,
    setCursor: async (value: number) => {
      cursor = value;
    },
    resolveTenant: async (accountId: string) => resolve(accountId),
    eraseTenant: async (tenantId: string) => {
      erased.push(tenantId);
    },
  };
  const feedCursor = tombstones.reduce(
    (max, t) => Math.max(max, t.seq),
    startCursor,
  );
  const source = {
    listTombstones: async (_since: number) => ({
      tombstones,
      cursor: feedCursor,
    }),
    ackTombstone: async (id: string) => {
      acked.push(id);
    },
  };
  return { store, source, erased, acked, cursorRef: () => cursor };
}

describe("consumeTombstoneFeed", () => {
  it("erases the matched tenant for an account tombstone and acks it (erase enabled)", async () => {
    const { store, source, erased, acked, cursorRef } = harness(
      [tombstone("t1", { seq: 5, accountId: "acme-slug" })],
      () => ({ status: "matched", tenantId: "tenant-acme" }),
    );

    const result = await consumeTombstoneFeed(store, source, {
      eraseEnabled: true,
    });

    expect(erased).toEqual(["tenant-acme"]);
    expect(acked).toEqual(["t1"]);
    expect(result).toMatchObject({
      fetched: 1,
      erased: 1,
      acked: 1,
      skipped: 0,
      cursor: 5,
    });
    expect(cursorRef()).toBe(5);
  });

  it("defers (does not erase or ack) a matched account tombstone when erase is off", async () => {
    const { store, source, erased, acked, cursorRef } = harness(
      [tombstone("t1", { seq: 5, accountId: "acme-slug" })],
      () => ({ status: "matched", tenantId: "tenant-acme" }),
    );

    // Default: erase disabled — the erasure is reported but not applied.
    const result = await consumeTombstoneFeed(store, source);

    expect(erased).toEqual([]);
    expect(acked).toEqual([]);
    expect(result).toMatchObject({ erased: 0, acked: 0, deferred: 1 });
    expect(cursorRef()).toBe(5); // cursor still advances
  });

  it("acks (without erasing) a tombstone whose account has no local tenant", async () => {
    const { store, source, erased, acked } = harness(
      [tombstone("t2", { seq: 3 })],
      () => ({ status: "no_local_tenant" }),
    );

    const result = await consumeTombstoneFeed(store, source);

    expect(erased).toEqual([]);
    expect(acked).toEqual(["t2"]);
    expect(result).toMatchObject({ erased: 0, acked: 1, skipped: 0 });
  });

  it("refuses to delete on an ambiguous mapping and leaves it un-acked", async () => {
    const { store, source, erased, acked, cursorRef } = harness(
      [tombstone("t3", { seq: 7 })],
      () => ({ status: "ambiguous" }),
    );

    const result = await consumeTombstoneFeed(store, source);

    expect(erased).toEqual([]);
    expect(acked).toEqual([]); // never acked — needs manual resolution
    expect(result).toMatchObject({ erased: 0, acked: 0, skipped: 1 });
    // Cursor still advances so one un-mappable record can't wedge the feed.
    expect(cursorRef()).toBe(7);
  });

  it("skips (does not erase or ack) a granular space/subject tombstone", async () => {
    const { store, source, erased, acked } = harness(
      [tombstone("t4", { seq: 2, targetType: "space", spaceId: "sp_x" })],
      () => ({ status: "matched", tenantId: "tenant-acme" }),
    );

    const result = await consumeTombstoneFeed(store, source);

    expect(erased).toEqual([]);
    expect(acked).toEqual([]);
    expect(result).toMatchObject({ erased: 0, skipped: 1 });
  });

  it("processes a mixed batch and advances the cursor to the max seq", async () => {
    const { store, source, erased, acked, cursorRef } = harness(
      [
        tombstone("a", { seq: 10, accountId: "known" }),
        tombstone("b", { seq: 11, accountId: "unknown" }),
      ],
      (accountId) =>
        accountId === "known"
          ? { status: "matched", tenantId: "t-known" }
          : { status: "no_local_tenant" },
    );

    const result = await consumeTombstoneFeed(store, source, {
      eraseEnabled: true,
    });

    expect(erased).toEqual(["t-known"]);
    expect(acked.sort()).toEqual(["a", "b"]);
    expect(result).toMatchObject({ fetched: 2, erased: 1, acked: 2 });
    expect(cursorRef()).toBe(11);
  });
});
