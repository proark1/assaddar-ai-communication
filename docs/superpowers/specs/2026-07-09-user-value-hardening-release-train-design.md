# User Value And Hardening Release Train Design

Date: 2026-07-09

## Purpose

This release train completes the missing user-value milestones from
`docs/user-value-top-10-implementation-plan.md` while also closing the remaining
hardening gaps from `docs/improvement-plan.md`.

The work is intentionally treated as one coordinated release train, not as a
single unstructured patch. The admin UX, public portal, playbook system,
compliance controls, observability, and voice-edge safety changes affect
different runtime surfaces and need separate contracts, tests, and rollout
switches.

## Current State

Already implemented:

- Daily command center and ranked next actions.
- Knowledge gaps v1 with grouped unanswered questions and per-item suggestion
  approval flow.
- Lead follow-up cockpit basics: queues, scoring, pipeline, drawer, reply
  drafts, follow-up calendar export.
- Contact memory and handoff copilot summaries.
- Telephone setup and deterministic voice quality summary.
- Playbook and customer portal preview panels.
- Existing metrics endpoint, retention cleanup primitives, audit logs, and
  tenant-scoped repository methods.

Still missing:

- Bulk knowledge gap actions.
- Tenant-aware owner assignment instead of hard-coded `Assad Dar` defaults.
- Full contact memory workspace.
- Checklist-driven channel setup concierge across all channel cards.
- Trust and Control Center with data controls and safety tests.
- Durable playbook preview/apply API, idempotent application, and audit record.
- Signed scoped customer portal links and public portal endpoints.
- Server-side consent persistence.
- Append-only audit-log database enforcement.
- Production-safe retention cleanup behavior.
- Labelled delivery and answer outcome metrics.
- Request sequencing guards for stale admin fetches.
- Voice-edge dialog validation, RTP inactivity timeout, and production
  disclosure/opt-out enforcement.

## Release Architecture

The release train has four lanes guarded by feature flags or explicit runtime
configuration.

### Lane 1: `adminValueV2`

Completes admin-facing product value:

- Bulk knowledge gap selection and actions.
- Contact memory drawer or enriched panel.
- Channel setup concierge.
- Trust and Control Center.
- Tenant-aware lead and handoff ownership.

### Lane 2: `playbooksAndPortal`

Adds durable repeatable setup and customer continuation:

- Code-backed playbook registry.
- Applied playbook persistence.
- Playbook preview/apply endpoints.
- Signed scoped portal-link creation.
- Public portal read/update endpoints.
- Admin controls to copy and disable portal links.

### Lane 3: `complianceOpsV2`

Closes compliance and observability gaps:

- Server-side consent event persistence.
- Append-only audit logs for the app role.
- Production-safe retention cleanup behavior.
- Labelled answer and delivery counters.
- Request sequencing guards for admin list fetches.

### Lane 4: `voiceEdgeHardeningV2`

Finishes voice-edge safety:

- SIP BYE/CANCEL dialog validation.
- RTP inactivity timeout.
- Non-empty AI/recording disclosure and opt-out text in production.

Each lane must be independently testable and enableable. The release train can
merge as one coordinated body of work, but each runtime surface keeps its own
verification and rollback boundary.

## Data Model

### Applied Playbooks

Add an `applied_playbooks` table:

- `id`
- `tenant_id`
- `playbook_key`
- `playbook_version`
- `status`
- `applied_by_user_id`
- `preview`
- `changes`
- `created_at`
- `applied_at`

The `(tenant_id, playbook_key, playbook_version)` combination is unique for
applied records, so retries are idempotent.

### Portal Links

Add a `portal_links` table:

- `id`
- `tenant_id`
- `conversation_id`
- `contact_id`
- `token_hash`
- `scope`
- `expires_at`
- `disabled_at`
- `created_by_user_id`
- `created_at`
- `last_used_at`

Only token hashes are stored. Raw tokens are shown once at creation time.

### Consent Events

Add a `consent_events` table:

- `id`
- `tenant_id`
- `conversation_id`
- `contact_id`
- `source`
- `text`
- `text_version`
- `locale`
- `user_agent`
- `metadata`
- `created_at`

Consent events are append-only records. They are tenant-scoped, included in
tenant export, and pruned by tenant retention cleanup using `created_at`.

### Audit Enforcement

Add a migration that prevents `UPDATE` and `DELETE` of `audit_logs` by the app
role. The application keeps insert and read behavior unchanged.

## API Contracts

### Knowledge Gaps

Add these endpoints:

- `POST /admin/tenants/:tenantId/knowledge/suggestions/bulk-draft`
- `POST /admin/tenants/:tenantId/knowledge/suggestions/bulk-approve`
- `POST /admin/tenants/:tenantId/knowledge/suggestions/bulk-reject`

Approval remains explicit and tenant-admin-gated. Bulk endpoints return per-item
success/failure results so one invalid suggestion does not hide the rest of the
batch outcome.

### Playbooks

Add:

- `POST /admin/tenants/:tenantId/playbooks/preview`
- `POST /admin/tenants/:tenantId/playbooks/apply`

Rules:

- Preview returns a dry-run diff.
- Apply is idempotent.
- Existing tenant data is not overwritten unless the field is empty or an
  explicit `overwrite` option is provided.
- Apply writes an audit event and an applied playbook record.

### Portal

Add:

- `POST /admin/tenants/:tenantId/portal-links`
- `POST /admin/tenants/:tenantId/portal-links/:linkId/disable`
- `GET /portal/conversations/:token`
- `POST /portal/conversations/:token/details`

Rules:

- Tokens are signed, random, hashed at rest, scoped, and expiring.
- A token can access only its intended tenant/contact/conversation scope.
- Portal endpoints do not require admin authentication and must fail closed.
- Tenant portal disablement blocks access even for otherwise valid tokens.

