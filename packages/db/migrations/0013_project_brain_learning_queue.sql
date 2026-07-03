set search_path = public, extensions;

create table if not exists document_ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  source_id uuid references knowledge_sources(id) on delete set null,
  document_id uuid references knowledge_documents(id) on delete set null,
  object_key text,
  file_name text not null,
  content_type text not null,
  checksum text,
  status text not null default 'queued',
  error text,
  parser_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists document_ingestion_jobs_tenant_status_idx
  on document_ingestion_jobs(tenant_id, status, created_at desc);
create index if not exists document_ingestion_jobs_document_idx
  on document_ingestion_jobs(document_id);
create index if not exists document_ingestion_jobs_checksum_idx
  on document_ingestion_jobs(tenant_id, checksum);

create table if not exists brain_onboarding_answers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  question_key text not null,
  question text not null,
  answer text not null,
  category text not null default 'general',
  status text not null default 'draft',
  approved_chunk_id uuid references knowledge_chunks(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, question_key)
);
create index if not exists brain_onboarding_answers_tenant_status_idx
  on brain_onboarding_answers(tenant_id, status);

create table if not exists knowledge_suggestions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  source_type text not null,
  source_conversation_id uuid references conversations(id) on delete set null,
  source_message_id uuid references messages(id) on delete set null,
  source_document_id uuid references knowledge_documents(id) on delete set null,
  suggested_question text,
  suggested_answer text,
  suggested_title text,
  suggested_tags text[] not null default array[]::text[],
  suggested_metadata jsonb not null default '{}'::jsonb,
  confidence numeric(4, 3) not null default 0.000,
  status text not null default 'pending',
  reviewed_by_user_id uuid references users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  approved_chunk_id uuid references knowledge_chunks(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists knowledge_suggestions_tenant_status_idx
  on knowledge_suggestions(tenant_id, status, created_at desc);
create index if not exists knowledge_suggestions_tenant_source_idx
  on knowledge_suggestions(tenant_id, source_type, created_at desc);
create unique index if not exists knowledge_suggestions_source_message_idx
  on knowledge_suggestions(tenant_id, source_message_id, source_type)
  where source_message_id is not null;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'document_ingestion_jobs',
    'brain_onboarding_answers',
    'knowledge_suggestions'
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
