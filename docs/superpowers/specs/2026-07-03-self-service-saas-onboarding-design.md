# Self-Service SaaS Onboarding Design

Date: 2026-07-03

## Summary

Build the first complete paid self-service onboarding path for Assaddar:
customers can sign up, confirm email, create a project, choose an available
telephone number, pay through Stripe, and start using telephone AI once billing
and setup are ready.

The V1 implementation uses Stripe for commercial activation and an
Assaddar-managed telephone number pool for easybell/SIP numbers. This matches
the current product direction while avoiding a dependency on a provider
number-ordering API that is not yet represented in the codebase.

## Current State

The platform already has strong building blocks:

- Admins can create tenants through `POST /admin/tenants`.
- Project users can log in through Supabase Auth or legacy invite/session flows.
- Tenants, memberships, channel connections, usage events, and audit logs are
  modeled in Postgres.
- The Admin dashboard has a tenant workspace and telephone setup UI.
- Telephone setup supports new provider number tracking, forwarding, SIP/BYOC,
  runtime settings, checklist state, and voice-edge health checks.
- Twilio search/purchase routes exist for legacy deployments.
- The easybell/SIP voice edge can route calls to `/voice/turn` by assistant ID.
- Usage events are logged for answered/refused/handoff assistant outcomes.

The missing pieces are the paid SaaS loop:

- Public self-service signup does not create a tenant.
- Stripe customers, checkout sessions, subscriptions, webhooks, and customer
  portal are not implemented.
- Billing is not enforced before activating a tenant or phone number.
- Number inventory and reservation are not modeled.
- Per-accepted-call usage is not converted into billable usage.
- Admins cannot manage SaaS customer billing state from one place.

## Goals

- Let a new customer complete signup, project creation, number selection, and
  payment without platform-admin intervention.
- Keep platform admins able to create and manage customers manually.
- Charge a recurring number fee, initially 300 cents per month per active
  number.
- Track accepted inbound calls as billable usage, initially 10 cents per
  accepted call.
- Activate telephone AI only after Stripe confirms payment or subscription
  state.
- Keep easybell/SIP as the main production telephone path.
- Give admins clear visibility into customers, projects, phone numbers, billing
  state, reservations, and usage.
- Keep all tenant data access behind existing tenant authorization checks.

## Non-Goals

- Do not build a full CRM or generic billing platform.
- Do not depend on a new easybell/sipgate/peoplefone number-ordering API for V1.
- Do not remove the existing Twilio routes; they remain legacy/support tooling.
- Do not support multiple paid plans beyond the V1 phone AI package.
- Do not support tax invoice customization beyond Stripe defaults in V1.
- Do not block existing admin-created tenants from continuing to work.

## Chosen Approach

Use a managed number pool plus Stripe activation.

Assaddar keeps a pool of provider-backed telephone numbers in the database. A
customer chooses one available number during onboarding. The API reserves that
number for a short period, creates or reuses a Stripe customer, creates a Stripe
Checkout Session, and keeps the tenant in `setup_pending` or `billing_pending`.
After Stripe confirms the checkout/subscription through a signed webhook, the
tenant becomes active and the reserved number becomes assigned.

Telephone routing still uses the current easybell/SIP architecture:

```text
Caller
  -> easybell/SIP number
  -> voice-edge
  -> /voice/turn?assistantId=asst_...
  -> tenant answer engine
  -> usage event
```

This gives customers a direct purchase experience while keeping telecom
operations realistic. Full provider-side automation can be added later behind
the same number inventory abstraction.

## User Flows

### Customer Signup

1. Customer opens the Admin dashboard unauthenticated.
2. Customer chooses "Create account".
3. Admin frontend calls Supabase Auth sign-up.
4. Supabase sends the confirmation email.
5. After confirmation/login, the customer enters business/project details.
6. API creates:
   - `tenants` row with `status = setup_pending`.
   - `users` app profile linked to Supabase `auth.users`.
   - `memberships` row with `tenant_owner`.
   - default website/telephone channel setup records where useful.

### Number Selection

1. Customer enters country/locality preferences.
2. API returns available numbers from the managed number pool.
3. Customer selects a number.
4. API creates a time-limited reservation for that tenant/user.
5. Reserved numbers are hidden from other customers until they expire or are
   released.

### Payment Activation

1. Customer clicks checkout.
2. API creates a Stripe Checkout Session.
3. Checkout includes:
   - recurring number subscription item, 300 cents/month per number.
   - metadata linking Stripe session/customer/subscription to tenant and number.
4. Customer completes payment on Stripe.
5. Stripe webhook marks subscription active, assigns the number, and updates the
   telephone channel connection.
6. Tenant becomes usable once all required billing and setup checks pass.

### Usage Billing

