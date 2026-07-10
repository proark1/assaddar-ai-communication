import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, isNull, sql } from "drizzle-orm";
import {
  auditLogs,
  createDbClient,
  TenantRepository,
  tenants,
  type DatabaseClient,
} from "../src";

function isLocalDatabaseUrl(value: string | undefined) {
  if (!value) {
    return false;
  }
  try {
    const url = new URL(value);
    return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

const runIntegrationTests = isLocalDatabaseUrl(process.env.DATABASE_URL);

/**
 * The append-only audit-log guard (migrations 0019 + 0023) must reject every
 * direct mutation while still allowing the ONE update Postgres itself performs:
 * the ON DELETE SET NULL detach of tenant_id when a tenant is deleted. Before
 * 0023 that detach was rejected too, so a tenant with any audit history could
 * never be deleted.
 *
 * Note: the tombstone rows this test creates (tenant_id null) are append-only
 * by design and cannot be cleaned up afterwards — the same semantics production
 * has. CI runs against an ephemeral database, so nothing accumulates there.
 */
describe.skipIf(!runIntegrationTests)("audit_logs append-only guard", () => {
  let client: DatabaseClient;
  let repo: TenantRepository;

  beforeAll(() => {
    client = createDbClient(process.env.DATABASE_URL);
    repo = new TenantRepository(client.db);
  });

  afterAll(async () => {
    await client?.close();
  });

  it("allows tenant deletion and keeps the audit rows as tombstones", async () => {
    const marker = crypto.randomUUID();
    const tenant = await repo.createTenant({
      name: `Audit Guard ${marker.slice(0, 8)}`,
      slug: `audit-guard-${marker.slice(0, 8)}`,
    });
    await repo.recordAuditEvent(tenant.id, {
      action: "integration.audit.check",
      targetType: "tenant",
      targetId: marker,
      actorType: "system",
    });

    // The fix under test: deleting the tenant fires the FK's SET NULL update
    // on its audit rows, which the trigger must now allow.
    await expect(repo.deleteTenantData(tenant.id)).resolves.toBeUndefined();

    const [deletedTenant] = await client.db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.id, tenant.id));
    expect(deletedTenant).toBeUndefined();

    // The audit trail survives erasure as platform-level tombstones. A tenant
    // creation writes its own audit row too, so at least two rows detach.
    const tombstones = await client.db
      .select({ id: auditLogs.id, action: auditLogs.action })
      .from(auditLogs)
      .where(and(isNull(auditLogs.tenantId), eq(auditLogs.targetId, marker)));
    expect(tombstones).toHaveLength(1);
    expect(tombstones[0]?.action).toBe("integration.audit.check");
  });

  it("still rejects direct updates and deletes", async () => {
    const marker = crypto.randomUUID();
    const tenant = await repo.createTenant({
      name: `Audit Immutable ${marker.slice(0, 8)}`,
      slug: `audit-immutable-${marker.slice(0, 8)}`,
    });
    try {
      await repo.recordAuditEvent(tenant.id, {
        action: "integration.audit.immutable",
        targetType: "tenant",
        targetId: marker,
        actorType: "system",
      });

      // Content mutation is rejected.
      await expect(
        client.db
          .update(auditLogs)
          .set({ action: "tampered" })
          .where(eq(auditLogs.targetId, marker)),
      ).rejects.toThrow(/append-only/);

      // Nulling tenant_id manually alongside another change is rejected too —
      // only the pure referential detach is allowed.
      await expect(
        client.db
          .update(auditLogs)
          .set({ tenantId: null, action: "tampered" })
          .where(eq(auditLogs.targetId, marker)),
      ).rejects.toThrow(/append-only/);

      // Deletes are rejected.
      await expect(
        client.db.delete(auditLogs).where(eq(auditLogs.targetId, marker)),
      ).rejects.toThrow(/append-only/);

      // The row is untouched.
      const [row] = await client.db
        .select({ action: auditLogs.action })
        .from(auditLogs)
        .where(eq(auditLogs.targetId, marker));
      expect(row?.action).toBe("integration.audit.immutable");
    } finally {
      // Tenant cleanup detaches this test's audit rows into tombstones.
      await client.db.execute(
        sql`delete from tenants where id = ${tenant.id}::uuid`,
      );
    }
  });
});
