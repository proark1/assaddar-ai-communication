import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { loadRootEnv } from "./load-env";

loadRootEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, "../migrations");

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required.");
  }

  const sql = postgres(connectionString, { max: 1 });
  try {
    // A deploy can fire this from more than one service at once. Serialize every
    // migrator with a shared session advisory lock so they never race to apply
    // the same DDL: latecomers block here, then find every migration already
    // recorded and no-op. The key is derived from a fixed name so all migrators
    // compute the same value.
    await sql`select pg_advisory_lock(hashtext('assaddar_schema_migrations'))`;
    try {
      await sql`
        create table if not exists schema_migrations (
          version text primary key,
          applied_at timestamptz not null default now()
        )
      `;

      const appliedRows = await sql<
        { version: string }[]
      >`select version from schema_migrations`;
      const applied = new Set(appliedRows.map((row) => row.version));
      const files = (await readdir(migrationsDir))
        .filter((file) => file.endsWith(".sql"))
        .sort();

      for (const file of files) {
        if (applied.has(file)) {
          continue;
        }

        const content = await readFile(path.join(migrationsDir, file), "utf8");
        await sql.begin(async (tx) => {
          await tx.unsafe(content);
          await tx`insert into schema_migrations (version) values (${file})`;
        });
        console.log(`Applied migration ${file}`);
      }

      if (files.every((file) => applied.has(file))) {
        console.log("No pending migrations.");
      }
    } finally {
      await sql`select pg_advisory_unlock(hashtext('assaddar_schema_migrations'))`;
    }
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
