set search_path = public, extensions;

create table if not exists billing_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  stripe_customer_id text,
  status text not null default 'incomplete',
  default_currency text not null default 'eur',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists billing_accounts_tenant_idx
  on billing_accounts(tenant_id);
create unique index if not exists billing_accounts_stripe_customer_idx
  on billing_accounts(stripe_customer_id)
  where stripe_customer_id is not null;

create table if not exists billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  billing_account_id uuid not null references billing_accounts(id) on delete cascade,
  stripe_subscription_id text,
  stripe_price_id text,
  status text not null default 'incomplete',
  current_period_start timestamptz,
  current_period_end timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists billing_subscriptions_tenant_idx
  on billing_subscriptions(tenant_id);
create unique index if not exists billing_subscriptions_stripe_subscription_idx
  on billing_subscriptions(stripe_subscription_id)
  where stripe_subscription_id is not null;

create table if not exists telephone_number_inventory (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'easybell',
  phone_number text not null,
  country text not null default 'DE',
  locality text,
  number_type text not null default 'local',
  sip_target text,
  assistant_id text,
  status text not null default 'available',
  assigned_tenant_id uuid references tenants(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists telephone_number_inventory_phone_idx
  on telephone_number_inventory(phone_number);
create index if not exists telephone_number_inventory_status_idx
  on telephone_number_inventory(status);
create index if not exists telephone_number_inventory_assigned_tenant_idx
  on telephone_number_inventory(assigned_tenant_id);

create table if not exists telephone_number_reservations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  number_id uuid not null references telephone_number_inventory(id) on delete cascade,
  status text not null default 'active',
  expires_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists telephone_number_reservations_tenant_idx
  on telephone_number_reservations(tenant_id);
create index if not exists telephone_number_reservations_number_idx
  on telephone_number_reservations(number_id);
create unique index if not exists telephone_number_reservations_active_number_idx
  on telephone_number_reservations(number_id)
  where status = 'active';
create unique index if not exists telephone_number_reservations_active_tenant_idx
  on telephone_number_reservations(tenant_id)
  where status = 'active';

create table if not exists stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null,
  event_type text not null,
  tenant_id uuid references tenants(id) on delete set null,
  status text not null default 'received',
  payload jsonb not null default '{}'::jsonb,
  error text,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists stripe_webhook_events_event_idx
  on stripe_webhook_events(stripe_event_id);
create index if not exists stripe_webhook_events_tenant_idx
  on stripe_webhook_events(tenant_id);

create table if not exists billable_usage_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  source_usage_event_id uuid references usage_events(id) on delete set null,
  provider_call_id text not null,
  channel text not null default 'telephone',
  event_type text not null default 'accepted_call',
  quantity integer not null default 1,
  unit_amount_cents integer not null default 10,
  stripe_meter_event_id text,
  status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists billable_usage_events_tenant_call_idx
  on billable_usage_events(tenant_id, provider_call_id);
create index if not exists billable_usage_events_tenant_status_idx
  on billable_usage_events(tenant_id, status);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'billing_accounts',
    'billing_subscriptions',
    'telephone_number_reservations',
    'billable_usage_events'
  ]
  loop
    if to_regclass(table_name) is not null then
      execute format('alter table %I enable row level security', table_name);
      execute format('drop policy if exists %I on %I', table_name || '_tenant_isolation', table_name);
      execute format(
        'create policy %I on %I using (tenant_id::text = current_setting(''app.current_tenant_id'', true)) with check (tenant_id::text = current_setting(''app.current_tenant_id'', true))',
        table_name || '_tenant_isolation',
        table_name
      );
    end if;
  end loop;
end $$;
