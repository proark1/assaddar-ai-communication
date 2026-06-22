import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
};

const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector(1536)";
  },
  toDriver(value) {
    return `[${value.join(",")}]`;
  },
  fromDriver(value) {
    if (typeof value !== "string") {
      return [];
    }

    return value
      .replace(/^\[/, "")
      .replace(/\]$/, "")
      .split(",")
      .filter(Boolean)
      .map(Number);
  }
});

export type WidgetTheme = {
  primaryColor?: string;
  backgroundColor?: string;
  textColor?: string;
  launcherLabel?: string;
  openingMessage?: string;
  language?: string;
  position?: "bottom-right" | "bottom-left";
  assistantName?: string;
  leadCaptureEnabled?: boolean;
  leadCaptureIntro?: string;
  leadCaptureFields?: string[];
  ctaLabel?: string;
  ctaUrl?: string;
};

export const tenants = pgTable("tenants", {
  id: uuid("id").defaultRandom().primaryKey(),
  publicId: text("public_id").notNull().unique(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  status: text("status").notNull().default("active"),
  defaultLocale: text("default_locale").notNull().default("en"),
  tone: text("tone").notNull().default("friendly"),
  confidenceThreshold: numeric("confidence_threshold", { precision: 4, scale: 3 }).notNull().default("0.180"),
  maxMessageLength: integer("max_message_length").notNull().default(1200),
  retentionDays: integer("retention_days").notNull().default(365),
  theme: jsonb("theme").$type<WidgetTheme>().notNull().default(sql`'{}'::jsonb`),
  ...timestamps
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull().default("active"),
    ...timestamps
  },
  (table) => [uniqueIndex("users_email_idx").on(table.email)]
);

export const roles = pgTable("roles", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  ...timestamps
});

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id").notNull().references(() => roles.id),
    status: text("status").notNull().default("active"),
    ...timestamps
  },
  (table) => [
    uniqueIndex("memberships_tenant_user_idx").on(table.tenantId, table.userId),
    index("memberships_tenant_idx").on(table.tenantId)
  ]
);

export const plans = pgTable("plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  monthlyMessageLimit: integer("monthly_message_limit").notNull(),
  monthlyPriceCents: integer("monthly_price_cents").notNull(),
  features: jsonb("features").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  ...timestamps
});

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    planId: uuid("plan_id").notNull().references(() => plans.id),
    status: text("status").notNull().default("trialing"),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    ...timestamps
  },
  (table) => [index("subscriptions_tenant_idx").on(table.tenantId)]
);

export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    eventType: text("event_type").notNull(),
    credits: integer("credits").notNull().default(0),
    estimatedCostCents: integer("estimated_cost_cents").notNull().default(0),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index("usage_events_tenant_created_idx").on(table.tenantId, table.createdAt)]
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull(),
    scopes: text("scopes").array().notNull().default(sql`ARRAY[]::text[]`),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    ...timestamps
  },
  (table) => [index("api_keys_tenant_idx").on(table.tenantId)]
);

export const channelConnections = pgTable(
  "channel_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    provider: text("provider").notNull(),
    externalAccountId: text("external_account_id"),
    status: text("status").notNull().default("pending"),
    encryptedAccessToken: text("encrypted_access_token"),
    encryptedRefreshToken: text("encrypted_refresh_token"),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    ...timestamps
  },
  (table) => [
    index("channel_connections_tenant_idx").on(table.tenantId),
    uniqueIndex("channel_connections_unique_idx").on(table.tenantId, table.channel, table.provider)
  ]
);

export const channelWebhookEvents = pgTable(
  "channel_webhook_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    channel: text("channel").notNull(),
    providerEventId: text("provider_event_id"),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").notNull().default("received"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true })
  },
  (table) => [index("channel_webhook_events_tenant_idx").on(table.tenantId)]
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index("audit_logs_tenant_created_idx").on(table.tenantId, table.createdAt)]
);

export const knowledgeSources = pgTable(
  "knowledge_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull().default("active"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    ...timestamps
  },
  (table) => [index("knowledge_sources_tenant_idx").on(table.tenantId)]
);

export const knowledgeDocuments = pgTable(
  "knowledge_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id").notNull().references(() => knowledgeSources.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: text("content").notNull(),
    status: text("status").notNull().default("approved"),
    checksum: text("checksum"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    ...timestamps
  },
  (table) => [
    index("knowledge_documents_tenant_idx").on(table.tenantId),
    index("knowledge_documents_source_idx").on(table.sourceId)
  ]
);

