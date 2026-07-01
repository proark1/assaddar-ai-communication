set search_path = public, extensions;

-- Admin lists filter by tenant/status and then page newest rows first.
create index if not exists knowledge_chunks_tenant_status_created_idx
  on knowledge_chunks (tenant_id, status, created_at desc);

create index if not exists contacts_tenant_updated_idx
  on contacts (tenant_id, updated_at desc);

create index if not exists conversations_tenant_created_idx
  on conversations (tenant_id, created_at desc);

create index if not exists conversations_tenant_status_created_idx
  on conversations (tenant_id, status, created_at desc);

create index if not exists conversations_tenant_updated_idx
  on conversations (tenant_id, updated_at desc);

create index if not exists messages_tenant_conversation_created_idx
  on messages (tenant_id, conversation_id, created_at desc);

create index if not exists messages_tenant_channel_direction_created_idx
  on messages (tenant_id, channel, direction, created_at desc);

create index if not exists handoff_requests_tenant_status_created_idx
  on handoff_requests (tenant_id, status, created_at desc);

create index if not exists handoff_requests_tenant_conversation_status_idx
  on handoff_requests (tenant_id, conversation_id, status);

create index if not exists usage_events_tenant_event_type_idx
  on usage_events (tenant_id, event_type);

-- Immutable wrappers let Postgres use expression indexes for admin FTS lists.
create or replace function admin_conversation_search_text(
  conversation_public_id text,
  conversation_channel text,
  conversation_external_user_id text,
  conversation_locale text
)
returns text
language sql
immutable
parallel safe
as $$
  select
    coalesce(conversation_public_id, '') || ' ' ||
    coalesce(conversation_channel, '') || ' ' ||
    coalesce(conversation_external_user_id, '') || ' ' ||
    coalesce(conversation_locale, '')
$$;

create or replace function admin_contact_search_text(
  contact_display_name text,
  contact_email text,
  contact_phone text,
  contact_company text,
  contact_identifiers jsonb
)
returns text
language sql
immutable
parallel safe
as $$
  select
    coalesce(contact_display_name, '') || ' ' ||
    coalesce(contact_email, '') || ' ' ||
    coalesce(contact_phone, '') || ' ' ||
    coalesce(contact_company, '') || ' ' ||
    coalesce(contact_identifiers::text, '')
$$;

create or replace function admin_handoff_search_text(
  handoff_reason text,
  handoff_requester_message text,
  handoff_channel text,
  handoff_assigned_to text,
  handoff_metadata jsonb
)
returns text
language sql
immutable
parallel safe
as $$
  select
    coalesce(handoff_reason, '') || ' ' ||
    coalesce(handoff_requester_message, '') || ' ' ||
    coalesce(handoff_channel, '') || ' ' ||
    coalesce(handoff_assigned_to, '') || ' ' ||
    coalesce(handoff_metadata::text, '')
$$;

create index if not exists conversations_fts_idx
  on conversations
  using gin (
    to_tsvector(
      'simple'::regconfig,
      admin_conversation_search_text(public_id, channel, external_user_id, locale)
    )
  );

create index if not exists contacts_fts_idx
  on contacts
  using gin (
    to_tsvector(
      'simple'::regconfig,
      admin_contact_search_text(display_name, email, phone, company, identifiers)
    )
  );

create index if not exists handoff_requests_fts_idx
  on handoff_requests
  using gin (
    to_tsvector(
      'simple'::regconfig,
      admin_handoff_search_text(reason, requester_message, channel, assigned_to, metadata)
    )
  );
