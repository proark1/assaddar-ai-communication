import { describe, expect, it } from "vitest";
import { getTableName } from "drizzle-orm";
import {
  allowedIntents,
  answerFeedback,
  apiKeys,
  assertTenantId,
  auditLogs,
  billableUsageEvents,
  billingAccounts,
  billingSubscriptions,
  blockedTopics,
  brainOnboardingAnswers,
  businessHours,
  calls,
  callTranscripts,
  channelConnections,
  channelWebhookEvents,
  contacts,
  conversationContacts,
  conversations,
  documentIngestionJobs,
  escalationRules,
  handoffRequests,
  knowledgeChunks,
  knowledgeDocuments,
  knowledgeSuggestions,
  knowledgeSources,
  memberships,
  messageDeliveries,
  messages,
  subscriptions,
  TENANT_SCOPED_TABLES,
  onebrainSyncRecords,
  portalLinkProjections,
  telephoneNumberReservations,
  tenantInvites,
  tenantPolicyName,
  usageEvents,
  whatsappTemplates,
} from "../src";

describe("tenant scope helpers", () => {
  it("lists all tenant-scoped product tables", () => {
    expect(TENANT_SCOPED_TABLES).toEqual([
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
      "onebrain_sync_records",
      "portal_link_projections",
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
    ]);
  });

  it("covers every schema table that stores tenant_id", () => {
    const schemaTenantTables = [
      memberships,
      tenantInvites,
      subscriptions,
      billingAccounts,
      billingSubscriptions,
      usageEvents,
      telephoneNumberReservations,
      billableUsageEvents,
      apiKeys,
      channelConnections,
      channelWebhookEvents,
      contacts,
      auditLogs,
      knowledgeSources,
      knowledgeDocuments,
      documentIngestionJobs,
      knowledgeChunks,
      brainOnboardingAnswers,
      knowledgeSuggestions,
      onebrainSyncRecords,
      portalLinkProjections,
      allowedIntents,
      blockedTopics,
      businessHours,
      escalationRules,
      conversations,
      conversationContacts,
      messages,
      calls,
      callTranscripts,
      handoffRequests,
      answerFeedback,
      messageDeliveries,
      whatsappTemplates,
    ].map((table) => getTableName(table));

    expect(TENANT_SCOPED_TABLES).toEqual(schemaTenantTables);
  });

  it("rejects unsafe missing tenant identifiers", () => {
    expect(() => assertTenantId("")).toThrow(/tenant_id/);
    expect(() => assertTenantId("not-a-uuid")).toThrow(/tenant_id/);
  });

  it("generates row-level policy names consistently", () => {
    expect(tenantPolicyName("knowledge_chunks")).toBe(
      "knowledge_chunks_tenant_isolation",
    );
  });
});
