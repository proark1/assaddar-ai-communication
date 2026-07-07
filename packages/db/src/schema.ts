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
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
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
  },
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
  bookingUrl?: string;
  consentEnabled?: boolean;
  consentText?: string;
  quickReplies?: string[];
  readinessEnabled?: boolean;
  readinessIntro?: string;
  automation?: {
    ownerLeadEmailEnabled?: boolean;
    visitorConfirmationEmailEnabled?: boolean;
    autoQualifyReadinessEnabled?: boolean;
    autoQualifyLeadDetailsEnabled?: boolean;
    weeklySummaryEmailEnabled?: boolean;
    staleLeadReminderDays?: number;
    readinessQualificationScore?: number;
  };
};

export const tenants = pgTable("tenants", {
  id: uuid("id").defaultRandom().primaryKey(),
  publicId: text("public_id").notNull().unique(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  status: text("status").notNull().default("active"),
  defaultLocale: text("default_locale").notNull().default("en"),
  tone: text("tone").notNull().default("friendly"),
  confidenceThreshold: numeric("confidence_threshold", {
    precision: 4,
    scale: 3,
  })
    .notNull()
    .default("0.180"),
  maxMessageLength: integer("max_message_length").notNull().default(1200),
  retentionDays: integer("retention_days").notNull().default(365),
  theme: jsonb("theme")
    .$type<WidgetTheme>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  ...timestamps,
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    authUserId: uuid("auth_user_id"),
    email: text("email").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull().default("active"),
    passwordHash: text("password_hash"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("users_email_idx").on(table.email),
    uniqueIndex("users_auth_user_id_idx")
      .on(table.authUserId)
      .where(sql`${table.authUserId} is not null`),
  ],
);

export const roles = pgTable("roles", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  ...timestamps,
});

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
    status: text("status").notNull().default("active"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("memberships_tenant_user_idx").on(table.tenantId, table.userId),
    index("memberships_tenant_idx").on(table.tenantId),
  ],
);

export const userSessions = pgTable(
  "user_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("user_sessions_token_hash_idx").on(table.tokenHash),
    index("user_sessions_user_idx").on(table.userId),
    index("user_sessions_expires_idx").on(table.expiresAt),
  ],
);

export const tenantInvites = pgTable(
  "tenant_invites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    roleName: text("role_name").notNull(),
    tokenHash: text("token_hash").notNull(),
    invitedByUserId: uuid("invited_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("tenant_invites_token_hash_idx").on(table.tokenHash),
    index("tenant_invites_tenant_idx").on(table.tenantId),
    index("tenant_invites_email_idx").on(table.email),
  ],
);

export const plans = pgTable("plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  monthlyMessageLimit: integer("monthly_message_limit").notNull(),
  monthlyPriceCents: integer("monthly_price_cents").notNull(),
  features: jsonb("features")
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  ...timestamps,
});

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id),
    status: text("status").notNull().default("trialing"),
    currentPeriodStart: timestamp("current_period_start", {
      withTimezone: true,
    }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index("subscriptions_tenant_idx").on(table.tenantId)],
);

export const billingAccounts = pgTable(
  "billing_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    stripeCustomerId: text("stripe_customer_id"),
    status: text("status").notNull().default("incomplete"),
    defaultCurrency: text("default_currency").notNull().default("eur"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("billing_accounts_tenant_idx").on(table.tenantId),
    uniqueIndex("billing_accounts_stripe_customer_idx")
      .on(table.stripeCustomerId)
      .where(sql`${table.stripeCustomerId} is not null`),
  ],
);

