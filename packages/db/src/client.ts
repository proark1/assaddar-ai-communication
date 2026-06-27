import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

export type DatabaseClient = {
  sql: postgres.Sql;
  db: Database;
  close: () => Promise<void>;
};

export function createDbClient(
  connectionString = process.env.DATABASE_URL,
): DatabaseClient {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required.");
  }

  const sql = postgres(connectionString, {
    max: 10,
    transform: postgres.camel,
  });

  return {
    sql,
    db: drizzle(sql, { schema }),
    close: () => sql.end(),
  };
}
