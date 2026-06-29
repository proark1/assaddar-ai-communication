set search_path = public, extensions;

-- Usage events are always written/read with an explicit tenant id, so they can
-- participate in the same app.current_tenant_id RLS defense-in-depth as the
-- conversation and knowledge tables.
alter table if exists usage_events enable row level security;
drop policy if exists usage_events_tenant_isolation on usage_events;
create policy usage_events_tenant_isolation on usage_events
  using (tenant_id::text = current_setting('app.current_tenant_id', true))
  with check (tenant_id::text = current_setting('app.current_tenant_id', true));

-- Keep keyword retrieval in Postgres before the app performs deterministic
-- re-ranking. The expression mirrors the search query in TenantRepository.
create index if not exists knowledge_chunks_fts_idx
  on knowledge_chunks
  using gin (
    to_tsvector(
      'simple',
      coalesce(title, '') || ' ' || content || ' ' || array_to_string(tags, ' ')
    )
  )
  where status = 'approved';
