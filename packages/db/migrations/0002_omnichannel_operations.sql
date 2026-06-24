create extension if not exists pgcrypto;
set search_path = public, extensions;

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  display_name text,
  email text,
  phone text,
  company text,
  status text not null default 'active',
  confidence integer not null default 50,
  identifiers jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists contacts_tenant_idx on contacts(tenant_id);
create index if not exists contacts_tenant_email_idx on contacts(tenant_id, email);
create index if not exists contacts_tenant_phone_idx on contacts(tenant_id, phone);

create table if not exists conversation_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, conversation_id)
);
create index if not exists conversation_contacts_tenant_contact_idx on conversation_contacts(tenant_id, contact_id);

create table if not exists message_deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  message_id uuid references messages(id) on delete set null,
  conversation_id uuid references conversations(id) on delete set null,
  channel text not null,
  provider text not null,
  provider_message_id text,
  status text not null default 'queued',
  detail text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists message_deliveries_tenant_created_idx on message_deliveries(tenant_id, created_at);
create index if not exists message_deliveries_provider_message_idx on message_deliveries(provider_message_id);

create table if not exists whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  language text not null default 'de',
  category text not null default 'utility',
  status text not null default 'draft',
  body text not null,
  variables text[] not null default array[]::text[],
  provider_template_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name, language)
);
create index if not exists whatsapp_templates_tenant_status_idx on whatsapp_templates(tenant_id, status);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'contacts',
    'conversation_contacts',
    'message_deliveries',
    'whatsapp_templates'
  ]
  loop
    execute format('alter table %I enable row level security', table_name);
    execute format('drop policy if exists %I on %I', table_name || '_tenant_isolation', table_name);
    execute format(
      'create policy %I on %I using (tenant_id::text = current_setting(''app.current_tenant_id'', true)) with check (tenant_id::text = current_setting(''app.current_tenant_id'', true))',
      table_name || '_tenant_isolation',
      table_name
    );
  end loop;
end $$;
