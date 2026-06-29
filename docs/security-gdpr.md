# Security And GDPR Notes

## Data Isolation

- All tenant data tables include `tenant_id`.
- Repository methods require tenant scope for tenant data access.
- Public assistant IDs do not expose internal tenant UUIDs.
- Migration SQL enables row-level security on tenant-scoped tables.
- The tenant-scoped RLS list includes memberships, tenant invites, subscriptions, API keys, channel connections, webhook events, audit logs, knowledge, conversations, messages, calls, handoffs, deliveries, and WhatsApp templates.
- Production deployments should use a non-owner Railway Postgres application role and set `app.current_tenant_id` per request/transaction when RLS is enabled. Database RLS is defense in depth; the API must still enforce tenant scope before querying.

## Secrets

- Real secrets belong in a secret manager, not `.env` files committed to Git.
- Railway/Postgres `DATABASE_URL` must stay server-side only.
- Channel access tokens are stored through an AES-256-GCM credential cipher when
  `CHANNEL_CREDENTIAL_MASTER_KEY` is configured. Ciphertexts are bound to the
  tenant, channel, provider, and credential type so copied ciphertext cannot be
  decrypted in a different context. A future KMS/envelope-encryption provider
  can replace the env-key implementation behind the same interface.
- API keys should be stored as hashes, not plaintext.
- `ADMIN_API_TOKEN` is retained as an internal/root fallback. Normal project access uses Railway Postgres-backed users, memberships, and HttpOnly session cookies.
- User passwords are stored as salted `scrypt` hashes. Session and invite tokens are stored only as SHA-256 hashes.
- `META_APP_SECRET` is required in production so Meta webhook POST requests are verified with `X-Hub-Signature-256`.

## Roles

- `viewer`: read-only tenant dashboards, inbox, contacts, analytics, handoffs, knowledge, and channel status.
- `operator`: viewer access plus lead, handoff, and assistant-test actions.
- `tenant_admin`: operator access plus tenant settings, knowledge, channel setup, automation, WhatsApp templates, and project users.
- `tenant_owner`: tenant admin access plus tenant export and deletion.
- `platform_owner` / bootstrap token: platform-wide tenant administration. Tenant admins cannot grant this role.

## AI Data Handling

- The MVP answer engine is extractive and deterministic.
- It does not answer from general model knowledge.
- It does not train shared models on customer data.
- Retrieval is keyword-based by default. Setting `OPENAI_API_KEY` enables optional hybrid keyword + semantic retrieval (pgvector); only the chunk text being embedded is sent to the embedding provider, and the engine degrades to keyword-only on any provider failure.
- Future LLM providers must receive only the retrieved tenant context required for the answer.
- The website widget stores a bounded local transcript cache in the visitor browser for continuity: 50 messages maximum, 30-day expiry, and a clear-conversation control. Server-side messages remain governed by tenant retention settings.
- Logs should avoid storing raw provider secrets or unnecessary personal data.

## Abuse And Cost Controls

- Fastify rate limits are enabled globally (configurable via `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW`).
- Stricter per-route limits protect the public and auth surface: `POST /auth/login` (10 / 5 min, brute-force throttle), `POST /widget/chat` (30 / min), `POST /widget/leads` (10 / min), `POST /widget/readiness` (20 / min), `POST /widget/events` (60 / min).
- The widget adds client-side throttling.
- Tenants have message length limits.
- Usage events log credits and metadata by tenant/channel.
- Blocked topics prevent common off-topic and high-risk prompts before retrieval.

## Sessions And Logging

- Login returns a generic `Invalid email or password.` and never reveals whether an account exists.
- Expired sessions are pruned on a background interval and on demand (`deleteExpiredSessions`), so the session table does not grow unbounded.
- Request logs redact `x-admin-token`, `authorization`, `cookie`, and `set-cookie`.
- Every response carries an `x-request-id` correlation id (honours an inbound `x-request-id`) for cross-service tracing.
- `GET /health` is a cheap liveness probe; `GET /ready` verifies database connectivity and returns `503` when the database is unreachable.

## Retention And Subject Rights

- Tenants have `retention_days`.
- `exportTenantData` supports data export foundations.
- `deleteTenantData` deletes tenant-owned data through cascading foreign keys.
- Production should add scheduled retention cleanup, legal hold handling, and verified requester workflows.

## Audit

- Tenant creation and FAQ creation write audit logs.
- Admin impersonation is not implemented in the MVP and should remain avoided or heavily audited.
- Production should add actor IDs from real auth and include before/after metadata for sensitive settings changes.

## Deployment

- Prefer EU-hosted PostgreSQL, Redis, object storage, and provider regions where available.
- Use TLS everywhere.
- Use separate environments and credentials for development, staging, and production.
- Enable database backups with tenant-level restore procedures.
