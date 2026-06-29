# API

Base URL in local development: `http://localhost:4000`

Admin endpoints use project user sessions by default:

```http
cookie: assaddar_session=...
```

The bootstrap admin token is retained for initial setup and emergency platform administration:

```http
x-admin-token: change-me-dev-admin-token
```

Tenant role requirements:

- `viewer`: read-only tenant data.
- `operator`: lead, handoff, and assistant-test mutations.
- `tenant_admin`: tenant settings, knowledge, channels, automation, WhatsApp templates, and user/invite management.
- `tenant_owner`: tenant export and deletion.
- `platform_owner` / bootstrap token: platform-wide tenant creation and administration.

## Health & Readiness

```http
GET /health
```

Cheap liveness probe: `{ "ok": true, "service": "..." }`.

```http
GET /ready
```

Readiness probe that verifies database connectivity. Returns `200` with `{ "ok": true, "db": "up" }` or `503` with `{ "ok": false, "db": "down" }`.

Every response includes an `x-request-id` correlation header (an inbound `x-request-id` is honoured).

## Metrics

```http
GET /metrics
```

Prometheus metrics in text exposition format v0.0.4 (`Content-Type: text/plain; version=0.0.4`). Dependency-free — implemented in-process, no `prom-client`.

Exposed series:

- `http_requests_total{method,route,status}` — request counter.
- `http_request_duration_seconds{method,route}` — request-latency histogram (`_bucket`/`_sum`/`_count`).
- `errors_total{kind}` — captured (unhandled) 500-class errors, by error kind.
- `process_uptime_seconds`, `process_resident_memory_bytes` — process gauges.

Routes are labelled by their **template** (e.g. `/admin/tenants/:tenantId`), never the raw URL, so path params (tenant ids, etc.) cannot blow up label cardinality or leak into metrics. Unmatched routes collapse to `route="<unmatched>"`.

This endpoint is **unauthenticated** by design — the conventional setup for a metrics endpoint scraped over a private network (cluster network policy / firewall). It exposes only aggregate, low-cardinality counters/gauges, never tenant data or secrets. If it must be reachable over an untrusted network, restrict it at the gateway/network layer rather than the admin token.

### Error reporting (Sentry seam)

Unexpected 500s flow through a `captureException` seam (`apps/api/src/observability.ts`) that logs the error structurally and increments `errors_total`. To enable Sentry: install `@sentry/node` and forward to it inside `captureException` when `SENTRY_DSN` is set — no call sites change.

## Rate Limits

A global per-IP limit applies (`RATE_LIMIT_MAX`, default 120/min). Stricter per-route limits protect public and auth endpoints: `POST /auth/login` 10 / 5 min, `POST /widget/chat` 30 / min, `POST /widget/leads` 10 / min, `POST /widget/readiness` 20 / min, `POST /widget/events` 60 / min. Exceeding a limit returns `429`.

## Create Tenant

```http
POST /admin/tenants
content-type: application/json

{
  "name": "Demo Business",
  "slug": "demo-business"
}
```

Returns the tenant, including `id` and public `publicId`. The public ID is safe to expose in the widget. The internal tenant ID is not.

## Add FAQ Knowledge

```http
POST /admin/tenants/{tenantId}/knowledge/faqs
content-type: application/json

{
  "question": "What are your opening hours?",
  "answer": "We are open Monday to Friday from 09:00 to 18:00.",
  "tags": ["opening-hours", "faq"]
}
```

FAQ entries are stored as approved knowledge source, document, and chunk records under that tenant.

## Test Assistant

```http
POST /admin/tenants/{tenantId}/test-assistant
content-type: application/json

{
  "message": "When are you open?"
}
```

Returns:

```json
{
  "conversationId": "conv_...",
  "answer": {
    "status": "answered",
    "text": "We are open Monday to Friday from 09:00 to 18:00.",
    "confidence": 0.5,
    "intent": "opening_hours",
    "citations": []
  }
}
```

## Widget Config

```http
GET /widget/config/{assistantId}
```

Returns public tenant/widget config. `assistantId` is the tenant `publicId`, not the internal tenant UUID.

## Widget Chat

```http
POST /widget/chat
content-type: application/json

{
  "assistantId": "asst_...",
  "conversationId": "conv_...",
  "visitorId": "visitor_...",
  "message": "Which services do you offer?"
}
```

Returns the reply, status, citations, and conversation ID. The API stores inbound/outbound messages, usage events, and handoff requests when needed.

## Admin Operations

```http
GET /admin/tenants/{tenantId}/inbox
GET /admin/tenants/{tenantId}/contacts
GET /admin/tenants/{tenantId}/workflows/suggestions
```

The inbox endpoint returns conversations enriched with contact profile, latest message, open handoffs, message count, and next action. Contacts are tenant-scoped profiles merged from channel IDs, email, phone, company, and lead form fields. Workflow suggestions are deterministic operational recommendations for handoffs, WhatsApp readiness, and contact completion.

## WhatsApp Operations

```http
GET /admin/tenants/{tenantId}/whatsapp/templates
POST /admin/tenants/{tenantId}/whatsapp/templates
GET /admin/tenants/{tenantId}/whatsapp/compliance
```

Templates include `name`, `language`, `category`, `status`, `body`, optional `variables`, and optional `providerTemplateId`. Compliance returns the last inbound WhatsApp timestamp, 24-hour response-window state, template counts, and recent delivery outcomes.

## GDPR Helpers

```http
GET /admin/tenants/{tenantId}/export
DELETE /admin/tenants/{tenantId}
```

The export endpoint returns tenant profile, knowledge, contacts, conversations, and handoff records. The delete endpoint cascades tenant-owned data through database foreign keys.

## Webhook Shells

```http
GET /webhooks/meta/{channel}
POST /webhooks/meta/{channel}
```

Supported `channel` values: `whatsapp`, `messenger`, `instagram`.

Verification follows Meta's `hub.mode`, `hub.verify_token`, and `hub.challenge` flow. Payload ingestion is intentionally credential-gated until channel connection mapping is configured.
