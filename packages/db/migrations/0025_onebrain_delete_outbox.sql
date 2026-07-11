set search_path = public, extensions;

-- A durable to-do list of remote OneBrain records to erase after a tenant is
-- deleted. onebrain_sync_records holds the source_ref / external_record_id needed
-- to erase the remote copy, but it CASCADE-deletes with the tenant — so those
-- pointers vanish before anything can act on them. deleteTenantData now writes a
-- row here, in the same transaction, BEFORE deleting the tenant.
--
-- This table intentionally has NO tenant foreign key: the row must OUTLIVE the
-- tenant it describes. It carries no message content — only the reference needed
-- to tell OneBrain what to erase. A worker drains it and marks each row done only
-- once OneBrain confirms the deletion.

create table if not exists onebrain_delete_outbox (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null,
  provider           text not null default 'onebrain',
  source_ref         text not null,
  external_record_id text,
  status             text not null default 'pending',
  attempts           integer not null default 0,
  last_error         text,
  processed_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists onebrain_delete_outbox_pending_idx
  on onebrain_delete_outbox (created_at)
  where status = 'pending';

create index if not exists onebrain_delete_outbox_tenant_idx
  on onebrain_delete_outbox (tenant_id);