export const billingSubscriptions = pgTable(
  "billing_subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    billingAccountId: uuid("billing_account_id")
      .notNull()
      .references(() => billingAccounts.id, { onDelete: "cascade" }),
    stripeSubscriptionId: text("stripe_subscription_id"),
    stripePriceId: text("stripe_price_id"),
    status: text("status").notNull().default("incomplete"),
    currentPeriodStart: timestamp("current_period_start", {
      withTimezone: true,
    }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...timestamps,
  },
  (table) => [
    index("billing_subscriptions_tenant_idx").on(table.tenantId),
    uniqueIndex("billing_subscriptions_stripe_subscription_idx")
      .on(table.stripeSubscriptionId)
      .where(sql`${table.stripeSubscriptionId} is not null`),
  ],
);

export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    eventType: text("event_type").notNull(),
    credits: integer("credits").notNull().default(0),
    estimatedCostCents: integer("estimated_cost_cents").notNull().default(0),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("usage_events_tenant_created_idx").on(
      table.tenantId,
      table.createdAt,
    ),
  ],
);

export const telephoneNumberInventory = pgTable(
  "telephone_number_inventory",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: text("provider").notNull().default("easybell"),
    phoneNumber: text("phone_number").notNull(),
    country: text("country").notNull().default("DE"),
    locality: text("locality"),
    numberType: text("number_type").notNull().default("local"),
    sipTarget: text("sip_target"),
    assistantId: text("assistant_id"),
    status: text("status").notNull().default("available"),
    assignedTenantId: uuid("assigned_tenant_id").references(() => tenants.id, {
      onDelete: "set null",
    }),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("telephone_number_inventory_phone_idx").on(table.phoneNumber),
    index("telephone_number_inventory_status_idx").on(table.status),
    index("telephone_number_inventory_assigned_tenant_idx").on(
      table.assignedTenantId,
    ),
  ],
);

export const telephoneNumberReservations = pgTable(
  "telephone_number_reservations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    numberId: uuid("number_id")
      .notNull()
      .references(() => telephoneNumberInventory.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("telephone_number_reservations_tenant_idx").on(table.tenantId),
    index("telephone_number_reservations_number_idx").on(table.numberId),
    uniqueIndex("telephone_number_reservations_active_number_idx")
      .on(table.numberId)
      .where(sql`${table.status} = 'active'`),
    uniqueIndex("telephone_number_reservations_active_tenant_idx")
      .on(table.tenantId)
      .where(sql`${table.status} = 'active'`),
  ],
);

export const stripeWebhookEvents = pgTable(
  "stripe_webhook_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    stripeEventId: text("stripe_event_id").notNull(),
    eventType: text("event_type").notNull(),
    tenantId: uuid("tenant_id").references(() => tenants.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("received"),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    error: text("error"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("stripe_webhook_events_event_idx").on(table.stripeEventId),
    index("stripe_webhook_events_tenant_idx").on(table.tenantId),
  ],
);

export const billableUsageEvents = pgTable(
  "billable_usage_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    sourceUsageEventId: uuid("source_usage_event_id").references(
      () => usageEvents.id,
      { onDelete: "set null" },
    ),
    providerCallId: text("provider_call_id").notNull(),
    channel: text("channel").notNull().default("telephone"),
    eventType: text("event_type").notNull().default("accepted_call"),
    quantity: integer("quantity").notNull().default(1),
    unitAmountCents: integer("unit_amount_cents").notNull().default(10),
    stripeMeterEventId: text("stripe_meter_event_id"),
    status: text("status").notNull().default("pending"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("billable_usage_events_tenant_call_idx").on(
      table.tenantId,
      table.providerCallId,
    ),
    index("billable_usage_events_tenant_status_idx").on(
      table.tenantId,
      table.status,
    ),
  ],
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull(),
    scopes: text("scopes")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index("api_keys_tenant_idx").on(table.tenantId)],
);

