set search_path = public, extensions;

create table if not exists onebrain_sync_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider text not null default 'onebrain',
  source_type text not null,
  source_id text not null,
  source_ref text not null,
  content_hash text not null,
  status text not null default 'pending',
  external_record_id text,
  last_error text,
  synced_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists onebrain_sync_records_source_idx
  on onebrain_sync_records(tenant_id, provider, source_type, source_id);

create unique index if not exists onebrain_sync_records_source_ref_idx
  on onebrain_sync_records(tenant_id, provider, source_ref);

create index if not exists onebrain_sync_records_tenant_status_idx
  on onebrain_sync_records(tenant_id, status, updated_at desc);

alter table onebrain_sync_records enable row level security;

drop policy if exists onebrain_sync_records_tenant_isolation
  on onebrain_sync_records;

create policy onebrain_sync_records_tenant_isolation
  on onebrain_sync_records
  using (tenant_id::text = current_setting('app.current_tenant_id', true))
  with check (tenant_id::text = current_setting('app.current_tenant_id', true));
