import { describe, expect, it } from "vitest";
import { assertTenantId, TENANT_SCOPED_TABLES, tenantPolicyName } from "../src";

describe("tenant scope helpers", () => {
  it("lists all tenant-scoped product tables", () => {
    expect(TENANT_SCOPED_TABLES).toEqual([
      "knowledge_sources",
      "knowledge_documents",
      "knowledge_chunks",
      "allowed_intents",
      "blocked_topics",
      "business_hours",
      "escalation_rules",
      "contacts",
      "conversation_contacts",
      "conversations",
      "messages",
      "calls",
      "call_transcripts",
      "handoff_requests",
      "answer_feedback",
      "message_deliveries",
      "whatsapp_templates",
    ]);
  });

  it("rejects unsafe missing tenant identifiers", () => {
    expect(() => assertTenantId("")).toThrow(/tenant_id/);
    expect(() => assertTenantId("not-a-uuid")).toThrow(/tenant_id/);
  });

  it("generates row-level policy names consistently", () => {
    expect(tenantPolicyName("knowledge_chunks")).toBe("knowledge_chunks_tenant_isolation");
  });
});
