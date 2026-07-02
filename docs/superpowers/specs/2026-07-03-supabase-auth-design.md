# Supabase Auth Design

Date: 2026-07-03

## Summary

Move Assaddar Admin login from the custom password/session implementation to Supabase Auth, while keeping tenant authorization in the existing application tables.

Supabase Auth becomes responsible for identity:

- Email/password login.
- Password reset and email verification.
- Access and refresh token issuance.
- Auth user lifecycle in `auth.users`.

The Assaddar platform remains responsible for business authorization:

- Tenants.
- Roles.
- Memberships.
- Tenant-scoped access checks.
- Admin API permissions.

This keeps the system in one Supabase Postgres project while avoiding brittle tenant role data inside JWT custom claims.

## Current State

The API currently owns auth end to end:

- `POST /auth/login` verifies `users.password_hash`.
- `user_sessions` stores hashed session tokens.
- The API sets an HttpOnly `assaddar_session` cookie.
- Admin routes load a user session from `user_sessions`, then load `memberships`.
- The bootstrap `ADMIN_API_TOKEN` can still act as a platform owner fallback.

The database already has the product authorization model:

- `users`
- `roles`
- `memberships`
- `tenants`
- `tenant_invites`

The project does not currently use Supabase Auth, Supabase client SDKs, or Supabase Auth cookies.

## Goals

- Use Supabase Auth for Admin dashboard login.
- Keep existing tenant roles and membership checks.
- Keep API routes as the authority for tenant data and business mutations.
- Avoid duplicating passwords in `public.users`.
- Make the change compatible with existing tenants and memberships.
- Retain `ADMIN_API_TOKEN` as an emergency/bootstrap fallback.
- Support invite/admin-created users through Supabase Auth Admin APIs.
- Keep public widget chat unauthenticated and unchanged.

## Non-Goals

- No migration of tenant roles into JWT custom claims.
- No direct browser access from Admin to tenant product tables.
- No immediate replacement of all database RLS policies with Supabase Auth policies.
- No social login in the first migration.
- No self-service public signup unless explicitly enabled later.
- No dependency on Supabase Auth for website visitors or channel contacts.

## Chosen Approach

Use Supabase Auth for identity and the existing `memberships` table for authorization.

```text
Supabase Postgres
  auth.users
    source of login identity

  public.users
    app profile and status
    links to auth.users through auth_user_id

  public.memberships
    tenant_id + user_id + role_id

  public.roles
    platform_owner, tenant_owner, tenant_admin, operator, viewer
```

The API verifies `Authorization: Bearer <supabase_access_token>`, resolves the Supabase `sub` claim to `public.users.auth_user_id`, loads memberships, and reuses the current role checks.

## Data Model

Add a nullable unique mapping column:

```sql
alter table users add column if not exists auth_user_id uuid;
create unique index if not exists users_auth_user_id_idx
  on users(auth_user_id)
  where auth_user_id is not null;
```

`public.users.id` stays as the internal app user ID. This avoids rewriting existing memberships or any future tables that reference `users.id`.

For new Supabase-backed users:

- `auth.users.id` goes into `public.users.auth_user_id`.
- `public.users.email` stores the normalized email.
- `public.users.name` stores display name from Supabase metadata or Admin input.
- `public.users.status` still controls whether the app allows access.
- `password_hash` becomes legacy/deprecated and is not required for Supabase-backed users.
- `user_sessions` becomes legacy/deprecated after the frontend stops using cookie sessions.

## API Authentication Flow

Admin requests will send:

```http
Authorization: Bearer <supabase_access_token>
```

The API authentication order:

1. If a valid `x-admin-token` is present, keep existing bootstrap admin behavior.
2. Else, if an `Authorization: Bearer` token is present, verify it as a Supabase Auth JWT.
3. Resolve the verified `sub` claim to an active `public.users` row by `auth_user_id`.
4. Load active memberships for that app user.
5. Continue through the existing `requireAuth`, `requirePlatformOwner`, and `requireTenantAccess` checks.

The legacy `assaddar_session` cookie path can remain temporarily during rollout, but the target state is Bearer-token auth from Supabase.

## JWT Verification

Use Supabase Auth JWT verification on the API server. Preferred implementation:

- Configure `SUPABASE_URL`.
- Configure a server-only Supabase key as needed for verification/admin calls.
- Verify access tokens against Supabase Auth/JWKS where supported.
- Cache JWKS according to library behavior to avoid a network call on every request.
- Reject expired, malformed, wrong-issuer, or wrong-audience tokens.

The API must not trust unverified JWT payloads.

## Admin Frontend Flow

Add Supabase client configuration to `apps/admin`:

```text
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Login flow:

1. User enters email and password in the existing Admin login screen.
2. Admin calls Supabase Auth email/password login.
3. Supabase stores/refreshes its browser session.
4. Admin reads the current access token.
5. `apiFetch` attaches `Authorization: Bearer <access_token>` to Admin API calls.
6. Admin calls `/auth/session` or `/admin/session` to get app permissions and tenant memberships.

Logout flow:

1. Admin calls Supabase Auth sign-out.
2. Admin clears local app state.
3. No custom API logout is required in the target state.

Password reset:

1. Admin frontend calls Supabase Auth reset-password flow.
2. Supabase handles email delivery and recovery link.
3. Admin adds a recovery/update-password screen only if needed by the selected Supabase email template redirect.

## User Provisioning And Invites

Tenant user creation should create both identities:

1. API validates that the actor can grant the requested tenant role.
2. API calls Supabase Auth Admin to create or invite the user.
3. API upserts `public.users` with `auth_user_id`.
4. API upserts `memberships` with the requested role.

Preferred first version:

- Use Supabase Auth Admin `createUser` for internal/bootstrap creation when an initial password is provided.
- Use Supabase Auth Admin `inviteUserByEmail` for normal tenant invites.
- Keep the existing `/admin/tenants/:tenantId/users` and `/admin/tenants/:tenantId/invites` API surface, but change internals to Supabase Auth.

`tenant_invites` can remain as an app audit/history table, but Supabase Auth invite links become the actual login invitation mechanism.

## Migration Plan

Phase 1: Database readiness

- Run missing project migrations in Supabase Postgres.
- Add `users.auth_user_id`.
- Ensure roles exist.

Phase 2: Supabase project configuration

- Enable email/password auth.
- Decide whether signup is disabled or restricted.
- Configure site URL and redirect URLs for the Admin dashboard.
- Configure email templates later if the default templates are not acceptable.

Phase 3: API dual auth

- Add Supabase JWT authentication while keeping legacy cookie auth.
- Add repository methods to resolve users by `auth_user_id`.
- Preserve `ADMIN_API_TOKEN`.
- Add tests for Bearer auth, inactive users, membership loading, and tenant access.

Phase 4: Admin frontend switch

- Install Supabase JS client.
- Replace custom password login call with Supabase login.
- Attach Bearer tokens in API requests.
- Replace logout behavior.
- Add minimal reset-password UI if required.

Phase 5: Provisioning switch

- Update create-user/invite endpoints to create Supabase Auth users.
- Backfill or manually link existing users.
- Stop writing `password_hash` for new users.

Phase 6: Cleanup

- Remove or hide legacy login/token UI.
- Keep old columns/tables for one release if rollback is useful.
- Later migration can drop `password_hash` and `user_sessions` after production confidence.

## Environment Variables

API:

```text
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_JWT_AUDIENCE=authenticated
```

Admin:

```text
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_API_BASE_URL=...
```

`SUPABASE_SERVICE_ROLE_KEY` must only exist on trusted server runtimes. It must never be exposed to the Admin frontend, widget, or browser.

`SUPABASE_SERVICE_ROLE_KEY` is for server-side user provisioning and invite flows, not for browser authentication.

## Error Handling

- Invalid or expired Supabase token returns `401 Unauthorized`.
- Valid Supabase user without a linked active `public.users` row returns `403 Forbidden`.
- Active user without required tenant membership returns `403 Forbidden`.
- Disabled `public.users.status` returns `401` or `403` consistently with existing behavior.
- Supabase Admin provisioning failures should not create partial memberships without an auth identity.
- Existing generic login errors should remain generic in the UI.

## Testing

API tests:

- Bearer token resolves to a user session payload.
- Missing token is rejected on Admin routes.
- Invalid token is rejected.
- Active Supabase user with membership can access tenant routes.
- Active Supabase user without membership cannot access tenant routes.
- Platform owner membership can list all tenants.
- Bootstrap admin token still works.
- Tenant admin cannot grant above their own role.

Admin tests:

- Login screen calls Supabase login and then loads app session.
- API requests attach Bearer token.
- Logout clears Supabase session and app state.
- Permission rendering still follows membership roles.

Migration/manual tests:

- Create `assad.dar@gmail.com` in Supabase Auth.
- Link or create matching `public.users` row.
- Assign platform owner membership.
- Log in through Admin dashboard.
- List tenants.
- Open a tenant dashboard.
- Create a tenant user invite.

## Rollback

During dual-auth rollout, rollback is straightforward:

- Revert Admin frontend to custom `/auth/login`.
- Keep API legacy cookie auth enabled.
- Leave `auth_user_id` unused.
- Keep Supabase Auth users; they do not affect existing product data.

After cleanup drops legacy sessions/passwords, rollback would require restoring those columns/tables and password hashes, so cleanup should happen only after production confidence.

## Open Implementation Notes

- Prefer an API-side JWT verification helper with a small interface so tests can inject verified claims without hitting Supabase.
- Keep app authorization claims out of Supabase JWTs for now.
- Keep direct Supabase table access out of the Admin frontend; the API remains the product boundary.
- Update `docs/supabase.md`, `docs/api.md`, `docs/security-gdpr.md`, and deployment env docs when implementation lands.

## References

- Supabase Auth JWT and claims documentation: https://supabase.com/docs/guides/auth/jwts
- Supabase SSR client documentation: https://supabase.com/docs/guides/auth/server-side/creating-a-client
- Supabase Auth Admin create user documentation: https://supabase.com/docs/reference/javascript/auth-admin-createuser
- Supabase Auth Admin invite user documentation: https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail
