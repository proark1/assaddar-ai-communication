export const TENANT_SCOPED_TABLES = [
  "memberships",
  "tenant_invites",
  "subscriptions",
  "billing_accounts",
  "billing_subscriptions",
  "usage_events",
  "telephone_number_reservations",
  "billable_usage_events",
  "api_keys",
  "channel_connections",
  "channel_webhook_events",
  "contacts",
  "audit_logs",
  "knowledge_sources",
  "knowledge_documents",
  "document_ingestion_jobs",
  "knowledge_chunks",
  "brain_onboarding_answers",
  "knowledge_suggestions",
  "allowed_intents",
  "blocked_topics",
  "business_hours",
  "escalation_rules",
  "conversations",
  "conversation_contacts",
  "messages",
  "calls",
  "call_transcripts",
  "handoff_requests",
  "answer_feedback",
  "message_deliveries",
  "whatsapp_templates",
] as const;

export type TenantScopedTable = (typeof TENANT_SCOPED_TABLES)[number];

export function assertTenantId(tenantId: string): string {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      tenantId,
    )
  ) {
    throw new Error(
      "A valid tenant_id is required for tenant-scoped data access.",
    );
  }

  return tenantId;
}

export function tenantPolicyName(table: TenantScopedTable): string {
  return `${table}_tenant_isolation`;
}