1. Inbound telephone turns already log `usage_events`.
2. A call is billable when the platform has accepted the inbound call into the
   active voice path.
3. V1 records a billable call usage row once per accepted provider call ID, not
   once per assistant turn.
4. The billing worker or webhook-safe service reports usage to Stripe Meter
   Events for the configured accepted-call meter.
5. Duplicate events are idempotent by provider call ID and tenant ID.

### Admin Override

Platform owners can:

- Create tenants manually.
- Assign a number manually.
- Mark a number reserved, assigned, suspended, or released.
- See Stripe customer/subscription state.
- Open Stripe customer portal/admin links when configured.
- Retry failed activation.
- Suspend service for failed payment.

Tenant owners can:

- See their project status.
- Pick or change an available number before activation.
- Open checkout or the Stripe customer portal.
- See current number, billing status, and telephone launch checklist.

## Data Model

Add dedicated billing and number tables instead of overloading
`channel_connections.settings`.

### `billing_accounts`

- `id`
- `tenant_id`
- `stripe_customer_id`
- `status`: `incomplete`, `active`, `past_due`, `canceled`, `suspended`
- `default_currency`: `eur`
- timestamps

### `billing_subscriptions`

- `id`
- `tenant_id`
- `billing_account_id`
- `stripe_subscription_id`
- `stripe_price_id`
- `status`
- `current_period_start`
- `current_period_end`
- timestamps

### `telephone_number_inventory`

- `id`
- `provider`: `easybell`, `sipgate`, `peoplefone`, `custom_sip`, `twilio`
- `phone_number`
- `country`
- `locality`
- `number_type`
- `sip_target`
- `assistant_id`
- `status`: `available`, `reserved`, `assigned`, `suspended`, `retired`
- `assigned_tenant_id`
- provider metadata JSON
- timestamps

### `telephone_number_reservations`

- `id`
- `tenant_id`
- `user_id`
- `number_id`
- `status`: `active`, `completed`, `expired`, `released`
- `expires_at`
- timestamps

### `billable_usage_events`

- `id`
- `tenant_id`
- `source_usage_event_id`
- `provider_call_id`
- `channel`
- `event_type`: `accepted_call`
- `quantity`
- `unit_amount_cents`
- `stripe_meter_event_id`
- `status`: `pending`, `reported`, `failed`, `ignored`
- metadata JSON
- timestamps

All new tenant-owned tables include `tenant_id`, repository methods require
tenant scope, and migrations enable RLS policies like the existing tenant data
tables.

## API Design

### Public/Auth Routes

- Supabase Auth browser sign-up
  - The Admin frontend calls Supabase `signUp` directly when public Supabase
    auth config is present.
  - The API does not create a tenant until the authenticated user calls the
    onboarding project route after email confirmation/login.

- `POST /onboarding/projects`
  - Requires Supabase/user auth.
  - Creates a tenant for the authenticated user as `tenant_owner`.

- `GET /onboarding/phone-numbers`
  - Requires authenticated tenant owner/admin.
  - Lists available inventory numbers with price display.

- `POST /onboarding/phone-number-reservations`
  - Requires authenticated tenant owner/admin.
  - Reserves a number for the selected tenant.

- `POST /billing/checkout-sessions`
  - Requires authenticated tenant owner.
  - Creates Stripe Checkout for the active reservation.

- `POST /billing/customer-portal`
  - Requires authenticated tenant owner.
  - Creates a Stripe Customer Portal session.

### Webhooks

- `POST /webhooks/stripe`
  - Verifies Stripe signature.
  - Stores webhook event IDs for idempotency.
  - Handles checkout completion, subscription updates, invoice payment failures,
    and subscription cancellation.

### Admin Routes

- `GET /admin/billing/overview`
  - Platform owner only; aggregate billing and activation health.

- `GET /admin/telephone/numbers`
  - Platform owner only; manage inventory.

- `POST /admin/telephone/numbers`
  - Platform owner only; add pool number.

- `PATCH /admin/telephone/numbers/:numberId`
  - Platform owner only; update pool number status/metadata.

- Existing tenant routes expose billing and selected number state in the
  dashboard bootstrap payload.

## Stripe Design

