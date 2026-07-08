# OneBrain Architecture Compatibility Audit

Date: 2026-07-08

## Scope

This audit compares `assaddar-ai-communication` with the local `onebrain`
repository and checks whether the current integration matches OneBrain's actual
service architecture.

## Verdict

The split-repository architecture is sound:

- `assaddar-ai-communication` should remain the real-time communication runtime
  for channels, conversations, operators, widgets, voice, and billing.
- `onebrain` should remain the scoped memory and knowledge service, exposed to
  other apps through service keys and `/api/service/*`.
- The integration should stay workers-only at first. Live customer answers
  should continue using local approved knowledge until OneBrain latency,
  routing, privacy, and rollout controls are proven in production.

## What Matched

- Both systems have clear deployable boundaries: Node monorepo services here,
  Python FastAPI plus optional workers and Next UI in OneBrain.
- OneBrain exposes the intended service surface:
  `GET /api/service/capabilities`, `POST /api/service/intake`,
  `POST /api/service/capture`, and `POST /api/service/ask`.
- Service keys are server-side only and scoped by account, app, space, purpose,
  and read/write scopes.
- OneBrain intake accepts the same record concepts the communication worker
  sends: `source`, `source_ref`, `record_type`, `intent`, `metadata`,
  `account_id`, `space_id`, `app_id`, and `purpose`.

## Compatibility Fixes Applied

- Changed the default knowledge export purpose from `knowledge_management` to
  `customer_service_inbox`.
  OneBrain's standard `communication` app provisioning grants write access for
  `customer_service_inbox` and read access for `customer_service_answer`.
  Deployments can still override `ONEBRAIN_KNOWLEDGE_PURPOSE` when OneBrain is
  explicitly provisioned for a different purpose.
- Updated the TypeScript OneBrain client to accept both immediate intake
  responses and asynchronous job responses.
  OneBrain can return `202` with a queued `service_intake` job when async
  ingestion is enabled, which is the production-friendly Postgres/worker mode.
- Updated the sync worker to record either the OneBrain intake record id or the
  queued job id as the external handoff id.

## Deployment Requirements

- Provision a OneBrain account whose id matches the communication tenant slug,
  or set `ONEBRAIN_ACCOUNT_ID` for a single-tenant install.
- Use a OneBrain service key with `write` scope for `customer_service_inbox`.
- Set `ONEBRAIN_SPACE_ID` when the target space should be deterministic. If it
  is omitted, OneBrain can route intake only when the service key/app
  installation gives it enough allowed spaces to choose from.
- Keep `ONEBRAIN_SYNC_ENABLED=false` until the OneBrain account, app
  installation, service key, and worker process are live.

## Recommended Next Steps

1. Add a production smoke test that posts one synthetic approved knowledge item
   to OneBrain and verifies either an intake record or queued job is returned.
2. Add an operator-facing sync status surface after the first real deployment,
   using `onebrain_sync_records` as the source of truth.
3. Only after successful background sync, add a guarded answer-read path through
   OneBrain for selected tenants and compare quality, latency, and refusal
   behavior against the local answer engine.
