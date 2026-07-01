set search_path = public, extensions;

create index if not exists knowledge_chunks_admin_search_idx
  on knowledge_chunks
  using gin (
    to_tsvector(
      'simple'::regconfig,
      knowledge_chunk_search_text(title, content, tags)
    )
  );

create index if not exists conversations_tenant_updated_idx
  on conversations (tenant_id, updated_at desc);

create index if not exists contacts_tenant_updated_idx
  on contacts (tenant_id, updated_at desc);

create index if not exists handoff_requests_tenant_created_idx
  on handoff_requests (tenant_id, created_at desc);

create index if not exists messages_tenant_conversation_created_idx
  on messages (tenant_id, conversation_id, created_at desc);
