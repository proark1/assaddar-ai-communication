-- Turn the tenant-isolation RLS policies into a real, enforced backstop.
--
-- Migration 0008 ENABLEs RLS on every tenant table, but a table's OWNER is
-- exempt from its own policies unless FORCE ROW LEVEL SECURITY is set. Because
-- the app historically connects as the owner, those policies do nothing. This
-- script forces RLS so the policies also apply to the owner, and it only makes
-- sense once the API connects as a NON-OWNER role (see scripts/create-app-role.sql
-- and APP_DATABASE_URL).
--
-- IMPORTANT operational model once this is applied:
--   * API (serves untrusted traffic)  -> APP_DATABASE_URL (non-owner, RLS enforced)
--   * Workers / migrations (trusted)   -> DATABASE_URL (owner; still forced, but the
--     worker sweeps cross-tenant, so run it as the OWNER which you keep on
--     DATABASE_URL). FORCE applies to the owner too, so the worker relies on the
--     repository setting app.current_tenant_id per tenant.
--
-- Run as the table owner (the DATABASE_URL role):
--   psql "$DATABASE_URL" -f scripts/enable-force-rls.sql
--
-- Verify afterwards with:  pnpm db:check   (with APP_DATABASE_URL set)

set search_path = public, extensions;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'memberships',
    'tenant_invites',
    'subscriptions',
    'billing_accounts',
    'billing_subscriptions',
    'usage_events',
    'telephone_number_reservations',
    'billable_usage_events',
    'api_keys',
    'channel_connections',
    'channel_webhook_events',
    'contacts',
    'audit_logs',
    'knowledge_sources',
    'knowledge_documents',
    'document_ingestion_jobs',
    'knowledge_chunks',
    'brain_onboarding_answers',
    'knowledge_suggestions',
    'onebrain_sync_records',
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
      execute format('alter table %I force row level security', table_name);
    end if;
  end loop;
end $$;