export const channelConnections = pgTable(
  "channel_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    provider: text("provider").notNull(),
    externalAccountId: text("external_account_id"),
    status: text("status").notNull().default("pending"),
    encryptedAccessToken: text("encrypted_access_token"),
    encryptedRefreshToken: text("encrypted_refresh_token"),
    settings: jsonb("settings")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...timestamps,
  },
  (table) => [
    index("channel_connections_tenant_idx").on(table.tenantId),
    uniqueIndex("channel_connections_unique_idx").on(
      table.tenantId,
      table.channel,
      table.provider,
    ),
  ],
);

export const channelWebhookEvents = pgTable(
  "channel_webhook_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id, {
      onDelete: "set null",
    }),
    channel: text("channel").notNull(),
    providerEventId: text("provider_event_id"),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").notNull().default("received"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [
    index("channel_webhook_events_tenant_idx").on(table.tenantId),
    // Idempotency is tenant-scoped: a provider_event_id colliding across tenants
    // must not let one tenant's event be swallowed as another's duplicate. See
    // migration 0016.
    uniqueIndex("channel_webhook_events_tenant_event_idx").on(
      table.tenantId,
      table.channel,
      table.providerEventId,
    ),
  ],
);

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    displayName: text("display_name"),
    email: text("email"),
    phone: text("phone"),
    company: text("company"),
    status: text("status").notNull().default("active"),
    confidence: integer("confidence").notNull().default(50),
    identifiers: jsonb("identifiers")
      .$type<Record<string, string[]>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...timestamps,
  },
  (table) => [
    index("contacts_tenant_idx").on(table.tenantId),
    index("contacts_tenant_email_idx").on(table.tenantId, table.email),
    index("contacts_tenant_phone_idx").on(table.tenantId, table.phone),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id, {
      onDelete: "set null",
    }),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("audit_logs_tenant_created_idx").on(table.tenantId, table.createdAt),
  ],
);

export const knowledgeSources = pgTable(
  "knowledge_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull().default("active"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...timestamps,
  },
  (table) => [index("knowledge_sources_tenant_idx").on(table.tenantId)],
);

export const knowledgeDocuments = pgTable(
  "knowledge_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => knowledgeSources.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: text("content").notNull(),
    status: text("status").notNull().default("approved"),
    checksum: text("checksum"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...timestamps,
  },
  (table) => [
    index("knowledge_documents_tenant_idx").on(table.tenantId),
    index("knowledge_documents_source_idx").on(table.sourceId),
  ],
);

export const documentIngestionJobs = pgTable(
  "document_ingestion_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id").references(() => knowledgeSources.id, {
      onDelete: "set null",
    }),
    documentId: uuid("document_id").references(() => knowledgeDocuments.id, {
      onDelete: "set null",
    }),
    objectKey: text("object_key"),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    checksum: text("checksum"),
    status: text("status").notNull().default("queued"),
    error: text("error"),
    parserMetadata: jsonb("parser_metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...timestamps,
  },
  (table) => [
    index("document_ingestion_jobs_tenant_status_idx").on(
      table.tenantId,
      table.status,
      table.createdAt.desc(),
    ),
    index("document_ingestion_jobs_document_idx").on(table.documentId),
    index("document_ingestion_jobs_checksum_idx").on(
      table.tenantId,
      table.checksum,
    ),
  ],
);

export const knowledgeChunks = pgTable(
  "knowledge_chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => knowledgeDocuments.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => knowledgeSources.id, { onDelete: "cascade" }),
    title: text("title"),
    content: text("content").notNull(),
    embedding: vector("embedding"),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    status: text("status").notNull().default("approved"),
    ...timestamps,
  },
  (table) => [
    index("knowledge_chunks_tenant_idx").on(table.tenantId),
    index("knowledge_chunks_document_idx").on(table.documentId),
  ],
);

export const brainOnboardingAnswers = pgTable(
  "brain_onboarding_answers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    questionKey: text("question_key").notNull(),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    category: text("category").notNull().default("general"),
    status: text("status").notNull().default("draft"),
    approvedChunkId: uuid("approved_chunk_id").references(
      () => knowledgeChunks.id,
      { onDelete: "set null" },
    ),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("brain_onboarding_answers_tenant_key_idx").on(
      table.tenantId,
      table.questionKey,
    ),
    index("brain_onboarding_answers_tenant_status_idx").on(
      table.tenantId,
      table.status,
    ),
  ],
);

