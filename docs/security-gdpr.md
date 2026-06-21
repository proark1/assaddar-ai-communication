# Security And GDPR Notes

## Data Isolation

- All tenant data tables include `tenant_id`.
- Repository methods require tenant scope for tenant data access.
- Public assistant IDs do not expose internal tenant UUIDs.
- Migration SQL enables row-level security on tenant-scoped tables.
- Production deployments should use a non-owner application database role and set `app.current_tenant_id` per request/transaction. Supabase RLS is defense in depth; the API must still enforce tenant scope before querying.

## Secrets

- Real secrets belong in a secret manager, not `.env` files committed to Git.
- Supabase `DATABASE_URL` must stay server-side only.
- Do not expose Supabase service-role keys in frontend environment variables.
- Channel access tokens are modeled as encrypted database values.
- API keys should be stored as hashes, not plaintext.
- `ADMIN_API_TOKEN` is a local MVP admin control, not a complete production auth system.

## AI Data Handling

- The MVP answer engine is extractive and deterministic.
- It does not answer from general model knowledge.
- It does not train shared models on customer data.
- Future LLM providers must receive only the retrieved tenant context required for the answer.
- Logs should avoid storing raw provider secrets or unnecessary personal data.

## Abuse And Cost Controls

- Fastify rate limits are enabled globally.
- The widget adds client-side throttling.
- Tenants have message length limits.
- Usage events log credits and metadata by tenant/channel.
- Blocked topics prevent common off-topic and high-risk prompts before retrieval.

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
