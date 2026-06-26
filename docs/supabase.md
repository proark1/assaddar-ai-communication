# PostgreSQL Database Setup

This project uses Railway Postgres in production through `DATABASE_URL`. The app talks to PostgreSQL directly through Drizzle and the `postgres` driver; it does not rely on hosted Supabase Auth or Supabase client SDKs.

The filename is kept for backwards-compatible documentation links, but the current production target is Railway Postgres.

## Railway Setup

1. Add a Railway Postgres service to the project.
2. Copy the service `DATABASE_URL`.
3. Set the same `DATABASE_URL` on `assaddar-api`, `assaddar-workers`, and `assaddar-voice`.
4. Run migrations from the repo or Railway shell:

```bash
pnpm db:migrate
```

Example:

```bash
DATABASE_URL='postgresql://USER:PASSWORD@HOST:PORT/railway?sslmode=require'
```

## Required Extensions

The initial migration enables:

- `pgcrypto`
- `vector` in the `extensions` schema

If the Railway Postgres image does not have `pgvector` available, either install/use a Postgres service with `pgvector` support or adapt the vector-backed knowledge table before production semantic search.

## Auth Tables

Project login is first-party and stored in Railway Postgres:

- `users`
- `roles`
- `memberships`
- `user_sessions`
- `tenant_invites`

Passwords are salted `scrypt` hashes. Session and invite tokens are stored only as SHA-256 hashes.

## Local Docker Fallback

For local development you can still use the bundled Docker Postgres service:

```bash
docker compose up -d
DATABASE_URL=postgres://assaddar:assaddar@localhost:5432/assaddar_ai_communication
pnpm db:migrate
```

## Operational Notes

- Keep `DATABASE_URL` server-side only.
- Use a non-owner application database role in production when possible.
- Keep backups enabled before storing customer data.
- Tenant isolation is enforced in the API and should be reinforced with RLS where possible.
