import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import {
  allowedIntents,
  createDbClient,
  TENANT_SCOPED_TABLES,
  TenantRepository,
  tenantPolicyName,
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
 * Proves that the tenant-isolation RLS policies (migrations 0007/0008 + the
 * per-table policies added since) are REAL — that a role which does not bypass
 * RLS genuinely cannot read or write another tenant's rows.
 *
 * Why this test exists: `check.ts` / `pnpm db:check` only inspect catalog facts
 * (is the role a superuser? does it own the tables? is FORCE set?). Those facts
 * can all look correct while a policy is silently broken (wrong column, missing
 * WITH CHECK, a new tenant table with no policy). Only actually querying another
 * tenant's data through a non-bypassing role proves isolation holds. CI runs and
 * migrates as the owner/superuser `assaddar`, which BYPASSES RLS, so without a
 * dedicated non-owner role nothing here would ever be exercised — the exact gap
 * the audit flagged.
 *
 * The probe role mirrors the production `assaddar_app` role's RLS-relevant
 * attributes (NOSUPERUSER, NOBYPASSRLS, non-owner). We reach it with SET LOCAL
 * ROLE inside a transaction: the login/session role stays the superuser owner
 * (so setup can seed cross-tenant rows), but each isolation assertion runs as a
 * role to which RLS actually applies. See scripts/create-app-role.sql and
 * scripts/enable-force-rls.sql for how production provisions the real role.
 */
const PROBE_ROLE = "assaddar_rls_probe";

/**
 * Tables that carry a tenant_id column but are deliberately NOT behind the
 * tenant-isolation policy because they are platform-level, not tenant-scoped.
 *
 * stripe_webhook_events is a billing ingest log: it is written and read only by
 * the trusted Stripe webhook handler, keyed by stripe_event_id / id and never
 * inside a tenant-scoped transaction; its tenant_id is a nullable attribute
 * resolved after the fact. Putting it behind the standard app.current_tenant_id
 * policy would deny those unscoped platform writes once FORCE ROW LEVEL SECURITY
 * is enabled. (Contrast channel_webhook_events, which carries per-tenant
 * end-user content and IS tenant-scoped.)
 */
const PLATFORM_TENANT_ID_TABLES = new Set<string>(["stripe_webhook_events"]);

/** Flatten an Error and its `cause` chain so assertions can match wrapped
 * driver errors (drizzle wraps the underlying PostgresError as `cause`). */
function flattenError(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    parts.push(current.message);
    current = (current as { cause?: unknown }).cause;
  }
  return parts.join(" | ");
}