export const knowledgeChunks = pgTable(
  "knowledge_chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    documentId: uuid("document_id").notNull().references(() => knowledgeDocuments.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id").notNull().references(() => knowledgeSources.id, { onDelete: "cascade" }),
    title: text("title"),
    content: text("content").notNull(),
    embedding: vector("embedding"),
    tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    status: text("status").notNull().default("approved"),
    ...timestamps
  },
  (table) => [
    index("knowledge_chunks_tenant_idx").on(table.tenantId),
    index("knowledge_chunks_document_idx").on(table.documentId)
  ]
);

export const allowedIntents = pgTable(
  "allowed_intents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    keywords: text("keywords").array().notNull().default(sql`ARRAY[]::text[]`),
    examples: text("examples").array().notNull().default(sql`ARRAY[]::text[]`),
    enabled: boolean("enabled").notNull().default(true),
    ...timestamps
  },
  (table) => [uniqueIndex("allowed_intents_tenant_name_idx").on(table.tenantId, table.name)]
);

export const blockedTopics = pgTable(
  "blocked_topics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    terms: text("terms").array().notNull().default(sql`ARRAY[]::text[]`),
    response: text("response"),
    enabled: boolean("enabled").notNull().default(true),
    ...timestamps
  },
  (table) => [uniqueIndex("blocked_topics_tenant_name_idx").on(table.tenantId, table.name)]
);

export const businessHours = pgTable(
  "business_hours",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    timezone: text("timezone").notNull().default("Europe/Berlin"),
    dayOfWeek: integer("day_of_week").notNull(),
    opensAt: text("opens_at"),
    closesAt: text("closes_at"),
    isClosed: boolean("is_closed").notNull().default(false),
    ...timestamps
  },
  (table) => [index("business_hours_tenant_idx").on(table.tenantId)]
);

export const escalationRules = pgTable(
  "escalation_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    channel: text("channel").notNull().default("all"),
    contactLabel: text("contact_label"),
    contactValue: text("contact_value"),
    enabled: boolean("enabled").notNull().default(true),
    createHandoffRequest: boolean("create_handoff_request").notNull().default(true),
    rules: jsonb("rules").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    ...timestamps
  },
  (table) => [index("escalation_rules_tenant_idx").on(table.tenantId)]
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    publicId: text("public_id").notNull(),
    channel: text("channel").notNull(),
    externalUserId: text("external_user_id"),
    status: text("status").notNull().default("open"),
    locale: text("locale").notNull().default("en"),
    summary: text("summary"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    ...timestamps
  },
  (table) => [
    uniqueIndex("conversations_public_id_idx").on(table.publicId),
    index("conversations_tenant_channel_idx").on(table.tenantId, table.channel)
  ]
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    direction: text("direction").notNull(),
    role: text("role").notNull(),
    content: text("content").notNull(),
    status: text("status").notNull().default("stored"),
    trace: jsonb("trace").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("messages_tenant_conversation_idx").on(table.tenantId, table.conversationId),
    index("messages_created_idx").on(table.createdAt)
  ]
);

export const calls = pgTable(
  "calls",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    provider: text("provider").notNull().default("twilio"),
    providerCallId: text("provider_call_id"),
    fromNumber: text("from_number"),
    toNumber: text("to_number"),
    status: text("status").notNull().default("received"),
    outcome: text("outcome"),
    summary: text("summary"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`)
  },
  (table) => [index("calls_tenant_started_idx").on(table.tenantId, table.startedAt)]
);

export const callTranscripts = pgTable(
  "call_transcripts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    callId: uuid("call_id").notNull().references(() => calls.id, { onDelete: "cascade" }),
    speaker: text("speaker").notNull(),
    content: text("content").notNull(),
    startedAtMs: integer("started_at_ms"),
    endedAtMs: integer("ended_at_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index("call_transcripts_tenant_call_idx").on(table.tenantId, table.callId)]
);

export const handoffRequests = pgTable(
  "handoff_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    channel: text("channel").notNull(),
    reason: text("reason").notNull(),
    requesterMessage: text("requester_message").notNull(),
    status: text("status").notNull().default("open"),
    assignedTo: text("assigned_to"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    ...timestamps
  },
  (table) => [index("handoff_requests_tenant_status_idx").on(table.tenantId, table.status)]
);

export const answerFeedback = pgTable(
  "answer_feedback",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").references(() => messages.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index("answer_feedback_tenant_idx").on(table.tenantId)]
);