export const knowledgeSuggestions = pgTable(
  "knowledge_suggestions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    sourceType: text("source_type").notNull(),
    sourceConversationId: uuid("source_conversation_id"),
    sourceMessageId: uuid("source_message_id"),
    sourceDocumentId: uuid("source_document_id").references(
      () => knowledgeDocuments.id,
      { onDelete: "set null" },
    ),
    suggestedQuestion: text("suggested_question"),
    suggestedAnswer: text("suggested_answer"),
    suggestedTitle: text("suggested_title"),
    suggestedTags: text("suggested_tags")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    suggestedMetadata: jsonb("suggested_metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    confidence: numeric("confidence", { precision: 4, scale: 3 })
      .notNull()
      .default("0.000"),
    status: text("status").notNull().default("pending"),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    approvedChunkId: uuid("approved_chunk_id").references(
      () => knowledgeChunks.id,
      { onDelete: "set null" },
    ),
    ...timestamps,
  },
  (table) => [
    index("knowledge_suggestions_tenant_status_idx").on(
      table.tenantId,
      table.status,
      table.createdAt.desc(),
    ),
    index("knowledge_suggestions_tenant_source_idx").on(
      table.tenantId,
      table.sourceType,
      table.createdAt.desc(),
    ),
    uniqueIndex("knowledge_suggestions_source_message_idx")
      .on(table.tenantId, table.sourceMessageId, table.sourceType)
      .where(sql`${table.sourceMessageId} is not null`),
  ],
);

export const allowedIntents = pgTable(
  "allowed_intents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    keywords: text("keywords")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    examples: text("examples")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    enabled: boolean("enabled").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("allowed_intents_tenant_name_idx").on(
      table.tenantId,
      table.name,
    ),
  ],
);

export const blockedTopics = pgTable(
  "blocked_topics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    terms: text("terms")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    response: text("response"),
    enabled: boolean("enabled").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("blocked_topics_tenant_name_idx").on(
      table.tenantId,
      table.name,
    ),
  ],
);

export const businessHours = pgTable(
  "business_hours",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    timezone: text("timezone").notNull().default("Europe/Berlin"),
    dayOfWeek: integer("day_of_week").notNull(),
    opensAt: text("opens_at"),
    closesAt: text("closes_at"),
    isClosed: boolean("is_closed").notNull().default(false),
    ...timestamps,
  },
  (table) => [index("business_hours_tenant_idx").on(table.tenantId)],
);

export const escalationRules = pgTable(
  "escalation_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    channel: text("channel").notNull().default("all"),
    contactLabel: text("contact_label"),
    contactValue: text("contact_value"),
    enabled: boolean("enabled").notNull().default(true),
    createHandoffRequest: boolean("create_handoff_request")
      .notNull()
      .default(true),
    rules: jsonb("rules")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...timestamps,
  },
  (table) => [index("escalation_rules_tenant_idx").on(table.tenantId)],
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    publicId: text("public_id").notNull(),
    channel: text("channel").notNull(),
    externalUserId: text("external_user_id"),
    status: text("status").notNull().default("open"),
    locale: text("locale").notNull().default("en"),
    summary: text("summary"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("conversations_public_id_idx").on(table.publicId),
    index("conversations_tenant_channel_idx").on(table.tenantId, table.channel),
  ],
);

