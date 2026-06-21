create extension if not exists pgcrypto;
create schema if not exists extensions;
create extension if not exists vector with schema extensions;
set search_path = public, extensions;

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  name text not null,
  slug text not null unique,
  status text not null default 'active',
  default_locale text not null default 'en',
  tone text not null default 'friendly',
  confidence_threshold numeric(4, 3) not null default 0.180,
  max_message_length integer not null default 1200,
  retention_days integer not null default 365,
  theme jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role_id uuid not null references roles(id),
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);
create index if not exists memberships_tenant_idx on memberships(tenant_id);

create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  monthly_message_limit integer not null,
  monthly_price_cents integer not null,
  features jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  plan_id uuid not null references plans(id),
  status text not null default 'trialing',
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subscriptions_tenant_idx on subscriptions(tenant_id);

create table if not exists usage_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  channel text not null,
  event_type text not null,
  credits integer not null default 0,
  estimated_cost_cents integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists usage_events_tenant_created_idx on usage_events(tenant_id, created_at);

create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  name text not null,
  key_hash text not null,
  scopes text[] not null default array[]::text[],
  last_used_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists api_keys_tenant_idx on api_keys(tenant_id);

create table if not exists channel_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  channel text not null,
  provider text not null,
  external_account_id text,
  status text not null default 'pending',
  encrypted_access_token text,
  encrypted_refresh_token text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, channel, provider)
);
create index if not exists channel_connections_tenant_idx on channel_connections(tenant_id);

create table if not exists channel_webhook_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete set null,
  channel text not null,
  provider_event_id text,
  event_type text not null,
  payload jsonb not null,
  status text not null default 'received',
  error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists channel_webhook_events_tenant_idx on channel_webhook_events(tenant_id);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete set null,
  actor_type text not null,
  actor_id text,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_tenant_created_idx on audit_logs(tenant_id, created_at);

create table if not exists knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  type text not null,
  name text not null,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists knowledge_sources_tenant_idx on knowledge_sources(tenant_id);

create table if not exists knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  source_id uuid not null references knowledge_sources(id) on delete cascade,
  title text not null,
  content text not null,
  status text not null default 'approved',
  checksum text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists knowledge_documents_tenant_idx on knowledge_documents(tenant_id);
create index if not exists knowledge_documents_source_idx on knowledge_documents(source_id);

create table if not exists knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  document_id uuid not null references knowledge_documents(id) on delete cascade,
  source_id uuid not null references knowledge_sources(id) on delete cascade,
  title text,
  content text not null,
  embedding vector(1536),
  tags text[] not null default array[]::text[],
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'approved',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists knowledge_chunks_tenant_idx on knowledge_chunks(tenant_id);
create index if not exists knowledge_chunks_document_idx on knowledge_chunks(document_id);

create table if not exists allowed_intents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  description text,
  keywords text[] not null default array[]::text[],
  examples text[] not null default array[]::text[],
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table if not exists blocked_topics (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  terms text[] not null default array[]::text[],
  response text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table if not exists business_hours (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  timezone text not null default 'Europe/Berlin',
  day_of_week integer not null check (day_of_week between 0 and 6),
  opens_at text,
  closes_at text,
  is_closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists business_hours_tenant_idx on business_hours(tenant_id);

create table if not exists escalation_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  channel text not null default 'all',
  contact_label text,
  contact_value text,
  enabled boolean not null default true,
  create_handoff_request boolean not null default true,
  rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists escalation_rules_tenant_idx on escalation_rules(tenant_id);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  public_id text not null unique,
  channel text not null,
  external_user_id text,
  status text not null default 'open',
  locale text not null default 'en',
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists conversations_tenant_channel_idx on conversations(tenant_id, channel);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  channel text not null,
  direction text not null,
  role text not null,
  content text not null,
  status text not null default 'stored',
  trace jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists messages_tenant_conversation_idx on messages(tenant_id, conversation_id);
create index if not exists messages_created_idx on messages(created_at);

create table if not exists calls (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  provider text not null default 'twilio',
  provider_call_id text,
  from_number text,
  to_number text,
  status text not null default 'received',
  outcome text,
  summary text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists calls_tenant_started_idx on calls(tenant_id, started_at);

create table if not exists call_transcripts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  call_id uuid not null references calls(id) on delete cascade,
  speaker text not null,
  content text not null,
  started_at_ms integer,
  ended_at_ms integer,
  created_at timestamptz not null default now()
);
create index if not exists call_transcripts_tenant_call_idx on call_transcripts(tenant_id, call_id);

create table if not exists handoff_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  channel text not null,
  reason text not null,
  requester_message text not null,
  status text not null default 'open',
  assigned_to text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists handoff_requests_tenant_status_idx on handoff_requests(tenant_id, status);

create table if not exists answer_feedback (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete cascade,
  message_id uuid references messages(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);
create index if not exists answer_feedback_tenant_idx on answer_feedback(tenant_id);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'knowledge_sources',
    'knowledge_documents',
    'knowledge_chunks',
    'allowed_intents',
    'blocked_topics',
    'business_hours',
    'escalation_rules',
    'conversations',
    'messages',
    'calls',
    'call_transcripts',
    'handoff_requests',
    'answer_feedback'
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
