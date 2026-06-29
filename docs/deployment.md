# Deployment

This repo is deployment-ready as a single Docker image that runs different services based on the `SERVICE` environment variable.

## Services

Create one deployed service for each runtime:

| Runtime         | SERVICE value | Start command                    |
| --------------- | ------------- | -------------------------------- |
| API             | `api`         | `node scripts/start-service.mjs` |
| Admin dashboard | `admin`       | `node scripts/start-service.mjs` |
| Widget host     | `widget`      | `node scripts/start-service.mjs` |
| Voice webhook   | `voice`       | `node scripts/start-service.mjs` |
| Workers         | `workers`     | `node scripts/start-service.mjs` |

The shared `Dockerfile` installs the workspace, builds every package, and starts the selected runtime. `railway.toml` tells Railway to build with that Dockerfile.

## Required Variables

Set these on every runtime unless noted otherwise:

```text
NODE_ENV=production
SERVICE=api|admin|widget|voice|workers
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
```

API:

```text
ADMIN_API_TOKEN=<random 32+ byte token>
WIDGET_ALLOWED_ORIGINS=https://your-admin-domain,https://your-widget-domain,https://customer-site.example
API_PUBLIC_URL=https://your-api-domain
ADMIN_PUBLIC_URL=https://your-admin-domain
META_VERIFY_TOKEN=<random verify token>
META_GRAPH_API_VERSION=v25.0
CHANNEL_CREDENTIAL_MASTER_KEY=base64:<32-byte-base64-key>
WHATSAPP_ACCESS_TOKEN=<only when WhatsApp sending is enabled>
MESSENGER_PAGE_ACCESS_TOKEN=<only when Messenger/Instagram sending is enabled>
```

`ADMIN_API_TOKEN` remains the root/bootstrap fallback. Normal project users log in through `/auth/login`; sessions are stored in Railway Postgres and sent as HttpOnly cookies by the API. Keep the admin domain in `WIDGET_ALLOWED_ORIGINS` because the API enables credentialed CORS for the admin app.

`CHANNEL_CREDENTIAL_MASTER_KEY` enables app-managed encryption for channel
tokens saved in Postgres. Generate a 32-byte key, store it only in the platform
secret manager, and set the same value on API, voice, and workers. Example:

```bash
openssl rand -base64 32
```

Optional lead notifications:

```text
LEAD_NOTIFICATION_WEBHOOK_URL=https://hooks.example.com/lead
LEAD_NOTIFICATION_EMAIL_TO=owner@example.com
LEAD_NOTIFICATION_EMAIL_FROM=owner@example.com
LEAD_NOTIFICATION_SMTP_HOST=smtp.example.com
LEAD_NOTIFICATION_SMTP_PORT=465
LEAD_NOTIFICATION_SMTP_SECURE=true
LEAD_NOTIFICATION_SMTP_USER=<smtp username>
LEAD_NOTIFICATION_SMTP_PASSWORD=<smtp password>
```

These SMTP settings power owner lead alerts, visitor confirmation emails, and
the admin weekly report action. The per-tenant Automation tab controls whether
owner alerts, visitor confirmations, auto-qualification, stale lead reminders,
and weekly summaries are enabled.

Admin:

```text
NEXT_PUBLIC_API_BASE_URL=https://your-api-domain
```

Voice:

```text
VOICE_PUBLIC_URL=https://your-voice-domain
VOICE_SIP_DOMAIN=<sip-target-domain-for-provider-trunks>
VOICE_EDGE_SECRET=<shared-secret-for-sip-edge-hmac>
VOICE_RATE_LIMIT_MAX=120
VOICE_RATE_LIMIT_WINDOW=1 minute
TWILIO_ACCOUNT_SID=<legacy Twilio route only>
TWILIO_AUTH_TOKEN=<legacy Twilio route only>
TWILIO_FROM_NUMBER=<legacy outbound calling only>
TWILIO_TRANSFER_PHONE_NUMBER=<legacy press-0 transfer only>
TWILIO_VOICE_LANGUAGE=de-DE
TWILIO_VOICE_NAME=alice
```

OpenAI is optional for the current deterministic MVP:

```text
OPENAI_API_KEY=<only when provider-backed generation is enabled>
OPENAI_TEXT_MODEL=gpt-4.1-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_VOICE_MODEL=gpt-4o-mini-tts
OPENAI_TIMEOUT_MS=10000
```

## Enabling Semantic Retrieval

Retrieval runs keyword-only by default. To turn on hybrid keyword + semantic
search (pgvector):

1. Set `OPENAI_API_KEY` (and optionally `OPENAI_EMBEDDING_MODEL`) in the API and
   workers environments.
2. Apply migrations so the embedding column and ANN index exist:

   ```bash
   pnpm db:migrate
   ```

3. Backfill embeddings for existing approved knowledge:

   ```bash
   pnpm backfill:embeddings
   ```

The backfill is idempotent — it only embeds chunks that are still missing an
embedding, so re-running it (e.g. on a schedule) picks up newly added knowledge.
The answer engine automatically uses semantic results once embeddings exist and
falls back to keyword-only retrieval on any embedding-provider failure.

## Railway CLI Flow

```bash
railway init --name assaddar-ai-communication
railway add --service assaddar-api
railway add --service assaddar-admin
railway add --service assaddar-widget
railway add --service assaddar-voice
railway add --service assaddar-workers
railway add --database redis
```

For each service, set `SERVICE` and the required variables, then deploy:

```bash
railway up --service assaddar-api --detach
railway up --service assaddar-admin --detach
railway up --service assaddar-widget --detach
railway up --service assaddar-voice --detach
railway up --service assaddar-workers --detach
```

Generate public domains for API, admin, widget, and voice:

```bash
railway domain --service assaddar-api
railway domain --service assaddar-admin
railway domain --service assaddar-widget
railway domain --service assaddar-voice
```

After domains exist, update:

```text
NEXT_PUBLIC_API_BASE_URL=https://your-api-domain
WIDGET_ALLOWED_ORIGINS=https://your-admin-domain,https://your-widget-domain,https://customer-site.example
```

Then redeploy API and admin.

## Smoke Checks

```bash
curl https://your-api-domain/health
curl https://your-voice-domain/health
curl https://your-widget-domain/widget.js
```

For an end-to-end API check against a deployed API:

```bash
API_BASE_URL=https://your-api-domain pnpm smoke:api
```

## Observability

The API exposes Prometheus metrics at `GET /metrics` (text exposition format v0.0.4, dependency-free). Scrape it from inside the private network — it is intentionally unauthenticated and exposes only aggregate, low-cardinality series (`http_requests_total`, `http_request_duration_seconds`, `errors_total`, plus process gauges). See [api.md](api.md#metrics) for the full series list and the route-template labelling that keeps tenant ids out of metrics.

Unexpected 500s are funnelled through a `captureException` seam (`apps/api/src/observability.ts`) that logs them structurally and counts them in `errors_total`. To wire up error reporting, install `@sentry/node` and forward to it from that seam when `SENTRY_DSN` is set.
