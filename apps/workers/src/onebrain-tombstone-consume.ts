// Consumes OneBrain's erasure feed (Phase 4). When OneBrain erases a scope
// centrally, it publishes a tombstone; this worker polls the feed forward from a
// stored cursor, mirrors each erasure in the local database, and acks it.
//
// Erasure is destructive, so it is OFF by default (eraseEnabled=false): the
// consumer resolves and reports the required erasures but does not delete or ack
// them, leaving them visible in OneBrain for review. Auto-erase must be opted
// into once the account->tenant mapping is known to be safe.
//
// Two mapping hazards, both of which must be sound before enabling auto-erase:
//   1. Ambiguity — a tenant's OneBrain account is its slug (see the sync scope
//      derivation), but a deployment-wide ONEBRAIN_ACCOUNT_ID override collapses
//      every tenant onto one account. The resolver returns "ambiguous" for that
//      case and this worker never deletes.
//   2. Mutability — a slug can be renamed or reassigned to another tenant, and
//      tombstones are durable, so a stale account_id could resolve to the WRONG
//      tenant. Keying the account on an immutable id (publicId) end-to-end is the
//      robust fix and a prerequisite for enabling auto-erase in a tenant fleet
//      that renames/reuses slugs.
//
// Dependency-injected so the branching logic is unit-testable without a database
// or a live OneBrain.

export type TombstoneItem = {
  id: string;
  seq: number;
  accountId: string;
  spaceId: string;
  targetType: string;
  targetRef: string;
};

export type TenantResolution =
  | { status: "matched"; tenantId: string }
  | { status: "no_local_tenant" }
  | { status: "ambiguous" };

export type TombstoneConsumeStore = {
  getCursor(): Promise<number>;
  setCursor(cursor: number): Promise<void>;
  resolveTenant(accountId: string): Promise<TenantResolution>;
  eraseTenant(tenantId: string): Promise<void>;
};

export type TombstoneConsumeSource = {
  listTombstones(
    since: number,
  ): Promise<{ tombstones: TombstoneItem[]; cursor: number }>;
  ackTombstone(id: string): Promise<void>;
};

export type TombstoneConsumeResult = {
  fetched: number;
  erased: number;
  acked: number;
  skipped: number;
  deferred: number;
  cursor: number;
};

export async function consumeTombstoneFeed(
  store: TombstoneConsumeStore,
  source: TombstoneConsumeSource,
  options: { eraseEnabled?: boolean; log?: (message: string) => void } = {},
): Promise<TombstoneConsumeResult> {
  const eraseEnabled = options.eraseEnabled ?? false;
  const since = await store.getCursor();
  const feed = await source.listTombstones(since);

  let erased = 0;
  let acked = 0;
  let skipped = 0;
  let deferred = 0;

  for (const tombstone of feed.tombstones) {
    const resolution = await store.resolveTenant(tombstone.accountId);

    if (resolution.status === "matched") {
      if (tombstone.targetType !== "account") {
        // Space/subject-level erasure is not yet mapped to local partitions.
        // Leave it un-acked for manual handling rather than delete imprecisely.
        skipped += 1;
        options.log?.(
          `skipped ${tombstone.targetType} tombstone ${tombstone.id}: granular erasure not supported yet`,
        );
      } else if (!eraseEnabled) {
        // Destructive auto-erase is opt-in. Report the required erasure and leave
        // it un-acked so it stays actionable in OneBrain.
        deferred += 1;
        options.log?.(
          `erasure required for tenant ${resolution.tenantId} (account ${tombstone.accountId}); ` +
            `set ONEBRAIN_TOMBSTONE_ERASE_ENABLED=true to apply automatically`,
        );
      } else {
        await store.eraseTenant(resolution.tenantId);
        await source.ackTombstone(tombstone.id);
        erased += 1;
        acked += 1;
      }
    } else if (resolution.status === "no_local_tenant") {
      // No local tenant owns this account — nothing to erase here, so it is done.
      await source.ackTombstone(tombstone.id);
      acked += 1;
    } else {
      // Ambiguous: one OneBrain account maps to many tenants. Never guess which
      // tenant to delete; leave un-acked for manual resolution.
      skipped += 1;
      options.log?.(
        `skipped tombstone ${tombstone.id}: account ${tombstone.accountId} maps ambiguously to local tenants`,
      );
    }
  }

  // Advance past everything seen so one un-mappable record can't wedge the feed;
  // anything left un-acked stays visible in OneBrain as the manual-review signal.
  const nextCursor = feed.cursor > since ? feed.cursor : since;
  if (nextCursor !== since) {
    await store.setCursor(nextCursor);
  }

  return {
    fetched: feed.tombstones.length,
    erased,
    acked,
    skipped,
    deferred,
    cursor: nextCursor,
  };
}
