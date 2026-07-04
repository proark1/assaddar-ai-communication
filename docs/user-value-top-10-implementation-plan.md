# User Value Expansion Implementation Plan

Date: 2026-07-04

Source report: `docs/user-value-top-10-report.md`

## Goal

Turn the top 10 value additions into a practical build plan for Assaddar AI
Communication. The plan prioritizes features that make the product feel useful
to business owners and operators quickly, while preserving the platform's core
principle: tenant-owned data, approved knowledge, safe answers, and one customer
timeline across channels.

## Scope

This plan covers product and engineering implementation for:

1. Daily Owner Command Center
2. Knowledge Gap Engine
3. Lead Follow-Up Cockpit
4. Cross-Channel Customer Memory
5. Human Handoff Copilot
6. Channel Setup Concierge
7. Trust And Control Center
8. Voice AI Quality Toolkit
9. Industry Playbooks And Templates
10. Customer Self-Service Portal

The first implementation wave should ship items 1-3 with small pieces of 4-6,
because those use the existing dashboard, unanswered question, handoff, contact,
and workflow suggestion foundations.

## Current Product Foundation

Already available:

- `GET /admin/tenants/{tenantId}/dashboard`
- `GET /admin/tenants/{tenantId}/unanswered`
- `GET /admin/tenants/{tenantId}/workflows/suggestions`
- `GET /admin/tenants/{tenantId}/production-readiness`
- `GET /admin/tenants/{tenantId}/contacts`
- `GET /admin/tenants/{tenantId}/inbox`
- `GET /admin/tenants/{tenantId}/handoffs`
- `POST /admin/tenants/{tenantId}/knowledge/suggestions/scan`
- `POST /admin/tenants/{tenantId}/knowledge/suggestions/{suggestionId}/approve`
- `POST /admin/tenants/{tenantId}/knowledge/suggestions/{suggestionId}/reject`
- tenant users, roles, invites, and platform-owner access
- widget, phone, channel setup, WhatsApp compliance, and voice-edge status UI

Primary frontend files:

- `apps/admin/app/page.tsx`
- `apps/admin/app/page-helpers.ts`
- `apps/admin/app/page-types.ts`
- `apps/admin/app/globals.css`
- focused component files such as `DashboardMetrics.tsx`,
  `AnalyticsPanel.tsx`, `AdminSidebar.tsx`, and `ToastStack.tsx`

Primary backend files:

- `apps/api/src/server.ts`
- `apps/api/src/openapi.ts`
- `packages/db/src/repository.ts`
- `packages/db/src/schema.ts`
- tests under `apps/api/test`, `apps/admin/test`, and `packages/db/test`

## Guiding Principles

- Make value visible before adding complexity.
- Prefer deterministic recommendations before AI generation.
- Keep every read and mutation tenant-scoped.
- Let platform owners see all tenants, but do not weaken tenant isolation.
- Design for small teams: the owner should know what to do next in under five
  minutes.
- Add backend fields only when existing dashboard data cannot support the UI.
- Do not ship AI actions that change live answers without tenant-admin approval.

## Milestone 1: Daily Owner Command Center

Timeline: 2-4 days

Value:

- Gives the owner one operating screen for today.
- Uses existing dashboard, analytics, handoffs, unanswered questions, readiness,
  workflow suggestions, and channel connections.

Implementation:

1. Add a `dailyActions` derived list in `apps/admin/app/page.tsx` or
   `page-helpers.ts`.
2. Rank actions by urgency:
   - open lead/handoff needing response
   - unanswered question with high repetition
   - disconnected or untested channel
   - pending learning suggestion
   - missing contact details
   - production-readiness blocker
3. Add a `Today` command section at the top of `renderHome()`.
4. Add action buttons that deep-link to existing sections:
   - open lead drawer
   - open unanswered/knowledge section
   - open channels setup
   - open project users
   - open production readiness
5. Show a "value pulse" row:
   - leads captured
   - handoffs open
   - unanswered questions
   - connected channels
   - answer coverage score

Suggested files:

