# Platform Improvement Plan

Date: 2026-07-07

Source: multi-agent codebase review (12 dimensions, 93 findings, critical/high
findings adversarially re-verified against source, deduped and ranked).

This plan complements `docs/user-value-top-10-*` (which covers new value) — this
one covers **hardening and correctness** of what already exists.

## How to read this

Severity: 🔴 critical · 🟠 high · 🟡 medium.
Effort: **S** = hours · **M** = ~a day · **L** = multi-day.

The ranked top-20 is the priority order. The 4 phases below regroup those items
into executable waves sequenced by dependency and risk.

---

## Top 20 (ranked)

| #   | Item                                                                                          | Sev | Effort | Primary location                               |
| --- | --------------------------------------------------------------------------------------------- | --- | ------ | ---------------------------------------------- |
| 1   | Voice `/twilio/voice` fails open (unauthenticated) when `TWILIO_AUTH_TOKEN` unset             | 🔴  | S      | `apps/voice/src/index.ts:114`                  |
| 2   | Meta webhook cross-tenant injection via `?assistantId` query param                            | 🟠  | M      | `apps/api/src/server.ts:3136`                  |
| 3   | Inbound SIP accepts INVITE/BYE/CANCEL from any source (no peer/dialog validation)             | 🟠  | M      | `apps/voice-edge/internal/edge/server.go:127`  |
| 4   | Semantic (cosine) scores share the keyword confidence threshold → refusal guardrail defeated  | 🟠  | M      | `packages/core/src/engine.ts:172`              |
| 5   | WhatsApp/Messenger/IG 24h window check is a structural no-op                                  | 🟠  | M      | `apps/api/src/server.ts:4863`                  |
| 6   | Rate limiting is in-memory (per-instance) → auth brute-force protection degrades on scale-out | 🟠  | M      | `apps/api/src/server.ts:844`                   |
| 7   | Delivery failures + guardrail refusals/handoffs never exported as metrics/alerts              | 🟠  | M      | `apps/api/src/server.ts:4868`                  |
| 8   | Lead-notification failures silently swallowed on the revenue-critical path                    | 🟠  | S      | `apps/api/src/server.ts:6031`                  |
| 9   | No cap on concurrent voice sessions / no max-duration/inactivity timeout                      | 🟠  | M      | `apps/voice-edge/internal/edge/server.go:236`  |
| 10  | Voice-edge data race on `CallSession.Phase` (written under mutex, read without)               | 🟠  | S      | `apps/voice-edge/internal/edge/server.go:1081` |
| 11  | Twilio number purchase has no idempotency key / dedicated rate limit → double-spend           | 🟠  | M      | `apps/api/src/server.ts:1545`                  |
| 12  | Cross-tenant delivery-retry sweep has no supporting index (full scan)                         | 🟠  | S      | `packages/db/src/repository.ts:4261`           |
| 13  | Webhook idempotency key `(channel, provider_event_id)` is global, not tenant-scoped           | 🟡  | S      | `packages/db/src/schema.ts:504`                |
| 14  | No dedup/idempotency on inbound telephone (Twilio) webhooks                                   | 🟠  | M      | `apps/voice/src/index.ts:374`                  |
| 15  | Audit logs fully mutable/deletable by the app role — no tamper resistance                     | 🟠  | M      | `scripts/create-app-role.sql:33`               |
| 16  | Widget consent never persisted server-side — no demonstrable proof of consent                 | 🟠  | M      | `apps/widget/src/widget.ts:918`                |
| 17  | Voice greeting gives no recording/transcription notice or opt-out                             | 🟠  | S      | `apps/voice-edge/internal/config/config.go:62` |
| 18  | `apps/admin/app/page.tsx` is a single ~10,600-line client component (182 `useState`)          | 🟠  | L      | `apps/admin/app/page.tsx:368`                  |
| 19  | Debounced list fetches have no request-sequencing guard → stale overwrites fresh              | 🟡  | S      | `apps/admin/app/page.tsx:2140`                 |
| 20  | Retention cleanup disabled by default → personal data retained indefinitely                   | 🟡  | S      | `apps/workers/src/index.ts:139`                |

---

## Phased execution

### Phase 1 — Stop the bleeding

Close every path where an attacker or misconfiguration can drive the AI
unauthenticated, cross tenants, or bypass safety guardrails; light up silent
failures. Mostly S/M and independent — ship as hotfixes.

- [x] #1 Twilio fail-open → fail-closed at verification in any non-dev env (both Twilio + voice-edge signatures) — `apps/voice/src/index.ts`
- [x] #2 Meta `?assistantId` → route by the signed `providerAccountId`'s channel connection; `?assistantId` only when no signed account — `apps/api/src/server.ts`
- [x] #4 Semantic threshold → dedicated `semanticMinSimilarity` floor (default 0.4) filters semantic hits before merge — `packages/core/src/engine.ts`
- [~] #5 24h window → **reclassified to Phase 2** (see review note below): current behaviour is correct for the synchronous reply path; the real gap is the retry/proactive path + template fallback
- [x] #8 Lead-notification alerting → `reportNotificationOutcome` logs at error + `captureException` on real failures — `apps/api/src/server.ts`
- [x] #10 Voice-edge `Phase` data race → `getSessionAndPhase` reads Phase under `sessionsMu` — `apps/voice-edge/internal/edge/server.go`
- [x] #12 Delivery-retry index → partial index `message_deliveries (updated_at) where status='failed'` — migration `0015` + `schema.ts`

