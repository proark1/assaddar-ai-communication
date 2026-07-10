set search_path = public, extensions;

-- A provider account id (a WhatsApp phone-number id, a Meta page id) identifies
-- one business at the provider, so it must map to exactly one tenant here.
-- Without this, two tenants could both claim the same account and a customer's
-- inbound message would route to whichever row matched first — a cross-tenant
-- leak. Partial so multiple not-yet-configured connections (null account id)
-- can coexist.
--
-- If this index fails to create, two tenants already share a provider account:
-- that collision is exactly the bug this prevents and must be resolved (one side
-- disconnected) before the constraint can be enforced.
create unique index if not exists channel_connections_account_owner_idx
  on channel_connections (channel, external_account_id)
  where external_account_id is not null;
