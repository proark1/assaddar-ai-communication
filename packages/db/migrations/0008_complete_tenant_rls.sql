set search_path = public, extensions;

-- Keep every table that carries tenant data behind the same
-- app.current_tenant_id RLS boundary. Nullable tenant_id tables keep platform
-- or system rows hidden from tenant-scoped application roles.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'memberships',
    'tenant_invites',
    'subscriptions',
    'usage_events',
    'api_keys',
    'channel_connections',
    'channel_webhook_events',
    'contacts',
    'audit_logs',
    'knowledge_sources',
    'knowledge_documents',
    'knowledge_chunks',
    'allowed_intents',
    'blocked_topics',
    'business_hours',
    'escalation_rules',
    'conversations',
    'conversation_contacts',
    'messages',
    'calls',
    'call_transcripts',
    'handoff_requests',
    'answer_feedback',
    'message_deliveries',
    'whatsapp_templates'
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
