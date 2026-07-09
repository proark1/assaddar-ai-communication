# Optional Supabase Setup

The current production path is Railway-only: Railway Postgres stores product
data and the Admin dashboard uses the API's legacy email/password session flow.
Supabase remains an optional future identity provider.

When enabled, Supabase can provide two backend responsibilities:

- Supabase Postgres can be used as an alternate Postgres backend.
- Supabase Auth can be used as the identity provider for Admin dashboard users.

Railway hosts the runtime services: API, Admin dashboard, Widget, Voice,
Workers, Postgres, and Redis. Redis is used for worker queues and does not
replace Postgres.

## Database Setup

Copy the Supabase Postgres connection string and set it as `DATABASE_URL` on the
API, workers, voice service, and migration jobs.

Example:

```bash
DATABASE_URL='postgresql://USER:PASSWORD@HOST:PORT/postgres?sslmode=require'
```

Run migrations against the Supabase database:

```bash
pnpm db:migrate
```

Required extensions:

- `pgcrypto`
- `vector` in the `extensions` schema

## Auth Model

Supabase Auth owns login identity in `auth.users`.

The application still owns tenant authorization in public tables:

- `users`
- `roles`
- `memberships`
- `tenants`
- `tenant_invites`

`users.auth_user_id` links an app profile to `auth.users.id`. `users.id` remains
the internal application user ID so existing memberships keep working.

Admin API requests use:

```http
Authorization: Bearer <supabase_access_token>
```

The API verifies the Supabase token, resolves `auth.users.id` to
`users.auth_user_id`, loads memberships, and applies the existing role checks.

The bootstrap `ADMIN_API_TOKEN` remains available for emergency/platform setup.

## Required Railway Variables

API:

```text
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<publishable-or-legacy-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<server-only-service-role-or-secret-key>
SUPABASE_JWT_AUDIENCE=authenticated
DATABASE_URL=postgresql://...
```

Admin dashboard:

```text
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-or-legacy-anon-key>
NEXT_PUBLIC_API_BASE_URL=https://your-api-domain
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` to browser runtimes, the widget, or
`NEXT_PUBLIC_*` variables.

## Local Docker Fallback

For local development without Supabase, the bundled Docker Postgres service can
still be used:

```bash
docker compose up -d
DATABASE_URL=postgres://assaddar:assaddar@localhost:5432/assaddar_ai_communication
pnpm db:migrate
```

When Supabase Auth variables are not configured, the API keeps the legacy
password/session auth path available for development.

## Operational Notes

- Keep `DATABASE_URL` server-side only.
- Keep backups enabled before storing customer data.
- Disable public signup in Supabase unless self-service signup is explicitly
  desired.
- Configure Supabase Auth redirect URLs for the Admin dashboard domain.
- Tenant isolation is enforced in the API and reinforced by RLS where possible.
