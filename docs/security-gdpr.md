# Security And GDPR Notes

## Data Isolation

- All tenant data tables include `tenant_id`.
- Repository methods require tenant scope for tenant data access.
- Public assistant IDs do not expose internal tenant UUIDs.
- Migration SQL enables row-level security on tenant-scoped tables, and the repository sets `app.current_tenant_id` per transaction for every tenant-scoped read/write.
- The tenant-scoped RLS list includes memberships, tenant invites, subscriptions, API keys, channel connections, webhook events, audit logs, knowledge, conversations, messages, calls, handoffs, deliveries, and WhatsApp templates.
- **RLS is defense in depth; the repository's explicit `tenant_id` predicates are the primary boundary and the API always enforces tenant scope before querying.**

### Enforcing the RLS backstop (recommended for production)

Postgres exempts a table's **owner** from its own RLS policies unless `FORCE ROW LEVEL SECURITY` is set. Because the app historically connects as the owner, the policies do nothing by default. To make the backstop real:

1. **Provision a non-owner application role** with `scripts/create-app-role.sql` (login, `NOSUPERUSER`, `NOBYPASSRLS`, DML-only grants). Point `APP_DATABASE_URL` at it. The API uses `APP_DATABASE_URL`; migrations and the trusted workers service keep using the owner `DATABASE_URL` (the workers sweep across all tenants).
2. **Force RLS** with `scripts/enable-force-rls.sql` (run as the owner).
3. **Verify** with `pnpm db:check`, which reports whether RLS is actually enforced for the app role and, when `REQUIRE_DB_RLS=true`, fails if it is not — so a misconfigured deploy is caught before it serves traffic.

The admin **privacy boundary** is enforced at the API layer independently of RLS: the platform admin token and any `platform_owner` without a real tenant membership are denied (`403`) on all end-user personal-data routes (messages, transcripts, inbox, contacts, per-tenant export). They may only reach aggregate/health/analytics routes. Genuine member access to content is written to the audit log.

## Secrets

- Real secrets belong in a secret manager, not `.env` files committed to Git.
- Supabase/Postgres `DATABASE_URL` must stay server-side only.
- Channel access tokens are stored through an AES-256-GCM credential cipher when
  `CHANNEL_CREDENTIAL_MASTER_KEY` is configured. Ciphertexts are bound to the
  tenant, channel, provider, and credential type so copied ciphertext cannot be
  decrypted in a different context. A future KMS/envelope-encryption provider
  can replace the env-key implementation behind the same interface.
- API keys should be stored as hashes, not plaintext.
- `ADMIN_API_TOKEN` is retained as an internal/root fallback. Normal project access uses Supabase Auth bearer tokens plus app-owned `users`, `roles`, and `memberships` for tenant authorization.
- Legacy password hashes and session tokens may remain during rollout; new project logins should use Supabase Auth instead of app-stored passwords.
- `SUPABASE_SERVICE_ROLE_KEY` must stay server-side and must never be exposed through browser-visible `NEXT_PUBLIC_*` variables.
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
- Scheduled retention cleanup runs in the workers service (`retention.cleanup`, gated behind `RETENTION_CLEANUP_ENABLED`). It prunes conversation history **and calls/voice transcripts** older than the tenant's window — calls are pruned independently by their own start time because they only `SET NULL` their conversation reference, and their transcripts cascade.
- **Right to erasure (Art. 17)** for a single data subject: `DELETE /admin/tenants/:tenantId/contacts/:contactId` (repository `deleteContact`) removes the contact and, by default, the conversations they took part in — including messages, feedback, and any linked calls/transcripts — in one transaction. It requires a real `tenant_admin`+ membership (the platform admin token cannot erase a tenant's data) and writes a `contact.erased` audit entry.
- `exportTenantData` provides the Art. 15/20 data export (all tenant-scoped records including messages, deliveries, contacts, and templates).
- `deleteTenantData` deletes all tenant-owned data through cascading foreign keys (account closure).
- Production should still add legal-hold handling and a verified data-subject requester workflow (identity confirmation) in front of the erasure endpoint.

## Audit

- Tenant creation and FAQ creation write audit logs.
- Access to tenant end-user personal data (conversation messages, per-tenant export) is written to the audit log with the authenticated actor (`recordAuditEvent` records `actorType`/`actorId`), so PII access is traceable (GDPR Art. 5(2)/30 accountability).
- Admin impersonation is not implemented in the MVP and should remain avoided or heavily audited.
- Production should continue to expand before/after metadata for sensitive settings changes.

## Deployment

- Prefer EU-hosted PostgreSQL, Redis, object storage, and provider regions where available.
- Use TLS everywhere.
- Use separate environments and credentials for development, staging, and production.
- Enable database backups with tenant-level restore procedures.