describe.skipIf(!runIntegrationTests)("tenant RLS isolation", () => {
  let client: DatabaseClient;
  let repo: TenantRepository;
  let tenantA: string;
  let tenantB: string;
  let intentA: string;
  let intentB: string;

  beforeAll(async () => {
    client = createDbClient(process.env.DATABASE_URL);
    repo = new TenantRepository(client.db);

    // A non-login, non-superuser, non-bypass role that does NOT own the tables,
    // so RLS applies to it exactly as it would to the production app role.
    // Postgres has no CREATE ROLE IF NOT EXISTS, so probe for it first (the role
    // is a constant name, never user input).
    const [role] = await client.db.execute<{ exists: boolean }>(
      sql`select exists(select 1 from pg_roles where rolname::text = ${PROBE_ROLE}) as exists`,
    );
    if (!role?.exists) {
      await client.db.execute(
        sql`create role ${sql.identifier(PROBE_ROLE)} nologin nosuperuser nobypassrls`,
      );
    }
    await client.db.execute(
      sql`grant usage on schema public to ${sql.identifier(PROBE_ROLE)}`,
    );
    await client.db.execute(
      sql`grant select, insert, update, delete on all tables in schema public to ${sql.identifier(PROBE_ROLE)}`,
    );
    await client.db.execute(
      sql`grant usage, select on all sequences in schema public to ${sql.identifier(PROBE_ROLE)}`,
    );
    // Lets a non-superuser owner still SET ROLE to the probe (superusers can
    // already switch to any role, so this is a no-op there but keeps the test
    // portable to hardened local databases).
    await client.db.execute(
      sql`grant ${sql.identifier(PROBE_ROLE)} to current_user`,
    );

    const marker = crypto.randomUUID().slice(0, 8);
    const a = await repo.createTenant({
      name: `RLS A ${marker}`,
      slug: `rls-a-${marker}`,
    });
    const b = await repo.createTenant({
      name: `RLS B ${marker}`,
      slug: `rls-b-${marker}`,
    });
    tenantA = a.id;
    tenantB = b.id;

    // Seed one owned row per tenant. Inserted as the owner (RLS bypassed) so the
    // rows exist regardless of scope; the probe queries below are what enforce.
    const [rowA] = await client.db
      .insert(allowedIntents)
      .values({ tenantId: tenantA, name: `intent-a-${marker}` })
      .returning({ id: allowedIntents.id });
    const [rowB] = await client.db
      .insert(allowedIntents)
      .values({ tenantId: tenantB, name: `intent-b-${marker}` })
      .returning({ id: allowedIntents.id });
    intentA = rowA!.id;
    intentB = rowB!.id;
  });

  afterAll(async () => {
    // Leave the probe role (idempotent) and the two tenants: deleting a tenant
    // detaches audit rows, which this branch's append-only trigger still blocks.
    // CI runs against an ephemeral database, so nothing accumulates there.
    await client?.close();
  });

  /**
   * Run `fn` as the RLS-subject probe role with an optional tenant scope, the
   * same way the repository scopes every tenant transaction. Both the role and
   * the app.current_tenant_id setting are transaction-local, so they reset when
   * the transaction ends.
   */
  async function asProbe<T>(
    tenantScope: string | null,
    fn: (tx: DatabaseClient["db"]) => Promise<T>,
  ): Promise<T> {
    return client.db.transaction(async (tx) => {
      if (tenantScope) {
        await tx.execute(
          sql`select set_config('app.current_tenant_id', ${tenantScope}, true)`,
        );
      }
      await tx.execute(sql`set local role ${sql.identifier(PROBE_ROLE)}`);
      return fn(tx as unknown as DatabaseClient["db"]);
    });
  }

  it("keeps every tenant-scoped table behind an isolation policy", async () => {
    // Column aliases come back camelCased (the client uses postgres.camel).
    const rows = await client.db.execute<{
      relname: string;
      rlsEnabled: boolean;
      hasPolicy: boolean;
    }>(sql`
      select
        c.relname,
        c.relrowsecurity as rls_enabled,
        exists (
          select 1 from pg_policies p
          where p.schemaname = 'public'
            and p.tablename = c.relname
            and p.policyname = c.relname || '_tenant_isolation'
        ) as has_policy
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'r'
    `);

    const byName = new Map(rows.map((r) => [r.relname, r]));
    for (const table of TENANT_SCOPED_TABLES) {
      const row = byName.get(table);
      expect(row, `${table} is missing from the database`).toBeDefined();
      expect(row?.rlsEnabled, `${table} has RLS disabled`).toBe(true);
      expect(
        row?.hasPolicy,
        `${table} is missing policy ${tenantPolicyName(table)}`,
      ).toBe(true);
    }
  });

  it("also guards any tenant_id table not on the canonical list", async () => {
    // A stronger, list-independent guard: any base table carrying a tenant_id
    // column must have RLS enabled. Catches a brand-new tenant table shipped
    // without a policy even if nobody added it to TENANT_SCOPED_TABLES.
    const unguarded = await client.db.execute<{ relname: string }>(sql`
      select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid
      where n.nspname = 'public'
        and c.relkind = 'r'
        and a.attname = 'tenant_id'
        and a.attnum > 0
        and not a.attisdropped
        and c.relrowsecurity = false
    `);
    const missing = unguarded
      .map((r) => r.relname)
      .filter((name) => !PLATFORM_TENANT_ID_TABLES.has(name));
    expect(
      missing,
      "tenant-scoped tables with a tenant_id column but no row-level security",
    ).toEqual([]);
  });

  it("lets a scoped role read only its own tenant's rows", async () => {
    const seenByA = await asProbe(tenantA, (tx) =>
      tx
        .select({ id: allowedIntents.id })
        .from(allowedIntents)
        .where(inArray(allowedIntents.id, [intentA, intentB])),
    );
    expect(seenByA.map((r) => r.id)).toEqual([intentA]);

    const seenByB = await asProbe(tenantB, (tx) =>
      tx
        .select({ id: allowedIntents.id })
        .from(allowedIntents)
        .where(inArray(allowedIntents.id, [intentA, intentB])),
    );
    expect(seenByB.map((r) => r.id)).toEqual([intentB]);
  });

  it("hides every tenant's rows when no scope is set", async () => {
    const seen = await asProbe(null, (tx) =>
      tx
        .select({ id: allowedIntents.id })
        .from(allowedIntents)
        .where(inArray(allowedIntents.id, [intentA, intentB])),
    );
    expect(seen).toEqual([]);
  });

  it("rejects an insert into another tenant (WITH CHECK)", async () => {
    let caught: unknown;
    try {
      await asProbe(tenantA, (tx) =>
        tx
          .insert(allowedIntents)
          .values({
            tenantId: tenantB,
            name: `cross-${crypto.randomUUID().slice(0, 8)}`,
          })
          .returning({ id: allowedIntents.id }),
      );
    } catch (error) {
      caught = error;
    }
    expect(
      caught,
      "cross-tenant insert should have been rejected",
    ).toBeDefined();
    // drizzle wraps the PostgresError; the RLS message lives in the cause chain.
    expect(flattenError(caught)).toMatch(/row-level security/i);
  });

  it("cannot update a row belonging to another tenant", async () => {
    const updated = await asProbe(tenantA, (tx) =>
      tx
        .update(allowedIntents)
        .set({ enabled: false })
        .where(eq(allowedIntents.id, intentB))
        .returning({ id: allowedIntents.id }),
    );
    expect(updated).toEqual([]);

    // The owner (RLS bypassed) confirms tenant B's row was never touched.
    const [row] = await client.db
      .select({ enabled: allowedIntents.enabled })
      .from(allowedIntents)
      .where(eq(allowedIntents.id, intentB));
    expect(row?.enabled).toBe(true);
  });

  it("documents that the owner role bypasses RLS (why a non-owner role is required)", async () => {
    // Connected as the migration owner/superuser without FORCE, both tenants'
    // rows are visible — this is precisely the inert-backstop state that
    // scripts/create-app-role.sql + scripts/enable-force-rls.sql exist to fix,
    // and why the runtime must use APP_DATABASE_URL in production.
    const seen = await client.db
      .select({ id: allowedIntents.id })
      .from(allowedIntents)
      .where(inArray(allowedIntents.id, [intentA, intentB]));
    expect(seen.map((r) => r.id).sort()).toEqual([intentA, intentB].sort());
  });
});