- `apps/admin/app/page.tsx`
- `apps/admin/app/page-helpers.ts`
- `apps/admin/app/page-types.ts`
- `apps/admin/app/globals.css`
- `apps/admin/test/page-helpers.test.ts`

Acceptance criteria:

- Owner sees the top 3-6 actions immediately on the Today tab.
- Each action has a clear label, reason, and next button.
- Empty state is positive but specific: "No urgent work. Review answer quality
  or test a channel."
- No new backend endpoint is required for the first version.

Tests:

- Unit tests for action ranking in `page-helpers.test.ts`.
- Component smoke test for rendering action cards.
- Existing `pnpm test`, `pnpm typecheck`, and `pnpm build`.

## Milestone 2: Knowledge Gap Engine

Timeline: 3-5 days

Value:

- Turns customer questions into better approved knowledge.
- Reduces repeated handoffs and refusals.

Implementation:

1. Upgrade the existing "Brain suggestions" / unanswered UI into a "Knowledge
   gaps" workspace.
2. Group unanswered questions by normalized topic and channel.
3. For each group, show:
   - example customer question
   - frequency
   - newest/oldest date
   - suggested tags
   - current draft answer fields
4. Add bulk actions:
   - create drafts from selected gaps
   - approve selected pending suggestions
   - reject selected pending suggestions
5. Keep approval explicit. Do not publish generated or imported knowledge
   without tenant-admin action.
6. Add backend support only if grouping becomes too slow client-side.

Suggested files:

- `apps/admin/app/page.tsx`
- `apps/admin/app/page-helpers.ts`
- `apps/admin/app/page-types.ts`
- `apps/api/src/server.ts` if grouped summary endpoint is needed later
- `packages/db/src/repository.ts` if server-side grouping is added

Acceptance criteria:

- Tenant admin can scan handoff gaps and see the created suggestions.
- Tenant admin can approve, edit, or reject suggestions from one place.
- Viewers/operators can see gaps but cannot publish knowledge.
- Repeated unanswered questions are visibly grouped.

Tests:

- Helper tests for grouping and ranking unanswered questions.
- API tests only if new grouped endpoint is added.
- Regression test that approval still creates approved knowledge and removes
  the suggestion from pending state.

## Milestone 3: Lead Follow-Up Cockpit

Timeline: 4-6 days

Value:

- Shows business impact and missed revenue risk.
- Makes the platform useful for Assad Dar AI Consultancy immediately.

Implementation:

1. Refine the existing Leads tab into three operational queues:
   - hot leads
   - due follow-ups
   - stale leads
2. Add derived labels:
   - high intent
   - missing contact detail
   - waiting for owner
   - proposal-ready
3. Improve the lead detail drawer:
   - AI-readable lead summary
   - next best action
   - reply draft
   - calendar file download
   - status and owner controls
4. Add "Assad Dar" as the default owner assignment only where the selected
   tenant is the Assad Dar AI Consultancy project or the platform owner chooses
   it.
5. Keep pipeline stages simple: new, contacted, qualified, proposal, won, lost.

Suggested files:

- `apps/admin/app/page.tsx`
- `apps/admin/app/page-helpers.ts`
- `apps/admin/app/page-types.ts`
- `apps/api/src/server.ts` for any extra metadata returned in handoffs

Acceptance criteria:

- Owner can identify the next 5 leads to work.
- Lead cards show score, next action, contact method, and age.
- Stale lead reminders appear without backend cron in v1.
- Existing handoff update endpoint handles status/owner changes.

Tests:

- Helper tests for lead scoring, stale lead detection, and next action labels.
- Component tests for lead drawer actions if extracted into a component.

## Milestone 4: Cross-Channel Customer Memory

Timeline: 5-8 days

Value:

- Gives operators one customer view across channels.
- Makes the platform feel like a real communication workspace, not separate
  channel logs.

Implementation:

1. Add a richer contact drawer from Inbox and Leads.
2. Show:
   - known identifiers by channel
   - email, phone, company
   - recent conversations
   - open handoffs
   - last AI answer status
   - missing contact fields