### Consent

Add a lightweight public endpoint:

- `POST /widget/consent`

The widget calls this when a visitor accepts the consent notice. Widget UX does
not block forever on failure, but failures are logged and counted.

### Metrics

Extend the metrics registry with low-cardinality counters:

- `message_delivery_total{channel,provider,status}`
- `answer_outcome_total{status}`

Labels must never include tenant IDs, user IDs, conversation IDs, phone numbers,
emails, or free-form error text.

## Admin UX

### Knowledge Gaps

The knowledge workspace adds:

- Selectable grouped gaps and suggestions.
- Bulk draft, approve, and reject actions.
- Clear role-aware disabled states.
- Existing single-item draft/edit/approve/reject controls.

### Leads And Ownership

Replace hard-coded `Assad Dar` assignment with a helper:

- Assad Dar defaults only for the Assad Dar AI Consultancy tenant.
- Platform owners can choose Assad Dar only through an explicit owner selection
  control.
- Other tenants default to existing assignee or unassigned.

### Contact Memory

Upgrade the current memory strip into a fuller drawer or panel:

- Channel identifiers.
- Email, phone, company, and missing fields.
- Recent conversations.
- Open handoffs.
- Last AI answer status when available.
- Actions to complete contact details.

Automatic contact merging is out of scope for this train.

### Channel Setup Concierge

Convert channel cards into checklist-driven setup flows:

- Required fields.
- Current status.
- Last test result when available.
- One primary next action.
- Health check action where supported.

Telephone keeps the existing deeper setup and voice quality panel.

### Trust And Control Center

Add a concrete control surface for:

- Answer trust signals and "why this answer" details.
- Retention days.
- Tenant export and delete affordances.
- Audit/logging explanation.
- Consent status.
- Safety test prompts for accepted, refused, and handoff outcomes.

No secrets are displayed.

### Playbooks

Replace preview-only playbook status with:

- Playbook selector.
- Dry-run preview.
- Apply action.
- Change summary.
- Applied metadata and audit status.

### Customer Portal

Admin controls:

- Create scoped portal link for a conversation/contact.
- Copy link.
- Disable link.
- Show expiry and last-used status.

Public portal:

- Conversation summary.
- Latest status.
- Missing details form.
- Booking CTA.
- Option to send another message.

## Reliability And Security

### Portal Security

Portal tokens fail closed on:

- Bad signature.
- Unknown hash.
- Expired token.
- Disabled link.
- Disabled tenant portal.
- Tenant/contact/conversation scope mismatch.

Portal responses reveal only the scoped data needed for customer continuation.

### Playbook Safety

Playbook application:

- Is idempotent.
- Uses tenant-scoped repository methods.
- Does not overwrite live knowledge/settings without explicit permission.
- Writes audit events.

### Consent Safety

Consent persistence:

- Is append-only.
- Records the displayed text and source.
- Logs and counts failures.
- Does not block the visitor from continuing once accepted locally.

### Audit Safety

Audit logs:

- Remain insertable by the app.
- Become non-updatable and non-deletable by the app role.
- Have tests covering blocked mutation.

### Retention Safety

In production:

- Retention cleanup defaults to enabled, or startup fails/warns loudly when
  explicitly disabled.
- Cleanup continues to respect each tenant's `retention_days`.

### Admin Fetch Safety

Debounced/list fetches use request sequence guards so older responses cannot
overwrite newer results.

### Voice Safety

Voice-edge behavior:

- BYE/CANCEL are accepted only when they match the active dialog.
- RTP inactivity closes abandoned sessions.
- Production config requires non-empty AI/recording disclosure and opt-out
  guidance.

## Testing Plan

Required checks:

- `pnpm lint`
- `pnpm format:check`
- `pnpm test`
- `pnpm typecheck`
- `pnpm build`
- `pnpm quality:budgets`
- DB migration/check tests where available.
- Go tests for voice-edge.

Focused coverage:

- Bulk knowledge selection and role gating.
- Playbook dry-run/apply idempotency.
- Portal token success, expiry, disablement, and scope rejection.
- Consent event persistence.
- Audit-log mutation rejection.
- Metrics output for new counters without sensitive labels.
- Request sequencing guards.
- Voice-edge dialog validation and RTP inactivity timeout.

## Rollout

Rollout order:

1. Add migrations and repository contracts behind flags.
2. Add API endpoints and tests.
3. Wire admin surfaces behind flags.
4. Add public portal endpoints and minimal portal UI.
5. Enable compliance/ops behavior in non-production test environments.
6. Enable voice-edge hardening with Go tests.
7. Enable flags gradually for production tenants.

Rollback:

- Disable feature flags for admin/playbook/portal/compliance UI.
- Keep additive tables in place.
- Disable portal link creation while retaining existing link records.
- Voice-edge hardening can be toggled through config only where doing so does
  not weaken production disclosure requirements.

## Out Of Scope

- Automatic contact merging.
- AI-generated live answer publishing without tenant-admin approval.
- Full document upload in the customer portal.
- New billing or pricing features.
- Redesigning the admin app shell.
- Replacing the current metrics registry with a third-party library.

## Acceptance Criteria

- The admin product surfaces complete the missing user-value plan items.
- Customer portal links are signed, scoped, expiring, and disableable.
- Playbook application is previewable, idempotent, and audited.
- Consent acceptance is persisted server-side.
- Audit logs are append-only for the app role.
- Retention cleanup behavior is production-safe.
- New metrics cover answer outcomes and delivery statuses.
- Admin list fetches cannot be overwritten by stale responses.
- Voice-edge validates dialog teardown and times out inactive RTP sessions.
- All required checks pass.