export const conversationContacts = pgTable(
  "conversation_contacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("conversation_contacts_tenant_conversation_idx").on(
      table.tenantId,
      table.conversationId,
    ),
    index("conversation_contacts_tenant_contact_idx").on(
      table.tenantId,
      table.contactId,
    ),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    direction: text("direction").notNull(),
    role: text("role").notNull(),
    content: text("content").notNull(),
    status: text("status").notNull().default("stored"),
    trace: jsonb("trace")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("messages_tenant_conversation_idx").on(
      table.tenantId,
      table.conversationId,
    ),
    index("messages_created_idx").on(table.createdAt),
  ],
);

export const calls = pgTable(
  "calls",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    provider: text("provider").notNull().default("twilio"),
    providerCallId: text("provider_call_id"),
    fromNumber: text("from_number"),
    toNumber: text("to_number"),
    status: text("status").notNull().default("received"),
    outcome: text("outcome"),
    summary: text("summary"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (table) => [
    index("calls_tenant_started_idx").on(table.tenantId, table.startedAt),
  ],
);

export const callTranscripts = pgTable(
  "call_transcripts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    callId: uuid("call_id")
      .notNull()
      .references(() => calls.id, { onDelete: "cascade" }),
    speaker: text("speaker").notNull(),
    content: text("content").notNull(),
    startedAtMs: integer("started_at_ms"),
    endedAtMs: integer("ended_at_ms"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("call_transcripts_tenant_call_idx").on(table.tenantId, table.callId),
  ],
);

export const handoffRequests = pgTable(
  "handoff_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    channel: text("channel").notNull(),
    reason: text("reason").notNull(),
    requesterMessage: text("requester_message").notNull(),
    status: text("status").notNull().default("open"),
    assignedTo: text("assigned_to"),
    // Optional client-supplied / derived key used to dedupe retried lead and
    // readiness submissions. Null for handoffs that opt out of idempotency.
    idempotencyKey: text("idempotency_key"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...timestamps,
  },
  (table) => [
    index("handoff_requests_tenant_status_idx").on(
      table.tenantId,
      table.status,
    ),
    // Dedupe retries: only one handoff per (tenant, conversation, key). Partial
    // so handoffs without a key are unaffected. See migration 0006.
    uniqueIndex("handoff_requests_idempotency_idx")
      .on(table.tenantId, table.conversationId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
    // Matches listHandoffs ordering (created_at desc) for the list/pagination
    // query. See migration 0005_handoff_created_index.sql.
    index("handoff_requests_tenant_created_idx").on(
      table.tenantId,
      table.createdAt.desc(),
    ),
  ],
);

export const answerFeedback = pgTable(
  "answer_feedback",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "cascade",
    }),
    messageId: uuid("message_id").references(() => messages.id, {
      onDelete: "cascade",
    }),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("answer_feedback_tenant_idx").on(table.tenantId)],
);

export const messageDeliveries = pgTable(
  "message_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    channel: text("channel").notNull(),
    provider: text("provider").notNull(),
    providerMessageId: text("provider_message_id"),
    status: text("status").notNull().default("queued"),
    detail: text("detail"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("message_deliveries_tenant_created_idx").on(
      table.tenantId,
      table.createdAt,
    ),
    index("message_deliveries_provider_message_idx").on(
      table.providerMessageId,
    ),
    // Partial index for the cross-tenant delivery-retry worker sweep, which
    // filters failed rows and orders by updated_at with no tenant predicate.
    // See migration 0015.
    index("message_deliveries_retry_idx")
      .on(table.updatedAt)
      .where(sql`${table.status} = 'failed'`),
  ],
);

export const whatsappTemplates = pgTable(
  "whatsapp_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    language: text("language").notNull().default("de"),
    category: text("category").notNull().default("utility"),
    status: text("status").notNull().default("draft"),
    body: text("body").notNull(),
    variables: text("variables")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    providerTemplateId: text("provider_template_id"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("whatsapp_templates_tenant_name_language_idx").on(
      table.tenantId,
      table.name,
      table.language,
    ),
    index("whatsapp_templates_tenant_status_idx").on(
      table.tenantId,
      table.status,
    ),
  ],
);