3. Add "complete this contact" actions.
4. Add safe merge suggestions later; do not merge automatically in v1.

Suggested files:

- `apps/admin/app/page.tsx`
- `apps/admin/app/page-helpers.ts`
- `apps/admin/app/page-types.ts`
- `packages/db/src/repository.ts` if contact detail payload needs enrichment

Acceptance criteria:

- Operator can open a contact from a conversation or lead.
- Contact profile shows enough context to reply without switching tabs.
- Missing contact detail warning links to the related lead/conversation.

Tests:

- API test for enriched contact detail if backend changes.
- UI test for opening/closing drawer and rendering channel identifiers.

## Milestone 5: Human Handoff Copilot

Timeline: 4-7 days

Value:

- Makes human escalation faster and higher quality.

Implementation:

1. Add a handoff summary card to handoff and lead detail views.
2. Build deterministic summary first:
   - requester message
   - reason
   - channel
   - priority
   - created date
   - known contact
   - suggested next action
3. Add reply draft controls using existing `buildLeadReplyDraft` patterns.
4. Add assignment and status controls consistently across lead and handoff
   boards.
5. Optional later: provider-backed AI summary after deterministic summary is
   reliable.

Suggested files:

- `apps/admin/app/page.tsx`
- `apps/admin/app/page-helpers.ts`
- `apps/admin/app/globals.css`

Acceptance criteria:

- Every handoff has a concise summary and recommended next step.
- Operator can assign, start, resolve, or dismiss from the same card.
- Reply draft is copyable and tone-selectable.

Tests:

- Helper tests for handoff summary generation.
- Component tests if extracted.

## Milestone 6: Channel Setup Concierge

Timeline: 5-8 days

Value:

- Reduces setup friction for phone, WhatsApp, widget, and future channels.

Implementation:

1. Convert channel cards into checklist-driven setup flows.
2. For each channel, show:
   - required fields
   - current status
   - last test result
   - next step
   - health check action
3. Add per-channel "go live" readiness:
   - website snippet copied and install check passed
   - WhatsApp callback and template state ready
   - phone setup saved and voice edge check passed
4. Keep advanced provider fields hidden until needed.

Suggested files:

- `apps/admin/app/page.tsx`
- `apps/admin/app/page-helpers.ts`
- `apps/admin/app/page-types.ts`
- `apps/api/src/server.ts` if channel health responses need normalizing

Acceptance criteria:

- New tenant can see what is missing before going live.
- Each channel has one primary next action.
- Health failures are written in plain language.

Tests:

- Helper tests for channel readiness state.
- Existing widget and API tests.

## Milestone 7: Trust And Control Center

Timeline: 5-8 days

Value:

- Helps owners trust the AI and understand data controls.

Implementation:

1. Add "Why this answer?" UI to test studio and conversation messages.
2. Show available trace fields:
   - status
   - confidence
   - intent
   - handoff recommended
   - refusal reason
   - source/citation when available
3. Add tenant data controls summary:
   - retention days
   - export tenant
   - delete tenant
   - audit/logging note
4. Add "AI safety preview" before live launch:
   - test answer
   - blocked topic test
   - unknown question refusal test

Suggested files:

- `apps/admin/app/page.tsx`
- `apps/admin/app/page-helpers.ts`
- `apps/admin/app/page-types.ts`
- `apps/api/src/server.ts` only if traces are missing fields

Acceptance criteria:

- Admin can inspect why an answer was accepted, refused, or escalated.
- Data controls are discoverable from Setup.
- No sensitive raw secrets are displayed.

Tests:

- API tests for trace payload if changed.
- UI tests for trace rendering.

## Milestone 8: Voice AI Quality Toolkit

Timeline: 1-2 weeks

Value:

- Turns voice from a technical feature into a managed quality surface.

Implementation:

1. Add a phone quality panel under Channels or Setup.
2. Show:
   - voice edge status
   - last check time
   - test call status
   - transcript storage setting
   - fallback/transfer settings
3. Add deterministic call quality score:
   - voice edge reachable
   - test call passed
   - fallback set
   - disclosure confirmed
   - handoff rules active
