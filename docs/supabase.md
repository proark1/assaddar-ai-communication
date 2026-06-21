# Supabase Database Setup

Supabase is the recommended managed database for this MVP. The app uses Supabase as regular PostgreSQL through `DATABASE_URL`; it does not expose Supabase keys in the browser and does not rely on the Supabase client SDK for tenant data.

## Create The Project

1. Create a Supabase project.
2. Save the database password.
3. Open the project dashboard and click **Connect**.
4. Copy a Postgres connection string.

For migrations, use a direct connection or the session pooler on port `5432`. Avoid the transaction pooler on port `6543` for migrations because schema changes and session settings are easier to reason about with a single session.

Example:

```bash
DATABASE_URL='postgresql://postgres.PROJECT_REF:YOUR_DB_PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres?sslmode=require'
```

## Configure Local Env

```bash
cp .env.example .env
```

Set `DATABASE_URL` to the Supabase Postgres connection string.

Redis is still separate. The API/dashboard MVP does not require Redis for the basic tenant and widget flow, but `apps/workers` expects `REDIS_URL` when you run background jobs.

## Verify And Migrate

```bash
pnpm db:check
pnpm db:migrate
pnpm db:seed
```

`pnpm db:check` confirms that the app can connect and that `pgvector` is available. The migration enables:

- `pgcrypto`
- `pgvector` as the `vector` extension
- tenant tables
- tenant-scoped row-level security policies

## Run The App

```bash
pnpm dev:api
pnpm dev:admin
pnpm dev:widget
```

Open `http://localhost:3000`, use the admin token from `.env`, refresh tenants, and test the seeded assistant.

## Production Notes

- Keep `DATABASE_URL` server-only.
- Do not put Supabase service-role keys into frontend env vars.
- Use Supabase RLS as defense in depth; the API still enforces tenant scope before querying.
- For autoscaled/serverless deployments, use the pooler connection recommended by Supabase for runtime traffic.
- Keep migrations on a direct/session connection.
- Backups, PITR, and region choice should be configured in Supabase before customer data is stored.
