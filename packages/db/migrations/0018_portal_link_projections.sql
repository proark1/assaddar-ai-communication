set search_path = public, extensions;

create table if not exists portal_link_projections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  onebrain_record_id text not null,
  token_hash text not null,
  conversation_id uuid references conversations(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  scope text not null default 'conversation',
  status text not null default 'active',
  expires_at timestamptz not null,
  disabled_at timestamptz,
  last_used_at timestamptz,
  created_by_user_id uuid references users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists portal_link_projections_token_hash_idx
  on portal_link_projections(token_hash);

create index if not exists portal_link_projections_tenant_idx
  on portal_link_projections(tenant_id);

create index if not exists portal_link_projections_conversation_idx
  on portal_link_projections(tenant_id, conversation_id);

alter table portal_link_projections enable row level security;

drop policy if exists portal_link_projections_tenant_isolation
  on portal_link_projections;

create policy portal_link_projections_tenant_isolation
  on portal_link_projections
  using (tenant_id::text = current_setting('app.current_tenant_id', true))
  with check (tenant_id::text = current_setting('app.current_tenant_id', true));