4. Later, add call transcript review and latency once those records are
   complete.

Suggested files:

- `apps/admin/app/page.tsx`
- `apps/admin/app/page-helpers.ts`
- `apps/admin/app/page-types.ts`
- `apps/api/src/server.ts`
- `apps/voice-edge` only when runtime metrics are added

Acceptance criteria:

- Owner can tell whether phone AI is safe to test or launch.
- Setup issues have clear next steps.
- Score uses existing state before new telemetry is introduced.

Tests:

- Helper tests for voice quality scoring.
- API tests for voice-edge status endpoint if changed.

## Milestone 9: Industry Playbooks And Templates

Timeline: 1-2 weeks

Value:

- Shortens tenant setup and makes consultancy delivery repeatable.

Implementation:

1. Define a playbook object model:
   - name
   - industry
   - starter FAQs
   - blocked topics
   - lead fields
   - widget copy
   - handoff rules
   - channel setup notes
2. Add first playbook:
   - Assad Dar AI Consultancy
3. Add admin UI to apply a playbook to a new or existing tenant.
4. Add dry-run preview before applying.
5. Store applied playbook metadata for audit.

Suggested files:

- `apps/admin/app/page.tsx`
- `apps/admin/app/page-types.ts`
- `apps/api/src/server.ts`
- `packages/db/src/schema.ts`
- `packages/db/src/repository.ts`
- new data file such as `packages/core/src/playbooks.ts` or
  `apps/api/src/playbooks.ts`

Acceptance criteria:

- Tenant admin can preview and apply a playbook.
- Applying a playbook creates starter knowledge and settings idempotently.
- Existing tenant data is not overwritten without explicit confirmation.

Tests:

- Repository tests for idempotent playbook application.
- API tests for preview/apply.
- Admin helper/component tests.

## Milestone 10: Customer Self-Service Portal

Timeline: 2-4 weeks

Value:

- Gives end customers continuity beyond the widget bubble.

Implementation:

1. Add a public route or app surface for secure conversation continuation.
2. Start with signed links for one conversation/contact.
3. Show:
   - conversation summary
   - latest status
   - missing details form
   - booking CTA
   - option to send another message
4. Later add document upload and case status.
5. Keep portal data minimal and scoped to the signed token.

Suggested files:

- `apps/admin` or a new public app route, depending on routing decision
- `apps/api/src/server.ts`
- `packages/db/src/schema.ts`
- `packages/db/src/repository.ts`
- `apps/widget/src/widget.ts` if linking from widget

Acceptance criteria:

- Customer can return to a conversation without admin credentials.
- Signed token cannot access another tenant/contact/conversation.
- Tenant admin can disable portal links if needed.

Tests:

- Security tests for signed link scope and expiry.
- API tests for portal payload.
- Browser tests for portal flow.

## Suggested Build Order

### Sprint 1: Make Today Useful

Deliver:

- Daily Owner Command Center
- ranked action cards
- improved value metrics
- helper tests

Why first:

- No new database work required.
- Immediate improvement to perceived product value.

### Sprint 2: Improve The Assistant From Real Questions

Deliver:

- Knowledge Gap Engine v1
- grouped unanswered questions
- better suggestion approval flow
- scan/approve/reject polish

Why second:

- Directly improves AI answer quality.
- Uses existing endpoints and repository methods.

### Sprint 3: Convert Conversations Into Revenue

Deliver:

- Lead Follow-Up Cockpit
- hot/due/stale queues
- better lead drawer
- handoff summary v1

Why third:

- Makes business ROI visible.
- Supports the Assad Dar consultancy use case.

### Sprint 4: Operational Maturity

Deliver:

- contact memory drawer
- handoff copilot refinements
- channel setup concierge v1

Why fourth:

- Reduces support burden and operator context switching.

### Sprint 5: Trust, Voice, And Playbooks

Deliver:

- trust/control center
- voice quality score
- Assad Dar AI Consultancy playbook

Why fifth:

- Makes the platform safer to sell and repeat.

### Sprint 6: Customer Portal

