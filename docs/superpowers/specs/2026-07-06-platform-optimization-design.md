# Platform Optimization Design

## Context

The repository is already in a healthy baseline state: lint, format, TypeScript,
Vitest, Playwright, build, and production dependency audit pass. The main
opportunities are performance, maintainability, deployment size, and stronger
integration coverage around the larger data-access paths.

The work should be delivered in small, verifiable waves. Each wave should keep
existing product behavior intact unless the change is explicitly about removing
duplicate work.

## Goals

- Reduce admin dashboard network duplication and client-side churn.
- Improve admin/Next lint coverage and future test-runner compatibility.
- Make the Docker runtime image leaner and faster to deploy.
- Strengthen database repository confidence with integration-style tests.
- Replace the contact identifier scan fallback with an indexed database lookup.
- Begin splitting large modules along existing product boundaries without broad
  behavioral rewrites.
- Leave major framework upgrades as their own controlled pass.

## Non-Goals

- No UI redesign.
- No auth model replacement.
- No database-table renames or destructive migrations.
- No broad dependency-major upgrade bundled into the refactor wave.
- No behavior changes to tenant isolation, RLS policy semantics, or public API
  contracts unless a test proves an existing bug.

## Phase 1: Quick Wins

1. Admin fetch efficiency:
   - Treat `/admin/tenants/:tenantId/dashboard` as the first-page source of
     truth after tenant selection.
   - Avoid immediately refetching lists that are already included in bootstrap.
   - Debounce search-driven list refreshes so typing does not create a request
     per keystroke.

2. Tooling:
   - Add Next-specific ESLint coverage for the admin app.
   - Migrate away from deprecated `vitest.workspace.ts` to a root Vitest
     projects config.

3. Docker:
   - Convert the Dockerfile to a multi-stage build.
   - Keep build dependencies out of the runtime layer where practical.
   - Preserve the existing `SERVICE`-based startup path.

## Phase 2: Data And Repository Hardening

1. Add a safe migration for indexed contact identifier lookups.
2. Update contact matching to use an indexed JSONB predicate before falling
   back to any bounded in-process scan.
3. Add repository integration tests for the highest-risk paths:
   - tenant-scoped contact matching
   - inbox list enrichment
   - export/erasure coverage
   - retention pruning

The tests may use local Postgres only when `DATABASE_URL` is available; otherwise
they should skip cleanly so ordinary unit-test runs stay fast.

## Phase 3: Structural Cleanup

1. Admin app:
   - Extract dashboard data-loading helpers and hooks first.
   - Split tab/workspace render trees into focused components.
   - Lazy-load heavier workspaces where this does not complicate state
     ownership.

2. API:
   - Move route registration into domain modules: auth, tenants, widget,
     webhooks, billing, voice/telephone, and admin dashboard.
   - Keep `buildServer` as the composition root for shared hooks, metrics,
     auth context, and error handling.

3. Database:
   - Split repository methods by domain only after new tests cover the behavior.

## Phase 4: Upgrade Pass

Run minor dependency updates first. Treat Next 16, Zod 4, Vitest 4, and Vite 8
as separate upgrade branches because they can change runtime, typing, or test
semantics.

## Testing Plan

After each implementation wave:

- `pnpm lint`
- `pnpm format:check`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

When the Go toolchain is available:

- `go test ./...` from `apps/voice-edge`

Before final delivery:

- `pnpm audit --prod`
- `pnpm test:coverage`

## Risks And Controls

- Admin refactors can accidentally change state behavior. Control: start with
  fetch orchestration and tests before component extraction.
- Repository changes can affect tenant isolation. Control: add integration tests
  before replacing fallback behavior.
- Docker slimming can break service startup. Control: preserve
  `scripts/start-service.mjs`, then test at least the normal workspace build.
- Tooling migrations can make CI noisier. Control: keep both local and CI
  commands unchanged from the user's perspective.
