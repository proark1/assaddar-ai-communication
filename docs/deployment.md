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
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

`DATABASE_URL` should point at Railway Postgres on API, voice, workers, and
migration jobs. Admin and widget do not need database credentials. Set
`REDIS_URL=${{Redis.REDIS_URL}}` on API and workers.

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
REDIS_URL=${{Redis.REDIS_URL}}
```

`ADMIN_API_TOKEN` remains the root/bootstrap fallback. With Supabase variables
unset, project users log in through the API's legacy email/password session
flow. The API owns tenant authorization through `users`, `roles`, and
`memberships`.

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

Leave `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
unset for the Railway-only session flow.

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
GEMINI_API_KEY=<Gemini key for grounded telephone answers>
GEMINI_TEXT_MODEL=gemini-3.5-flash
GEMINI_ANSWER_TIMEOUT_MS=12000
```

Gemini is used only after approved knowledge has matched, so unsupported
questions still route to handoff instead of freeform answers.

Self-service billing:

```text
SELF_SERVICE_ONBOARDING_ENABLED=true
STRIPE_SECRET_KEY=<stripe-secret-key>
STRIPE_WEBHOOK_SECRET=<stripe-webhook-signing-secret>
STRIPE_NUMBER_PRICE_ID=<recurring-eur-3-phone-number-price>
STRIPE_ACCEPTED_CALL_PRICE_ID=<metered-accepted-call-price>
STRIPE_ACCEPTED_CALL_METER_EVENT_NAME=accepted_call
STRIPE_CUSTOMER_PORTAL_RETURN_URL=https://your-admin-domain
```

OpenAI is optional for embeddings and legacy provider-backed paths:

```text
OPENAI_API_KEY=<only when provider-backed generation is enabled>
OPENAI_TEXT_MODEL=gpt-4.1-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_VOICE_MODEL=gpt-4o-mini-tts
OPENAI_TIMEOUT_MS=10000
```

OneBrain integration has two independent switches:

- Runtime answering in the API and voice services asks OneBrain first, then
  falls back to the local Project Brain if OneBrain is unavailable.
- Background sync in the workers service exports approved local knowledge to
  OneBrain.

Apply migrations before enabling sync so the `onebrain_sync_records` table
exists:

```text
ONEBRAIN_API_BASE_URL=https://your-onebrain-api-domain
ONEBRAIN_SERVICE_KEY=sk_...
ONEBRAIN_SPACE_ID=sp_customer_service
ONEBRAIN_ANSWER_ENABLED=true
ONEBRAIN_REQUIRED=true
ONEBRAIN_FALLBACK_ENABLED=false
ONEBRAIN_SYNC_ENABLED=true
ONEBRAIN_SYNC_INTERVAL_MS=3600000
ONEBRAIN_KNOWLEDGE_EXPORT_LIMIT=50
ONEBRAIN_SMOKE_INTAKE=false
```

Fixed OneBrain service scope:

- OneBrain app id is fixed to `communication`.
- Runtime answers use purpose `customer_service_answer`.
- Approved-knowledge sync and smoke intake use purpose
  `customer_service_inbox`.
- `ONEBRAIN_ACCOUNT_ID` is optional; when omitted, each tenant slug is used as
  the OneBrain account id.

Only enable runtime answering or the scheduler after the target OneBrain
account/space/app installation and scoped service key exist. The service key
must stay on trusted server runtimes; never expose it to admin, widget, or
browser code.

Rollout checklist:

1. Provision the OneBrain account and customer-service space.
2. Mint a communication service key for app `communication` with read access to
   `customer_service_answer` and write access to `customer_service_inbox`.
3. Set `ONEBRAIN_API_BASE_URL`, `ONEBRAIN_SERVICE_KEY`,
   `ONEBRAIN_SPACE_ID`, and optionally `ONEBRAIN_ACCOUNT_ID` while keeping
   `ONEBRAIN_ANSWER_ENABLED=false` and `ONEBRAIN_SYNC_ENABLED=false`.
4. Apply communication database migrations.
5. Run a read-only credential check:

   ```bash
   pnpm smoke:onebrain
   ```

6. If you want to verify write access before enabling the scheduler, run one
   clearly marked synthetic intake:

   ```bash
   ONEBRAIN_SMOKE_INTAKE=true pnpm smoke:onebrain
   ```

   Leave synthetic intake enabled for staging checks and disabled for routine
   production liveness unless smoke records are covered by cleanup/retention.

7. Enable runtime answering with `ONEBRAIN_ANSWER_ENABLED=true` on API and
   voice. Confirm answer traces show `onebrain_answer` passed, skipped, or
   failed with local fallback.
8. Enable sync with a small `ONEBRAIN_KNOWLEDGE_EXPORT_LIMIT`, then watch the
   admin OneBrain sync panel and worker logs. Increase the limit only after
   failures are understood.

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
railway add --database postgres
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

For production defense in depth, provision the non-owner Postgres app role from
`scripts/create-app-role.sql`, set `APP_DATABASE_URL` on API and voice, run
`scripts/enable-force-rls.sql`, and verify with:

```bash
REQUIRE_DB_RLS=true pnpm db:check
```

## Optional Supabase Auth

Supabase Auth remains supported but is not part of the Railway-only production
path. To enable it later, set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` on API, plus `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` on admin, then rebuild admin.

## Voice Edge

`apps/voice` runs on Railway. `apps/voice-edge` is a SIP/RTP edge for providers
such as easybell and needs UDP media ports for RTP. Railway public networking is
HTTP and raw TCP proxying, so keep the SIP/RTP edge on a VM or redesign the
telephone provider path before moving that edge into Railway.

The GitHub production workflow deploys Railway services by default. Set the
repository variable `DEPLOY_VOICE_EDGE=true` only when the external SIP/RTP edge
should also be deployed.

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
