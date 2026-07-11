set search_path = public, extensions;

-- channel_webhook_events and stripe_webhook_events store the RAW inbound provider
-- payloads: WhatsApp/Messenger/Instagram message bodies, phone numbers and names,
-- and Stripe customer data. Their tenant FK was ON DELETE SET NULL, so deleting a
-- tenant DETACHED these rows (tenant_id -> null) instead of erasing them. That left
-- personal data behind after account closure / GDPR erasure, and — because both
-- retention and export filter by tenant_id — the detached rows became unreachable
-- by every later cleanup.
--
-- Re-point both FKs to ON DELETE CASCADE so tenant deletion removes the raw
-- payloads. tenant_id stays nullable (an event may arrive before it is associated
-- with a tenant); CASCADE only fires for rows that reference a tenant being
-- deleted, so legitimately-unassociated (null) rows are untouched. Stripe remains
-- the authoritative financial record of processing.
--
-- No blanket sweep of existing tenant_id-null rows is done here: null is an
-- overloaded state (deletion-orphan OR not-yet-associated event), so those rows
-- cannot be safely bulk-deleted in an automatic migration. A targeted cleanup of
-- confirmed deletion-orphans is left as a reviewed operational task.

do $$
declare
  fk_name text;
begin
  select conname into fk_name
  from pg_constraint
  where conrelid = 'channel_webhook_events'::regclass
    and contype = 'f'
    and confrelid = 'tenants'::regclass;
  if fk_name is not null then
    execute format('alter table channel_webhook_events drop constraint %I', fk_name);
  end if;
end $$;

alter table channel_webhook_events
  add constraint channel_webhook_events_tenant_id_tenants_id_fk
  foreign key (tenant_id) references tenants(id) on delete cascade;

do $$
declare
  fk_name text;
begin
  select conname into fk_name
  from pg_constraint
  where conrelid = 'stripe_webhook_events'::regclass
    and contype = 'f'
    and confrelid = 'tenants'::regclass;
  if fk_name is not null then
    execute format('alter table stripe_webhook_events drop constraint %I', fk_name);
  end if;
end $$;

alter table stripe_webhook_events
  add constraint stripe_webhook_events_tenant_id_tenants_id_fk
  foreign key (tenant_id) references tenants(id) on delete cascade;