Environment variables:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_NUMBER_PRICE_ID`
- `STRIPE_ACCEPTED_CALL_METER_EVENT_NAME`
- `STRIPE_ACCEPTED_CALL_PRICE_ID`
- `STRIPE_CUSTOMER_PORTAL_RETURN_URL`
- `SELF_SERVICE_ONBOARDING_ENABLED=true`

Checkout metadata:

- `tenant_id`
- `number_id`
- `reservation_id`
- `billing_mode=phone_ai_v1`

Webhook idempotency:

- Store each Stripe event ID before mutating business state.
- Treat duplicate delivery as success/no-op.
- Require metadata to match an existing tenant and active reservation.

Usage metering:

- Configure a Stripe billing meter for accepted calls and attach it to a
  metered recurring price.
- Submit one Stripe Meter Event per billable accepted call.
- Use a deterministic meter event identifier based on tenant ID and provider
  call ID.
- Keep local `billable_usage_events` as the source of truth for retries,
  reconciliation, and support.
- Send integer `value = 1` for each accepted call.

Failed payment behavior:

- `past_due` keeps the workspace visible but blocks new number activation.
- `canceled` or configured grace-period expiry suspends the telephone channel.
- Existing conversations and invoices remain visible to tenant owners.

## Telephone Activation

When Stripe confirms activation:

1. Mark reservation `completed`.
2. Mark number `assigned`.
3. Store `assigned_tenant_id`.
4. Upsert tenant telephone `channel_connections` with:
   - `channel = telephone`
   - `provider = number.provider`
   - `externalAccountId = number.phone_number`
   - `status = connected` when SIP routing is already ready, otherwise
     `pending`.
   - settings containing mode, phone number, SIP target, provider metadata,
     billing status, and setup checklist.
5. Set tenant commercial status to active when billing is active. Keep the
   telephone channel `pending` until routing and the test-call checklist pass.

## UI/UX Design

### Unauthenticated Screen

Add a signup path beside login. Keep the current professional shell, but make
the first action clear:

- Log in
- Create account

Signup asks only for the minimum:

- Name
- Email
- Password

Business/project data comes after email confirmation/login.

### Onboarding Wizard

Show a focused setup wizard before the full dashboard when the user owns a
tenant with incomplete onboarding:

1. Project details
2. Pick phone number
3. Checkout
4. Launch checklist

Each step has a clear state: `not_started`, `in_progress`, `blocked`, `done`.
Avoid burying payment state inside the generic Settings tab.

### Admin Enhancements

Platform owners get compact operational panels:

- Customer/project list with billing status.
- Number inventory table.
- Reservation queue.
- Failed Stripe webhook/activation retries.
- Usage billing health.

Tenant owners see only their own billing and number state.

## Error Handling

- Expired reservations release numbers automatically before listing inventory.
- Checkout creation fails if no active reservation exists.
- Stripe webhook events without valid signature are rejected.
- Stripe metadata mismatches are logged and ignored without activating tenants.
- Number assignment is transactional: reservation, inventory, channel
  connection, and billing status update together.
- Voice calls for suspended tenants return a configured unavailable response and
  do not create billable usage.
- Billable usage creation is idempotent by `tenant_id + provider_call_id`.

## Testing

Add focused tests for:

- Customer-owned project creation after auth.
- Role checks: tenant owner cannot see other tenants or global inventory.
- Number listing excludes reserved/assigned/expired states correctly.
- Reservation expiration releases numbers.
- Checkout creation requires active reservation and tenant-owner access.
- Stripe webhook signature and event idempotency.
- Checkout completion activates tenant, subscription, number, and telephone
  channel in one transaction.
- Failed/canceled subscription suspends billing-dependent telephone activation.
- Accepted call usage records once per provider call ID.
- Admin inventory CRUD requires platform owner.
- Admin UI renders onboarding wizard and billing states.

## Rollout Plan

1. Add migrations and repository methods for billing, inventory, reservations,
   webhook events, and billable usage.
2. Add Stripe provider wrapper and environment validation.
3. Add onboarding and billing API routes.
4. Add Stripe webhook processing with idempotency.
5. Add usage billing conversion for accepted calls.
6. Add Admin dashboard onboarding wizard and platform billing/number panels.
7. Seed local/dev number inventory.
8. Add tests and update docs/env examples.

## Implementation Decisions

- Use Stripe Meter Events for accepted-call usage. Stripe meters aggregate meter
  events over a billing period, and meter events are the supported usage event
  submission path for usage-based billing.
- Use browser-side Supabase Auth signup when `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are configured. The API creates the
  tenant only after the authenticated user calls the onboarding project route.
- Treat payment as commercial activation. A paid tenant can enter the dashboard
  immediately, but telephone launch remains `pending` until the number routing
  and test-call checklist are complete.

## Official References Checked

- Stripe recurring pricing and usage-based billing:
  https://docs.stripe.com/products-prices/pricing-models
- Stripe billing meters:
  https://docs.stripe.com/api/billing/meter
- Stripe Meter Events:
  https://docs.stripe.com/api/v2/billing/meter-events/create

## Success Criteria

- A new customer can create an account, create a project, reserve a number,
  complete Stripe Checkout, and see the tenant become active.
- The selected number is assigned to that tenant and visible in Telephone AI
  setup.
- A platform owner can inspect and repair billing/number state.
- Accepted calls become billable usage exactly once.
- Existing admin-created tenants and current telephone setup flows keep working.
