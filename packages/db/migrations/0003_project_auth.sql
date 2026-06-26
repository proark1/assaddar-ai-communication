alter table users add column if not exists password_hash text;
alter table users add column if not exists email_verified_at timestamptz;

create table if not exists user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  user_agent text,
  ip_address text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists user_sessions_user_idx on user_sessions(user_id);
create index if not exists user_sessions_expires_idx on user_sessions(expires_at);

create table if not exists tenant_invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  email text not null,
  role_name text not null,
  token_hash text not null unique,
  invited_by_user_id uuid references users(id) on delete set null,
  status text not null default 'pending',
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tenant_invites_tenant_idx on tenant_invites(tenant_id);
create index if not exists tenant_invites_email_idx on tenant_invites(email);

insert into roles (name, description)
values
  ('platform_owner', 'Can manage all tenants and platform settings.'),
  ('tenant_owner', 'Can manage the tenant, users, channels, knowledge, and leads.'),
  ('tenant_admin', 'Can configure tenant settings, channels, knowledge, and leads.'),
  ('operator', 'Can manage leads, conversations, and handoffs.'),
  ('viewer', 'Can view tenant data without changing settings.')
on conflict (name) do nothing;
