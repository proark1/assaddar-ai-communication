# Assaddar AI Communication Platform

Standalone multi-tenant SaaS foundation for business-controlled AI answers across website chat, social messaging channels, and telephone voice AI.

The product runtime is intentionally separate from any marketing website. A public website can embed the widget or call the API later, but tenant data, channel credentials, answer logic, usage metering, and dashboards live here.

## What Works In This MVP

- Create tenants through the admin API or dashboard.
- Add approved tenant knowledge as FAQ entries.
- Test the assistant from the dashboard or API.
- Embed the website widget with a tenant public assistant ID.
- Answer only from tenant-scoped approved knowledge.
- Refuse or offer handoff for unknown, blocked, off-topic, or low-confidence requests.
- Store conversations, messages, usage events, and audit logs.
- Resolve website visitors, WhatsApp users, Messenger/Instagram IDs, and callers into tenant-scoped contact profiles.
- Use a unified inbox view with contact context, latest message, handoff state, and next action.
- Manage WhatsApp templates and view the 24-hour response-window compliance state.
- Record provider delivery outcomes for social messaging sends.
- Surface workflow recommendations for handoffs, WhatsApp readiness, and contact completion.
- Run on Railway Postgres with `pgvector`, with local Docker Postgres as an optional fallback.
- Use adapter interfaces for Website, WhatsApp, Instagram/Messenger, TikTok, and Telephone.
- Run core guardrail and tenant-isolation tests without external credentials.

## Repository Layout

```text
apps/api       Fastify API, admin endpoints, public widget endpoints, webhooks
apps/admin     Next.js internal/customer dashboard MVP
apps/widget    Embeddable website chatbot script and example page
apps/workers   Background job foundation for parsing, embeddings, retries, metering
apps/voice     Telephone voice bridge with a generic /voice/turn API and legacy Twilio route
packages/core  Answer engine, policy enforcement, retrieval, guardrails
packages/db    Drizzle schema, migrations, tenant-safe repository, seed data
packages/channels Channel adapter contracts and mock/provider skeletons
docs           Architecture, API, security/GDPR, integration notes
```

## Railway Postgres Setup

Railway Postgres is the production database for this project. Add a Railway Postgres service, copy the `DATABASE_URL`, and use that same connection string for the API, workers, voice service, and migrations.

```bash
pnpm install
cp .env.example .env
pnpm db:check
pnpm db:migrate
pnpm db:seed
pnpm dev:api
```

Set `DATABASE_URL` in `.env` before running the DB commands:

```bash
DATABASE_URL='postgresql://USER:PASSWORD@HOST:PORT/railway?sslmode=require'
```

See [docs/supabase.md](docs/supabase.md) for the PostgreSQL setup notes.

## Optional Local Docker Setup

```bash
pnpm install
cp .env.example .env
# Change DATABASE_URL back to postgres://assaddar:assaddar@localhost:5432/assaddar_ai_communication
docker compose up -d
pnpm db:migrate
pnpm db:seed
pnpm dev:api
```

In separate terminals:

```bash
pnpm dev:admin
pnpm dev:widget
pnpm dev:voice
```

Default local URLs:

- API: `http://localhost:4000`
- Admin dashboard: `http://localhost:3000`
- Widget dev server: `http://localhost:5174`
- Voice webhook service: `http://localhost:4100`

The seed command creates a sample tenant with approved FAQ knowledge. The seed output prints the public assistant ID for widget testing.

## Embed Widget

```html
<script
  src="http://localhost:5174/src/widget.ts"
  data-assistant-id="PUBLIC_ID_FROM_TENANT"
  data-api-url="http://localhost:4000"
  async
></script>
```

Production builds output `apps/widget/dist/widget.js`, which should be served from the widget host:

```html
<script
  src="https://chat.example.com/widget.js"
  data-assistant-id="PUBLIC_ID"
  async
></script>
```

## API Smoke Test

```bash
curl -H "x-admin-token: change-me-dev-admin-token" \
  -H "content-type: application/json" \
  -d '{"name":"Demo Business","slug":"demo-business"}' \
  http://localhost:4000/admin/tenants
```

Add approved knowledge:

```bash
curl -H "x-admin-token: change-me-dev-admin-token" \
  -H "content-type: application/json" \
  -d '{"question":"What are your opening hours?","answer":"We are open Monday to Friday from 09:00 to 18:00.","tags":["opening-hours"]}' \
  http://localhost:4000/admin/tenants/TENANT_ID/knowledge/faqs
```

Test the answer engine:

```bash
curl -H "x-admin-token: change-me-dev-admin-token" \
  -H "content-type: application/json" \
  -d '{"message":"When are you open?"}' \
  http://localhost:4000/admin/tenants/TENANT_ID/test-assistant
```

## Tests

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm smoke:api
```

The default test suite covers:

- Grounded answers from approved tenant knowledge.
- Refusals for unknown and blocked topics.
- Cross-tenant data isolation.
- API widget/admin integration using Fastify injection.
- Tenant-scope helpers and table metadata.

`pnpm smoke:api` uses `.env`, starts the API if it is not already running, loads the seeded `demo-business` tenant, fetches widget config, and sends a real widget chat request. It writes a conversation/message/usage event to the configured database, so run `pnpm db:seed` first.

GitHub Actions runs `pnpm test`, `pnpm typecheck`, and `pnpm build` on pushes to `main` and pull requests.

## Important Defaults

- Tenant-scoped tables include `tenant_id`.
- Database migrations enable PostgreSQL row-level security policies where possible.
- Runtime repository methods require tenant IDs for tenant data.
- Sensitive tokens are modeled as encrypted values. Real deployments should use a KMS or secret manager-backed encryption provider.
- The MVP answer engine is extractive and deterministic. It does not use customer data to train shared models.
- OpenAI integration is represented through provider interfaces and environment variables, but the local MVP does not require an API key.

See [docs/architecture.md](docs/architecture.md), [docs/api.md](docs/api.md), [docs/security-gdpr.md](docs/security-gdpr.md), [docs/integrations.md](docs/integrations.md), and [docs/supabase.md](docs/supabase.md).

Deployment setup is documented in [docs/deployment.md](docs/deployment.md).
