# OneBrain Rollout Observability Design

Date: 2026-07-08

## Summary

Add the operational layer needed before enabling OneBrain sync in production:
tenant-facing sync visibility, a safe service smoke check, and deployment
instructions that make the rollout order explicit.

This is phase 1 of the OneBrain rollout. It does not enable production sync by
default and it does not switch live customer answers to OneBrain.

## Goals

- Show operators whether approved local knowledge has reached OneBrain.
- Surface failed sync records with enough context to act without exposing
  service keys or raw secrets.
- Provide a manual smoke check for OneBrain service credentials before
  `ONEBRAIN_SYNC_ENABLED=true` is set.
- Document the production order: provision OneBrain account/space/key, apply
  migrations, smoke-check credentials, then enable a small sync limit.

## Non-Goals

- Do not set Railway or GitHub production secrets from code.
- Do not enable `ONEBRAIN_SYNC_ENABLED` automatically.
- Do not add OneBrain as the live answer engine.
- Do not modify the local `onebrain` repository in this phase.
- Do not expose `ONEBRAIN_SERVICE_KEY` or service capability details to browser
  clients beyond derived health/status fields.

## Architecture

### Database and Repository

The existing `onebrain_sync_records` table remains the source of truth for local
sync state. Add repository read methods that return:

- aggregate counts by status,
- most recent sync time,
- most recent failure time,
- recent failed records with source ref, error, and update time,
- recent synced records with source ref, external record/job id, and update
  time.

The API should query these through tenant-scoped repository methods so row-level
tenant isolation stays consistent with the rest of the admin data layer.

### API

Add a tenant admin endpoint:

```text
GET /admin/tenants/:tenantId/onebrain-sync
```

The response should include:

- `enabled`: whether OneBrain sync is enabled in this process,
- `configured`: whether URL and service key are configured in this process,
- `stats`: counts by `synced`, `failed`, and other statuses,
- `recentFailures`: a small capped list,
- `recentSynced`: a small capped list,
- `lastSyncedAt`,
- `lastFailedAt`.

The endpoint must not return the service key, full provider config, request
headers, or raw secret-like metadata.

### Admin UI

Add a compact OneBrain sync status panel near the existing knowledge/project
brain area rather than as a new full page. The panel should show:

- current readiness: not configured, disabled, syncing, synced, or failed,
- synced and failed counts,
- last successful sync,
- latest error when present,
- a link or button to the deployment docs/checklist.

The UI should be deliberately small. The broader dashboard is already dense, so
this panel should behave like an operational status strip, not another large
card-heavy module.

### Smoke Check

Add a script:

```text
pnpm smoke:onebrain
```

The script should:

1. Require `ONEBRAIN_API_BASE_URL`, `ONEBRAIN_SERVICE_KEY`, and
   `ONEBRAIN_SPACE_ID`.
2. Call `GET /api/service/capabilities`.
3. Validate that the response supports app `communication` and purpose
   `customer_service_inbox`.
4. Optionally, when `ONEBRAIN_SMOKE_INTAKE=true`, send one synthetic
   `knowledge_update` intake record with a clearly marked `source_ref`.

The default smoke check is read-only. Synthetic intake is opt-in because it
writes into OneBrain.

### Deployment Docs

Update deployment documentation with a concrete rollout checklist:

1. Provision OneBrain account and customer-service space.
2. Mint a communication service key with write access to
   `customer_service_inbox`.
3. Set Railway variables while keeping `ONEBRAIN_SYNC_ENABLED=false`.
4. Apply communication DB migrations.
5. Run `pnpm smoke:onebrain` with production-like env vars.
6. Enable sync with a small `ONEBRAIN_KNOWLEDGE_EXPORT_LIMIT`.
7. Watch the admin sync panel and worker logs.
8. Increase the limit only after failures are understood.

## Data Flow

```text
Worker onebrain.sync
  -> OneBrain service API
  -> onebrain_sync_records
  -> Admin API /onebrain-sync
  -> Admin dashboard status panel
```

The status panel reads local sync state only. It does not call OneBrain from the
browser.

## Error Handling

- Missing OneBrain credentials: smoke script exits non-zero with the missing
  variable names; the admin endpoint reports `configured=false`.
- OneBrain HTTP failure: smoke script prints the status and sanitized detail;
  worker failures continue to be stored in `onebrain_sync_records.last_error`.
- Async OneBrain intake: worker records the returned job id as the external
  handoff id, already supported by the current integration.
- Failed sync rows: API returns only capped, tenant-scoped recent failures.

## Testing

- Repository tests for sync summary aggregation and recent failure listing.
- API tests for the new admin endpoint, including no secret leakage.
- Admin helper/component tests for status derivation.
- Smoke script unit-style validation using a mocked `fetch`.
- Full local gates: budgets, lint, typecheck, tests, build.

## Rollout

This change is safe to deploy before production OneBrain credentials exist. The
admin panel should show disabled/not configured until env vars are present.

After deploy, production sync remains off until an operator sets
`ONEBRAIN_SYNC_ENABLED=true`. The first run should use a small export limit and
synthetic or low-risk approved knowledge.

## Future Phase

Once background sync is stable, add a tenant-gated OneBrain answer-read
experiment. That phase needs separate design for latency, quality comparison,
fallback behavior, and refusal parity with the current local answer engine.
