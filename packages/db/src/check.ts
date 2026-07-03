import postgres from "postgres";
import { resolveAppConnectionString } from "./client";
import { loadRootEnv } from "./load-env";
import {
  evaluateRlsEffectiveness,
  SAMPLE_TENANT_TABLES,
  type RoleRlsFacts,
} from "./rls-check";

loadRootEnv();

async function reportConnection(sql: postgres.Sql, label: string) {
  const [connection] = await sql<
    Array<{
      databaseName: string;
      userName: string;
      serverVersion: string;
    }>
  >`
    select
      current_database() as database_name,
      current_user as user_name,
      current_setting('server_version') as server_version
  `;
  console.log(`${label} connection OK`);
  console.log(`  database: ${connection?.databaseName}`);
  console.log(`  user: ${connection?.userName}`);
  console.log(`  postgres: ${connection?.serverVersion}`);
  return connection;
}

async function gatherRlsFacts(sql: postgres.Sql): Promise<RoleRlsFacts> {
  const [role] = await sql<
    Array<{ isSuperuser: boolean; hasBypassRls: boolean }>
  >`
    select rolsuper as is_superuser, rolbypassrls as has_bypass_rls
    from pg_roles
    where rolname = current_user
  `;
  const tables = SAMPLE_TENANT_TABLES as readonly string[];
  const [tableState] = await sql<
    Array<{
      owns: boolean | null;
      forceAll: boolean | null;
      rlsAll: boolean | null;
      found: number;
    }>
  >`
    select
      bool_and(pg_get_userbyid(relowner) = current_user) as owns,
      bool_and(relforcerowsecurity) as force_all,
      bool_and(relrowsecurity) as rls_all,
      count(*)::int as found
    from pg_class
    where relname = any(${sql.array(tables as string[])})
      and relkind = 'r'
  `;
  return {
    isSuperuser: role?.isSuperuser ?? false,
    hasBypassRls: role?.hasBypassRls ?? false,
    ownsTenantTables: tableState?.owns ?? false,
    forceEnabledOnTenantTables: tableState?.forceAll ?? false,
    rowSecurityEnabledOnTenantTables: tableState?.rlsAll ?? false,
  };
}

/**
 * Report whether RLS is actually enforced for the runtime application role.
 * Returns true when RLS is effective (or intentionally not required), false
 * when it is inert. When REQUIRE_DB_RLS is truthy an inert result is a hard
 * failure so a misconfigured production deploy is caught before it serves.
 */
async function reportRlsEffectiveness(sql: postgres.Sql): Promise<boolean> {
  const facts = await gatherRlsFacts(sql);
  const { effective, reasons } = evaluateRlsEffectiveness(facts);
  const requireRls =
    (process.env.REQUIRE_DB_RLS ?? "").toLowerCase() === "true";

  if (effective) {
    console.log("  row-level security: ENFORCED for the application role");
    return true;
  }

  const header =
    "  row-level security: INERT for the application role — the database " +
    "backstop is doing nothing:";
  if (requireRls) {
    console.error(header);
    for (const reason of reasons) {
      console.error(`    - ${reason}`);
    }
    console.error(
      "  REQUIRE_DB_RLS=true and RLS is not enforced. Provision a non-owner " +
        "APP_DATABASE_URL role and run scripts/enable-force-rls.sql. See " +
        "docs/security-gdpr.md.",
    );
    return false;
  }

  console.warn(header);
  for (const reason of reasons) {
    console.warn(`    - ${reason}`);
  }
  console.warn(
    "  Tenant isolation still holds via the repository's tenant_id predicates, " +
      "but the DB backstop is off. To enable it, see docs/security-gdpr.md.",
  );
  return true;
}

async function main() {
  const migrationUrl = process.env.DATABASE_URL;
  if (!migrationUrl) {
    throw new Error("DATABASE_URL is required.");
  }
  const appUrl = resolveAppConnectionString();

  const sql = postgres(migrationUrl, { max: 1, transform: postgres.camel });
  let ok = true;
  try {
    await reportConnection(sql, "Database (migrations)");

    const [vector] = await sql<
      Array<{ available: boolean; installedVersion: string | null }>
    >`
      select
        exists(select 1 from pg_available_extensions where name = 'vector') as available,
        (select extversion from pg_extension where extname = 'vector') as installed_version
    `;
    console.log(`  pgvector available: ${vector?.available ? "yes" : "no"}`);
    console.log(
      `  pgvector installed: ${vector?.installedVersion ?? "not yet"}`,
    );

    // Check RLS for the actual runtime role. If APP_DATABASE_URL is set and
    // differs from the migration URL, open a second connection as that role.
    if (appUrl && appUrl !== migrationUrl) {
      const appSql = postgres(appUrl, { max: 1, transform: postgres.camel });
      try {
        await reportConnection(appSql, "Database (application role)");
        ok = (await reportRlsEffectiveness(appSql)) && ok;
      } finally {
        await appSql.end();
      }
    } else {
      console.log(
        "  note: APP_DATABASE_URL is not set — the app uses the migration role.",
      );
      ok = (await reportRlsEffectiveness(sql)) && ok;
    }
  } finally {
    await sql.end();
  }

  if (!ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
