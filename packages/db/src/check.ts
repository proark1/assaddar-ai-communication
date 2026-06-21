import postgres from "postgres";
import { loadRootEnv } from "./load-env";

loadRootEnv();

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required.");
  }

  const sql = postgres(connectionString, {
    max: 1,
    transform: postgres.camel
  });

  try {
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

    const [vector] = await sql<
      Array<{
        available: boolean;
        installedVersion: string | null;
      }>
    >`
      select
        exists(select 1 from pg_available_extensions where name = 'vector') as available,
        (select extversion from pg_extension where extname = 'vector') as installed_version
    `;

    console.log("Database connection OK");
    console.log(`  database: ${connection?.databaseName}`);
    console.log(`  user: ${connection?.userName}`);
    console.log(`  postgres: ${connection?.serverVersion}`);
    console.log(`  pgvector available: ${vector?.available ? "yes" : "no"}`);
    console.log(`  pgvector installed: ${vector?.installedVersion ?? "not yet"}`);
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