Deliver:

- signed customer continuation links
- public conversation status page
- missing-detail capture

Why sixth:

- Requires more security design and should follow core admin value.

## Data And API Changes By Priority

Avoid schema changes in Sprint 1 where possible.

Likely later additions:

- action completion events for measuring command-center usefulness
- playbook application records
- signed portal tokens
- contact merge suggestion records
- voice quality telemetry
- per-channel setup test history

Potential API additions:

```http
GET /admin/tenants/{tenantId}/daily-actions
POST /admin/tenants/{tenantId}/daily-actions/{actionId}/complete
GET /admin/tenants/{tenantId}/knowledge/gaps
GET /admin/tenants/{tenantId}/contacts/{contactId}/memory
POST /admin/tenants/{tenantId}/playbooks/preview
POST /admin/tenants/{tenantId}/playbooks/apply
GET /portal/conversations/{token}
POST /portal/conversations/{token}/details
```

Do not add these until the existing dashboard payload becomes insufficient.

## Frontend Component Extraction Plan

`apps/admin/app/page.tsx` is very large. Each milestone should extract only the
components it touches.

Recommended component files:

- `TodayCommandCenter.tsx`
- `KnowledgeGapPanel.tsx`
- `LeadFollowUpCockpit.tsx`
- `ContactMemoryDrawer.tsx`
- `HandoffCopilotCard.tsx`
- `ChannelSetupChecklist.tsx`
- `TrustControlPanel.tsx`
- `VoiceQualityPanel.tsx`
- `PlaybookPreview.tsx`

Keep helper logic in `page-helpers.ts` until it becomes too large, then split
domain helpers:

- `dashboard-helpers.ts`
- `lead-helpers.ts`
- `channel-helpers.ts`
- `trust-helpers.ts`

## Measurement Plan

Track these metrics once event capture is available:

- tenants completing at least one daily action per week
- unanswered questions per 100 conversations
- suggestion approval rate
- lead follow-up within 24 hours
- median handoff response time
- contacts with email or phone
- channel setup completion within seven days
- answer trust inspection rate
- successful phone test calls
- playbook time-to-first-answer
- portal return visits per lead/case

## Risk Register

| Risk                                | Impact | Mitigation                                                       |
| ----------------------------------- | ------ | ---------------------------------------------------------------- |
| Dashboard becomes too busy          | Medium | Rank actions, show top 3-6, hide lower priority sections         |
| AI suggestions publish bad answers  | High   | Require tenant-admin approval before live knowledge changes      |
| Platform owner sees too much by bug | High   | Preserve tenant-scoped repository methods and role checks        |
| Lead scoring feels arbitrary        | Medium | Explain score inputs and allow manual stage changes              |
| Contact memory feels invasive       | Medium | Show consent/retention context and avoid unapproved data sources |
| Channel setup overwhelms users      | Medium | One next action per channel, advanced fields hidden by default   |
| Portal leaks data                   | High   | Signed scoped tokens, expiry, tenant/contact/conversation checks |
| Page component grows further        | Medium | Extract components per milestone rather than one huge refactor   |

## Definition Of Done

For each milestone:

- feature is available in the admin UI
- role restrictions match API permissions
- empty/loading/error states are clear
- keyboard focus and mobile layout remain usable
- helper logic has focused tests
- API changes have tests and OpenAPI/API docs updates where relevant
- `pnpm lint`
- `pnpm format:check`
- `pnpm test`
- `pnpm typecheck`
- `pnpm build`

## First Implementation Ticket

Title: Add Daily Owner Command Center to Today tab

Scope:

- derive ranked daily actions from existing dashboard state
- render command center at top of Today tab
- add direct action buttons to existing workspace sections
- add helper tests for action ranking

Out of scope:

- new database tables
- new API endpoint
- AI-generated recommendations
- notification scheduling

Acceptance:

- Owner sees top actions immediately after tenant load.
- Action list updates when handoffs, unanswered questions, channels, or
  readiness state changes.
- Each action explains why it matters and where it leads.
- If there is no urgent work, the UI shows a useful calm state.
