import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

/**
 * The transaction handle passed to `db.transaction((tx) => ...)`. Derived from
 * the driver's own type so it stays accurate, and exposes the same query
 * builders as `Database`.
 */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Either the root db or an active transaction; both share the query API. */
export type DbExecutor = Database | Transaction;

export type DatabaseClient = {
  sql: postgres.Sql;
  db: Database;
  close: () => Promise<void>;
};

/**
 * Resolve the maximum pool size from `DATABASE_POOL_MAX`, falling back to a
 * sane default when the var is absent or not a positive integer. Kept generous
 * (20) so the API can serve more concurrent requests under load.
 */
function resolvePoolMax(raw = process.env.DATABASE_POOL_MAX): number {
  const DEFAULT_POOL_MAX = 20;
  if (raw === undefined) {
    return DEFAULT_POOL_MAX;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_POOL_MAX;
}

/**
 * Resolve the connection string for the RUNTIME (API, workers, voice). Prefer a
 * dedicated non-owner application role via APP_DATABASE_URL so Postgres RLS is
 * actually enforced (the table owner bypasses RLS unless FORCE is set). Falls
 * back to DATABASE_URL for backward compatibility and local dev. Migrations run
 * separately and always use the owner DATABASE_URL.
 */
export function resolveAppConnectionString(
  env = process.env,
): string | undefined {
  return env.APP_DATABASE_URL ?? env.DATABASE_URL;
}

export function createDbClient(
  connectionString = resolveAppConnectionString(),
): DatabaseClient {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required.");
  }

  const sql = postgres(connectionString, {
    max: resolvePoolMax(),
    transform: postgres.camel,
  });

  return {
    sql,
    db: drizzle(sql, { schema }),
    close: () => sql.end(),
  };
}