**Review note on #5 (correction to the finding).** The finding recommended
computing the window age from the _previous_ inbound message. That is wrong for
`processChannelInboundEvent`: it only ever runs when replying to a message the
customer _just_ sent, which by definition (re)opens the WhatsApp 24-hour window,
so `allowed: true` is correct. Using the previous inbound would incorrectly
**block** a reply to a fresh message that arrives >24h after the prior one — a
regression. The genuine gap is elsewhere: the delivery-**retry** worker re-sends
failed messages hours later without re-checking the window, and there is no
approved-template fallback for truly out-of-window sends. Both are addressed in
Phase 2 (`#14` retry path + template support), not with a `lastInboundAt` tweak.

### Phase 2 — Harden the perimeter

Network- and replay-driven abuse and double-spend; make dedup/rate-limiting
tenant- and instance-safe. Shared Redis + one migration pass.

- [~] #3 SIP hardening — **partial**: opt-in source allowlist (`VOICE_EDGE_SIP_ALLOWED_SOURCES`) done; BYE/CANCEL dialog validation deferred (needs a Go build/test loop — see note)
- [~] #9 Voice resource control — **partial**: session cap (`VOICE_EDGE_MAX_SESSIONS`) + max-call-duration timeout (`VOICE_EDGE_MAX_CALL_DURATION_MS`, default 30 min) done; RTP-inactivity timeout deferred
- [x] #14 Telephone webhook dedup via `recordChannelWebhookEvent` on `CallSid` + speech hash — `apps/voice/src/index.ts`
- [x] #13 Tenant-scoped webhook dedup index + onConflict target + lookup — migration `0016`
- [x] #11 Twilio purchase strict per-route rate limit + idempotent retry — `apps/api/src/server.ts`
- [x] #6 Shared Redis store for `@fastify/rate-limit` when `REDIS_URL` set — `apps/api/src/server.ts`

**Deferred in #3/#9 (needs a Go toolchain to build+test safely).** BYE/CANCEL
dialog validation (match Call-ID + our To-tag before teardown) and RTP-inactivity
detection are intricate SIP/RTP protocol changes with no automated call test; a
silent bug would break live calls. They were not shipped blind. Operational
mitigation meanwhile: set `VOICE_EDGE_SIP_ALLOWED_SOURCES` to easybell's IPs and
firewall the SIP port to a private interface.

Also sweep here: RLS DB-backstop default-on in prod; SSRF DNS-rebinding pin;
server-derived billed unit price; and the WhatsApp 24h window on the
delivery-retry path plus an approved-template fallback (reclassified #5).

### Phase 3 — Close compliance gaps

Bring GDPR posture in line with the product's own documented guarantees.

- [ ] #15 Audit-log lockdown — `REVOKE update,delete`, RLS to SELECT+INSERT, append-only trigger
- [ ] #16 Persist consent event server-side (contact/conversation id, timestamp, text version, source)
- [ ] #17 Non-overridable recording/AI-handling voice notice + opt-out; enforce non-empty in prod
- [ ] #20 Default retention cleanup enabled in prod (or fail-closed/warn-loudly)

### Phase 4 — Observability + frontend architecture debt

Make failures visible fleet-wide; begin decomposing the biggest maintainability
liability incrementally.

- [ ] #7 Labelled counters: `message_delivery_total{channel,provider,status}`, `answer_outcome_total{status}`
- [ ] #19 Request-sequencing guard on the three admin list fetchers
- [~] #18 Monolith split — **in progress**: the 2026-07-09 OneBrain release train intentionally grew `page.tsx`, `server.ts`, and `repository.ts` for portal, playbook, consent, bulk knowledge, and projection work. The line budgets were raised once with notes in `scripts/check-budgets.mjs`; next growth should split admin panels, API route groups, and repository methods into focused modules.

**Budget-gate status.** After the OneBrain release train: `page.tsx` 10,798/11,000, `server.ts` 8,474/8,600, and `repository.ts` 6,379/6,500. The gate is green again, but the margins are intentionally thin to keep decomposition pressure visible.

---

## Notable findings below the top-20

- Postgres RLS backstop is inert by default (warn-only unless `REQUIRE_DB_RLS=true`); `tenants` table has no FORCE RLS. → Phase 2.
- Off-topic/unknown-intent messages bypass intent gating; blocked-topic substring match is evadable (no German coverage). → fix alongside #4.
- SSRF guard resolves DNS then fetches by hostname (TOCTOU / DNS-rebinding) on import/install-check routes. → Phase 2.
- `tenant_admin` can set the billed unit price on accepted-call usage (client-trusted `unitAmountCents`). → Phase 2 billing sweep.
- Analytics/platform-overview issues 13+ unbounded full-scan aggregate queries per dashboard load. → data-layer follow-up (caching / covering indexes).
- Contact-matching fallback loads up to 300 contacts and scans in Node (fragile beyond #300). → data-layer follow-up.
- Missing CI coverage for Stripe/Twilio/voice-edge signature verification, retention/erasure/RLS SQL, adversarial guardrail cases; `db:check` never run in CI. → add tests as each fix lands.

---

## Method

Reviewed in parallel: multi-tenant security & isolation, answer engine &
guardrails, API robustness, data layer & DB performance, admin frontend, widget
security, channel adapters & webhooks, voice/voice-edge, testing & CI,
observability & ops, architecture debt, GDPR/compliance. Every critical/high
finding was independently re-verified against the source before ranking.
