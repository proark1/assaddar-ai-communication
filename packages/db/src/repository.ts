import type {
  AnswerDataStore,
  AllowedIntent,
  BlockedTopic,
  Channel,
  HandoffInput,
  HandoffStore,
  KnowledgeChunk,
  RetrievedChunk,
  TenantPolicy,
} from "@assaddar/core";
import { createDefaultTenantPolicy, rankChunks } from "@assaddar/core";
import {
  and,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import {
  ChannelAccountConflictError,
  isUniqueViolation,
  TenantLegalHoldError,
} from "./errors";
import type { Database, DbExecutor, Transaction } from "./client";
import {
  allowedIntents,
  auditLogs,
  billableUsageEvents,
  billingAccounts,
  billingSubscriptions,
  blockedTopics,
  brainOnboardingAnswers,
  calls,
  callTranscripts,
  onebrainTombstoneCursor,
  channelConnections,
  channelWebhookEvents,
  conversationContacts,
  contacts,
  conversations,
  documentIngestionJobs,
  escalationRules,
  handoffRequests,
  knowledgeChunks,
  knowledgeDocuments,
  knowledgeSuggestions,
  knowledgeSources,
  messageDeliveries,
  messages,
  memberships,
  portalLinkProjections,
  roles,
  stripeWebhookEvents,
  tenantInvites,
  tenants,
  telephoneNumberInventory,
  telephoneNumberReservations,
  usageEvents,
  users,
  userSessions,
  whatsappTemplates,
  type WidgetTheme,
} from "./schema";
import {
  getOneBrainSyncRecordRow,
  getOneBrainSyncSummaryRow,
  type OneBrainSyncSourceInput as SyncSourceInput,
  type RecordOneBrainSyncInput as SyncRecordInput,
  recordOneBrainSyncFailureRow,
  recordOneBrainSyncSuccessRow,
} from "./repository-onebrain";
import {
  captureOneBrainDeletesForTenantRow,
  listPendingOneBrainDeleteRows,
  markOneBrainDeleteDoneRow,
  markOneBrainDeleteFailedRow,
  type OneBrainDeleteOutboxRow,
} from "./repository-onebrain-delete";
import { assertTenantId } from "./tenant-scope";
import {
  billingStatusFromStripe,
  buildDocumentSuggestionSections,
  channelIdentifierKey,
  clampConfidence,
  contactIdentifierContainmentValues,
  createPublicAssistantId,
  createPublicConversationId,
  deriveConversationNextAction,
  deriveQualityMetrics,
  extractTemplateVariables,
  hasSharedIdentifier,
  isLearningHandoffReason,
  isMeaningfulQuestion,
  isPhoneIdentityChannel,
  mergeIdentifierMaps,
  mergeIdentifierValues,
  normalizeContactInput,
  normalizeEmail,
  normalizeFullTextQuery,
  normalizeKnowledgeText,
  normalizeListStatus,
  normalizeOptionalText,
  normalizePhone,
  normalizeRoleName,
  normalizeTemplateName,
  deliveryStatusRank,
  readAttempts,
  readStringOrNull,
  rejectSecretSettings,
  resolvePagination,
  retentionCutoff,
  roleDescription,
  setTenantSession,
  telephoneNumberValues,
  titleCase,
  toAggregateDate,
} from "./repository-helpers";
import type { ChannelCredentialCipher } from "./secrets";

export {
  createPublicAssistantId,
  createPublicConversationId,
  deriveQualityMetrics,
  retentionCutoff,
  setTenantSession,
} from "./repository-helpers";

export type TenantSummary = typeof tenants.$inferSelect;

export type RoleName =
  "platform_owner" | "tenant_owner" | "tenant_admin" | "operator" | "viewer";

export type AuthUserRecord = Pick<
  typeof users.$inferSelect,
  "id" | "authUserId" | "email" | "name" | "status" | "passwordHash"
>;

export type TenantMembershipSummary = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  role: RoleName;
  status: string;
};

export type AuthSessionRecord = {
  sessionId: string;
  expiresAt: Date;
  user: {
    id: string;
    email: string;
    name: string;
    status: string;
  };
  memberships: TenantMembershipSummary[];
};

export type UpsertTenantUserInput = {
  email: string;
  name: string;
  role: RoleName;
  authUserId?: string | null | undefined;
  passwordHash?: string | null | undefined;
};

export type CreatePasswordUserInput = {
  email: string;
  name: string;
  passwordHash: string;
};

export type SupabaseAuthUserInput = {
  authUserId: string;
  email: string;
  name?: string | null | undefined;
  expiresAt: Date;
};

export type CreateTenantInviteInput = {
  email: string;
  role: RoleName;
  tokenHash: string;
  expiresAt: Date;
  invitedByUserId?: string | null | undefined;
};

export type AcceptTenantInviteInput = {
  tokenHash: string;
  name: string;
  passwordHash: string;
};

export type CreateTenantInput = {
  name: string;
  slug: string;
  defaultLocale?: string;
  theme?: WidgetTheme;
  status?: string;
};

export type UpdateTenantInput = {
  name?: string;
  slug?: string;
  defaultLocale?: string;
  tone?: "friendly" | "neutral" | "formal";
  confidenceThreshold?: number;
  maxMessageLength?: number;
  retentionDays?: number;
  theme?: WidgetTheme;
};

export type AddFaqInput = {
  question: string;
  answer: string;
  tags?: string[];
};

export type UpdateFaqInput = AddFaqInput;

export type BrainOnboardingAnswerInput = {
  questionKey: string;
  question: string;
  answer: string;
  category?: string | undefined;
  status?: "draft" | "approved" | "archived" | undefined;
  metadata?: Record<string, unknown> | undefined;
};

export type UpsertBrainOnboardingInput = {
  answers: BrainOnboardingAnswerInput[];
  publishApproved?: boolean | undefined;
};

export type CreateKnowledgeSuggestionInput = {
  sourceType:
    | "unanswered_question"
    | "human_reply"
    | "document_extraction"
    | "feedback"
    | "manual"
    | "conflict_detection";
  sourceConversationId?: string | null | undefined;
  sourceMessageId?: string | null | undefined;
  sourceDocumentId?: string | null | undefined;
  suggestedQuestion?: string | null | undefined;
  suggestedAnswer?: string | null | undefined;
  suggestedTitle?: string | null | undefined;
  suggestedTags?: string[] | undefined;
  suggestedMetadata?: Record<string, unknown> | undefined;
  confidence?: number | undefined;
};

export type ReviewKnowledgeSuggestionInput = {
  question?: string | undefined;
  answer?: string | undefined;
  title?: string | undefined;
  tags?: string[] | undefined;
  reviewNote?: string | undefined;
  reviewedByUserId?: string | null | undefined;
};

export type IngestKnowledgeDocumentInput = {
  fileName: string;
  contentType: string;
  extractedText: string;
  checksum?: string | null | undefined;
  objectKey?: string | null | undefined;
  sourceName?: string | undefined;
  suggestedTags?: string[] | undefined;
  metadata?: Record<string, unknown> | undefined;
  maxSuggestions?: number | undefined;
};

export type RecordDocumentIngestionFailureInput = {
  fileName: string;
  contentType: string;
  checksum?: string | null | undefined;
  objectKey?: string | null | undefined;
  error: string;
  metadata?: Record<string, unknown> | undefined;
};

export type IngestKnowledgeDocumentResult = {
  source: KnowledgeSourceRecord;
  document: KnowledgeDocumentRecord;
  job: DocumentIngestionJobRecord;
  suggestions: KnowledgeSuggestionRecord[];
  duplicate: boolean;
};

export type ScanKnowledgeSuggestionsResult = {
  created: KnowledgeSuggestionRecord[];
  skipped: number;
  scanned: number;
};

/**
 * Optional pagination for list endpoints. Defaults preserve the previous
 * behaviour (first page, capped page size) so existing callers are unaffected.
 */
export type PaginationOptions = {
  limit?: number | undefined;
  offset?: number | undefined;
  q?: string | undefined;
  status?: string | undefined;
};

export type ConversationRecord = typeof conversations.$inferSelect;

export type MessageRecord = typeof messages.$inferSelect;

export type ContactRecord = typeof contacts.$inferSelect;

export type ChannelConnectionRecord = typeof channelConnections.$inferSelect;

export type ChannelWebhookEventRecord =
  typeof channelWebhookEvents.$inferSelect;

export type TenantInviteRecord = typeof tenantInvites.$inferSelect;

export type KnowledgeSourceRecord = typeof knowledgeSources.$inferSelect;

export type KnowledgeDocumentRecord = typeof knowledgeDocuments.$inferSelect;

export type KnowledgeChunkRecord = typeof knowledgeChunks.$inferSelect;

export type BrainOnboardingAnswerRecord =
  typeof brainOnboardingAnswers.$inferSelect;

export type KnowledgeSuggestionRecord =
  typeof knowledgeSuggestions.$inferSelect;
export type DocumentIngestionJobRecord =
  typeof documentIngestionJobs.$inferSelect;
export type MessageDeliveryRecord = typeof messageDeliveries.$inferSelect;
export type PortalLinkProjectionRecord =
  typeof portalLinkProjections.$inferSelect;

export type CreatePortalLinkProjectionInput = {
  onebrainRecordId: string;
  tokenHash: string;
  conversationId?: string | null | undefined;
  contactId?: string | null | undefined;
  scope?: "conversation" | "contact" | undefined;
  expiresAt: Date;
  createdByUserId?: string | null | undefined;
  metadata?: Record<string, unknown> | undefined;
};

/**
 * A failed outbound delivery that is eligible for an automatic re-send, joined
 * with the reply text and recipient routing needed to reconstruct the outbound
 * message. Produced by {@link TenantRepository.listRetryableDeliveries} for the
 * delivery-retry worker.
 */
export type RetryableDelivery = {
  id: string;
  tenantId: string;
  channel: Channel;
  provider: string;
  text: string;
  providerAccountId: string | null;
  externalConversationId: string | null;
  externalUserId: string | null;
  attempts: number;
};

export type RecordChannelWebhookEventResult = {
  event: ChannelWebhookEventRecord;
  duplicate: boolean;
};

export type HandoffRecord = typeof handoffRequests.$inferSelect;

export type WhatsappTemplateRecord = typeof whatsappTemplates.$inferSelect;

export type TenantUserSummary = {
  id: string;
  email: string;
  name: string;
  status: string;
  role: string;
  membershipStatus: string;
  createdAt: Date;
  updatedAt: Date;
};

export type UpsertTenantUserRecord = typeof users.$inferSelect & {
  role: RoleName;
  membershipId: string | null;
};

export type AddFaqResult = {
  source: KnowledgeSourceRecord;
  document: KnowledgeDocumentRecord;
  chunk: KnowledgeChunkRecord;
};

export type KnowledgeListItem = Pick<
  KnowledgeChunkRecord,
  | "id"
  | "documentId"
  | "sourceId"
  | "title"
  | "content"
  | "tags"
  | "status"
  | "metadata"
  | "createdAt"
  | "updatedAt"
>;

export type UnifiedInboxItem = {
  id: string;
  publicId: string;
  channel: string;
  status: string;
  locale: string;
  externalUserId: string | null;
  summary: string | null;
  createdAt: Date;
  updatedAt: Date;
  contact: ContactRecord | null;
  lastMessage: {
    id: string;
    direction: string;
    role: string;
    content: string;
    createdAt: Date;
  } | null;
  messageCount: number;
  openHandoffs: Array<{
    id: string;
    reason: string;
    status: string;
    assignedTo: string | null;
    createdAt: Date;
  }>;
  nextAction: ReturnType<typeof deriveConversationNextAction>;
};

export type TenantAnalyticsResult = {
  conversations: number;
  messages: number;
  approvedKnowledge: number;
  openHandoffs: number;
  totalHandoffs: number;
  // Captured lead / readiness-assessment handoffs. Surfaced as an aggregate so
  // the privacy-restricted platform-admin view can show a coherent lead count
  // without loading individual handoff content (the R4 boundary).
  leads: number;
  contacts: number;
  lastConversationAt: Date | null;
  lastMessageAt: Date | null;
  usageByStatus: Array<{
    eventType: string;
    total: number;
    credits: number;
  }>;
  // Outbound delivery health so tenants/operators can see when replies are not
  // actually reaching customers. `failed` counts real send failures (distinct
  // from `skipped`, which are intentional non-sends).
  deliveries: {
    total: number;
    sent: number;
    failed: number;
    skipped: number;
    other: number;
    failureRate: number;
  };
  // Answer-quality rates: how often the assistant resolved a request itself
  // (containment) versus refused or escalated to a human.
  quality: {
    answered: number;
    refused: number;
    handoff: number;
    total: number;
    containmentRate: number;
    refusalRate: number;
    handoffRate: number;
  };
  // Per-channel message volume so a tenant can see which channels are active.
  byChannel: Array<{
    channel: string;
    inbound: number;
    outbound: number;
    total: number;
  }>;
  // Telephone voice metrics.
  voice: {
    calls: number;
    completed: number;
    avgDurationSeconds: number | null;
    lastCallAt: Date | null;
  };
  // Activity within a recent rolling window (default 30 days) so dashboards can
  // show "recent" alongside all-time.
  window: {
    days: number;
    conversations: number;
    messages: number;
    handoffs: number;
  };
};

/**
 * Cross-tenant, NON-PERSONAL aggregate for the platform operator console. Counts
 * and health signals only — never message content or contact identities — so
 * the platform admin can spot faults and load without seeing tenant PII (the R4
 * privacy boundary).
 */
export type PlatformOverviewResult = {
  tenants: { total: number; active: number };
  totals: {
    conversations: number;
    messages: number;
    contacts: number;
    calls: number;
  };
  deliveries: { total: number; failed: number; failureRate: number };
  openHandoffs: number;
};

export type WhatsappComplianceResult = {
  lastInboundAt: Date | null;
  windowClosesAt: Date | null;
  canUseFreeformReply: boolean;
  templates: {
    total: number;
    approved: number;
    draft: number;
    needsAttention: number;
  };
  recentDeliveries: Array<
    Pick<
      MessageDeliveryRecord,
      "id" | "providerMessageId" | "status" | "detail" | "createdAt"
    >
  >;
};

export type TenantExportData = {
  tenant: TenantSummary | null;
  knowledge: KnowledgeListItem[];
  conversations: ConversationRecord[];
  messages: MessageRecord[];
  handoffRequests: HandoffRecord[];
  contacts: ContactRecord[];
  messageDeliveries: MessageDeliveryRecord[];
  whatsappTemplates: WhatsappTemplateRecord[];
  brainOnboardingAnswers: BrainOnboardingAnswerRecord[];
  knowledgeSuggestions: KnowledgeSuggestionRecord[];
  documentIngestionJobs: DocumentIngestionJobRecord[];
  calls: (typeof calls.$inferSelect)[];
  callTranscripts: (typeof callTranscripts.$inferSelect)[];
  channelWebhookEvents: ChannelWebhookEventRecord[];
  usageEvents: (typeof usageEvents.$inferSelect)[];
  auditLogs: (typeof auditLogs.$inferSelect)[];
};

export type TenantBrainSummary = {
  approvedKnowledge: number;
  pendingSuggestions: number;
  onboardingAnswers: number;
  approvedOnboardingAnswers: number;
  ingestionJobs: number;
  failedIngestionJobs: number;
};

export type ChannelConnectionInput = {
  channel: Channel;
  provider: string;
  externalAccountId?: string | null | undefined;
  status?: "pending" | "connected" | "disabled" | undefined;
  settings?: Record<string, unknown> | undefined;
};

export type ChannelConnectionCredentialInput = {
  channel: Channel;
  provider: string;
  accessToken?: string | null | undefined;
  refreshToken?: string | null | undefined;
};

export type ChannelConnectionCredentials = {
  accessToken: string | null;
  refreshToken: string | null;
};

export type TelephoneNumberInventoryInput = {
  provider?:
    "easybell" | "sipgate" | "peoplefone" | "custom_sip" | "twilio" | undefined;
  phoneNumber?: string | undefined;
  country?: string | undefined;
  locality?: string | null | undefined;
  numberType?: "local" | "mobile" | "toll-free" | undefined;
  sipTarget?: string | null | undefined;
  assistantId?: string | null | undefined;
  status?:
    "available" | "reserved" | "assigned" | "suspended" | "retired" | undefined;
  assignedTenantId?: string | null | undefined;
  metadata?: Record<string, unknown> | undefined;
};

export type TelephoneNumberInventoryRecord =
  typeof telephoneNumberInventory.$inferSelect;

export type TelephoneNumberReservationRecord =
  typeof telephoneNumberReservations.$inferSelect;

export type BillingAccountRecord = typeof billingAccounts.$inferSelect;

export type BillingSubscriptionRecord =
  typeof billingSubscriptions.$inferSelect;

export type BillableUsageEventRecord = typeof billableUsageEvents.$inferSelect;

export type OnboardingState = {
  tenant: TenantSummary | null;
  billingAccount: BillingAccountRecord | null;
  billingSubscription: BillingSubscriptionRecord | null;
  activeReservation:
    | (TelephoneNumberReservationRecord & {
        number: TelephoneNumberInventoryRecord | null;
      })
    | null;
  assignedNumber: TelephoneNumberInventoryRecord | null;
};

export type ContactProfileInput = {
  displayName?: string | null | undefined;
  email?: string | null | undefined;
  phone?: string | null | undefined;
  company?: string | null | undefined;
  identifiers?:
    Record<string, string[] | string | null | undefined> | undefined;
  metadata?: Record<string, unknown> | undefined;
};

export type WhatsappTemplateInput = {
  name: string;
  language?: string | undefined;
  category?: "marketing" | "utility" | "authentication" | undefined;
  status?:
    "draft" | "submitted" | "approved" | "rejected" | "paused" | undefined;
  body: string;
  variables?: string[] | undefined;
  providerTemplateId?: string | null | undefined;
  metadata?: Record<string, unknown> | undefined;
};

export class TenantRepository implements AnswerDataStore, HandoffStore {
  /**
   * The active executor: the root connection pool, or a transaction handle when
   * this instance was created via {@link withTransaction}. All query methods go
   * through `this.db`, so binding it to a tx makes the whole flow atomic.
   */
  private readonly db: DbExecutor;
  /** The root db, used to open transactions. Same object as `db` at the root. */
  private readonly rootDb: Database;
  /** Tenant id already set on the current transaction via app.current_tenant_id. */
  private readonly tenantScope: string | undefined;

  constructor(
    db: Database,
    executor: DbExecutor = db,
    tenantScope?: string,
    private readonly credentialCipher?: ChannelCredentialCipher | null,
  ) {
    this.rootDb = db;
    this.db = executor;
    this.tenantScope = tenantScope;
  }

  /**
   * Run `fn` against a repository bound to a single transaction so a partial
   * failure rolls back all writes. Nested calls reuse the current tx. Always
   * opens the tx from the root connection, never from an existing tx handle.
   */
  private async withTransaction<T>(
    fn: (repo: TenantRepository) => Promise<T>,
  ): Promise<T> {
    if (this.db !== this.rootDb) {
      // Already inside a transaction; reuse it.
      return fn(this);
    }
    return this.rootDb.transaction((tx: Transaction) =>
      fn(
        new TenantRepository(
          this.rootDb,
          tx,
          this.tenantScope,
          this.credentialCipher,
        ),
      ),
    );
  }

  private async withTenantScope<T>(
    tenantId: string,
    fn: (repo: TenantRepository) => Promise<T>,
  ): Promise<T> {
    assertTenantId(tenantId);
    if (this.tenantScope === tenantId) {
      return fn(this);
    }
    if (this.db !== this.rootDb) {
      await setTenantSession(this.db, tenantId);
      return fn(
        new TenantRepository(
          this.rootDb,
          this.db,
          tenantId,
          this.credentialCipher,
        ),
      );
    }
    return this.rootDb.transaction(async (tx: Transaction) => {
      await setTenantSession(tx, tenantId);
      return fn(
        new TenantRepository(this.rootDb, tx, tenantId, this.credentialCipher),
      );
    });
  }

  private needsTenantScope(tenantId: string) {
    assertTenantId(tenantId);
    return this.tenantScope !== tenantId;
  }

  async createTenant(input: CreateTenantInput) {
    return this.withTransaction(async (repo) => {
      const [tenant] = await repo.db
        .insert(tenants)
        .values({
          name: input.name,
          slug: input.slug,
          publicId: createPublicAssistantId(),
          status: input.status ?? "active",
          defaultLocale: input.defaultLocale ?? "en",
          theme: input.theme ?? {
            primaryColor: "#155eef",
            openingMessage: "Hi, how can I help?",
          },
        })
        .returning();

      if (!tenant) {
        throw new Error("Failed to create tenant.");
      }

      await repo.withTenantScope(tenant.id, async (scopedRepo) => {
        await scopedRepo.createDefaultEscalationRule(tenant.id);
        await scopedRepo.audit(
          tenant.id,
          "tenant.created",
          "tenant",
          tenant.id,
          {
            name: tenant.name,
            slug: tenant.slug,
          },
        );
      });

      return tenant;
    });
  }

  async listTenants() {
    return this.db.select().from(tenants).orderBy(desc(tenants.createdAt));
  }

  async getTenant(tenantId: string) {
    assertTenantId(tenantId);
    const [tenant] = await this.db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    return tenant ?? null;
  }

  async getTenantBySlug(slug: string) {
    const [tenant] = await this.db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, slug))
      .limit(1);
    return tenant ?? null;
  }

  async getTenantByPublicId(publicId: string) {
    const [tenant] = await this.db
      .select()
      .from(tenants)
      .where(and(eq(tenants.publicId, publicId), eq(tenants.status, "active")))
      .limit(1);
    return tenant ?? null;
  }

  async updateTenant(tenantId: string, input: UpdateTenantInput) {
    assertTenantId(tenantId);
    const existing = await this.getTenant(tenantId);
    if (!existing) {
      throw new Error("Tenant not found.");
    }

    const values: {
      name?: string;
      slug?: string;
      defaultLocale?: string;
      tone?: "friendly" | "neutral" | "formal";
      confidenceThreshold?: string;
      maxMessageLength?: number;
      retentionDays?: number;
      theme?: WidgetTheme;
      updatedAt: SQL;
    } = {
      updatedAt: sql`now()`,
    };

    if (input.name) {
      values.name = input.name;
    }
    if (input.slug) {
      values.slug = input.slug;
    }
    if (input.defaultLocale) {
      values.defaultLocale = input.defaultLocale;
    }
    if (input.tone) {
      values.tone = input.tone;
    }
    if (typeof input.confidenceThreshold === "number") {
      values.confidenceThreshold = String(input.confidenceThreshold);
    }
    if (typeof input.maxMessageLength === "number") {
      values.maxMessageLength = input.maxMessageLength;
    }
    if (typeof input.retentionDays === "number") {
      values.retentionDays = input.retentionDays;
    }
    if (input.theme) {
      values.theme = {
        ...(existing.theme ?? {}),
        ...input.theme,
      };
    }

    const [tenant] = await this.db
      .update(tenants)
      .set(values)
      .where(eq(tenants.id, tenantId))
      .returning();

    if (!tenant) {
      throw new Error("Tenant not found.");
    }

    await this.audit(tenantId, "tenant.updated", "tenant", tenantId, {
      fields: Object.keys(input),
    });

    return tenant;
  }

  async createSelfServiceTenant(input: {
    name: string;
    slug: string;
    owner: {
      email: string;
      name: string;
      authUserId?: string | null | undefined;
    };
    defaultLocale?: string | undefined;
    theme?: WidgetTheme | undefined;
  }) {
    return this.withTransaction(async (repo) => {
      const tenant = await repo.createTenant({
        name: input.name,
        slug: input.slug,
        status: "setup_pending",
        ...(input.defaultLocale ? { defaultLocale: input.defaultLocale } : {}),
        ...(input.theme ? { theme: input.theme } : {}),
      });
      await repo.upsertTenantUser(tenant.id, {
        email: input.owner.email,
        name: input.owner.name,
        role: "tenant_owner",
        authUserId: input.owner.authUserId ?? null,
      });
      await repo.audit(
        tenant.id,
        "self_service_project.created",
        "tenant",
        tenant.id,
        { ownerEmail: input.owner.email },
      );
      return tenant;
    });
  }

  async expireTelephoneNumberReservations(now = new Date()): Promise<number> {
    const expired = await this.db
      .update(telephoneNumberReservations)
      .set({
        status: "expired",
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(telephoneNumberReservations.status, "active"),
          lt(telephoneNumberReservations.expiresAt, now),
        ),
      )
      .returning({ numberId: telephoneNumberReservations.numberId });

    if (expired.length > 0) {
      await this.db
        .update(telephoneNumberInventory)
        .set({
          status: "available",
          assignedTenantId: null,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            inArray(
              telephoneNumberInventory.id,
              expired.map((item) => item.numberId),
            ),
            eq(telephoneNumberInventory.status, "reserved"),
          ),
        );
    }

    return expired.length;
  }

  async listAvailableTelephoneNumbers(
    options: {
      country?: string | undefined;
      locality?: string | undefined;
      numberType?: string | undefined;
      limit?: number | undefined;
    } = {},
  ): Promise<TelephoneNumberInventoryRecord[]> {
    await this.expireTelephoneNumberReservations();
    const filters: SQL[] = [eq(telephoneNumberInventory.status, "available")];
    if (options.country) {
      filters.push(eq(telephoneNumberInventory.country, options.country));
    }
    if (options.locality) {
      filters.push(eq(telephoneNumberInventory.locality, options.locality));
    }
    if (options.numberType) {
      filters.push(eq(telephoneNumberInventory.numberType, options.numberType));
    }

    return this.db
      .select()
      .from(telephoneNumberInventory)
      .where(and(...filters))
      .orderBy(telephoneNumberInventory.phoneNumber)
      .limit(Math.min(Math.max(options.limit ?? 25, 1), 100));
  }

  async listTelephoneNumberInventory(): Promise<
    TelephoneNumberInventoryRecord[]
  > {
    await this.expireTelephoneNumberReservations();
    return this.db
      .select()
      .from(telephoneNumberInventory)
      .orderBy(telephoneNumberInventory.phoneNumber);
  }

  async createTelephoneNumberInventory(
    input: TelephoneNumberInventoryInput,
  ): Promise<TelephoneNumberInventoryRecord> {
    const values = telephoneNumberValues(input);
    if (!values.phoneNumber) {
      throw new Error("phoneNumber is required.");
    }
    const [number] = await this.db
      .insert(telephoneNumberInventory)
      .values({
        phoneNumber: values.phoneNumber,
        provider: values.provider ?? "easybell",
        country: values.country ?? "DE",
        locality: values.locality ?? null,
        numberType: values.numberType ?? "local",
        sipTarget: values.sipTarget ?? null,
        assistantId: values.assistantId ?? null,
        status: values.status ?? "available",
        assignedTenantId: values.assignedTenantId ?? null,
        metadata: values.metadata ?? {},
      })
      .returning();
    if (!number) {
      throw new Error("Failed to create telephone number.");
    }
    return number;
  }

  async updateTelephoneNumberInventory(
    numberId: string,
    input: Partial<TelephoneNumberInventoryInput>,
  ): Promise<TelephoneNumberInventoryRecord> {
    const [number] = await this.db
      .update(telephoneNumberInventory)
      .set({
        ...telephoneNumberValues(input),
        updatedAt: sql`now()`,
      })
      .where(eq(telephoneNumberInventory.id, numberId))
      .returning();
    if (!number) {
      throw new Error("Telephone number not found.");
    }
    return number;
  }

  async createTelephoneNumberReservation(
    tenantId: string,
    input: {
      numberId: string;
      userId?: string | null | undefined;
      expiresAt?: Date | undefined;
    },
  ): Promise<
    TelephoneNumberReservationRecord & {
      number: TelephoneNumberInventoryRecord;
    }
  > {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope(tenantId, (repo) =>
        repo.createTelephoneNumberReservation(tenantId, input),
      );
    }

    return this.withTransaction(async (repo) => {
      await repo.expireTelephoneNumberReservations();

      const released = await repo.db
        .update(telephoneNumberReservations)
        .set({ status: "released", updatedAt: sql`now()` })
        .where(
          and(
            eq(telephoneNumberReservations.tenantId, tenantId),
            eq(telephoneNumberReservations.status, "active"),
          ),
        )
        .returning({ numberId: telephoneNumberReservations.numberId });

      if (released.length > 0) {
        await repo.db
          .update(telephoneNumberInventory)
          .set({ status: "available", updatedAt: sql`now()` })
          .where(
            and(
              inArray(
                telephoneNumberInventory.id,
                released.map((item) => item.numberId),
              ),
              eq(telephoneNumberInventory.status, "reserved"),
            ),
          );
      }

      const [number] = await repo.db
        .update(telephoneNumberInventory)
        .set({
          status: "reserved",
          assignedTenantId: tenantId,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(telephoneNumberInventory.id, input.numberId),
            eq(telephoneNumberInventory.status, "available"),
          ),
        )
        .returning();

      if (!number) {
        throw new Error("Telephone number is not available.");
      }

      const [reservation] = await repo.db
        .insert(telephoneNumberReservations)
        .values({
          tenantId,
          userId: input.userId ?? null,
          numberId: number.id,
          expiresAt: input.expiresAt ?? new Date(Date.now() + 30 * 60 * 1000),
        })
        .returning();

      if (!reservation) {
        throw new Error("Failed to reserve telephone number.");
      }

      await repo.audit(
        tenantId,
        "telephone_number.reserved",
        "telephone_number",
        number.id,
        { phoneNumber: number.phoneNumber },
      );

      return { ...reservation, number };
    });
  }

  async getActiveTelephoneNumberReservation(tenantId: string): Promise<
    | (TelephoneNumberReservationRecord & {
        number: TelephoneNumberInventoryRecord | null;
      })
    | null
  > {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope(tenantId, (repo) =>
        repo.getActiveTelephoneNumberReservation(tenantId),
      );
    }

    await this.expireTelephoneNumberReservations();
    const [row] = await this.db
      .select({
        reservation: telephoneNumberReservations,
        number: telephoneNumberInventory,
      })
      .from(telephoneNumberReservations)
      .leftJoin(
        telephoneNumberInventory,
        eq(telephoneNumberInventory.id, telephoneNumberReservations.numberId),
      )
      .where(
        and(
          eq(telephoneNumberReservations.tenantId, tenantId),
          eq(telephoneNumberReservations.status, "active"),
        ),
      )
      .limit(1);
    return row ? { ...row.reservation, number: row.number } : null;
  }

  async getAssignedTelephoneNumber(
    tenantId: string,
  ): Promise<TelephoneNumberInventoryRecord | null> {
    assertTenantId(tenantId);
    const [number] = await this.db
      .select()
      .from(telephoneNumberInventory)
      .where(eq(telephoneNumberInventory.assignedTenantId, tenantId))
      .limit(1);
    return number ?? null;
  }

  async getBillingAccount(
    tenantId: string,
  ): Promise<BillingAccountRecord | null> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope(tenantId, (repo) =>
        repo.getBillingAccount(tenantId),
      );
    }
    const [account] = await this.db
      .select()
      .from(billingAccounts)
      .where(eq(billingAccounts.tenantId, tenantId))
      .limit(1);
    return account ?? null;
  }

  async getOrCreateBillingAccount(
    tenantId: string,
    input: {
      stripeCustomerId?: string | null | undefined;
      status?: string | undefined;
      defaultCurrency?: string | undefined;
      metadata?: Record<string, unknown> | undefined;
    } = {},
  ): Promise<BillingAccountRecord> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope(tenantId, (repo) =>
        repo.getOrCreateBillingAccount(tenantId, input),
      );
    }

    const existing = await this.getBillingAccount(tenantId);
    const values = {
      tenantId,
      stripeCustomerId:
        input.stripeCustomerId ?? existing?.stripeCustomerId ?? null,
      status: input.status ?? existing?.status ?? "incomplete",
      defaultCurrency:
        input.defaultCurrency ?? existing?.defaultCurrency ?? "eur",
      metadata: {
        ...(existing?.metadata ?? {}),
        ...(input.metadata ?? {}),
      },
    };

    const [account] = await this.db
      .insert(billingAccounts)
      .values(values)
      .onConflictDoUpdate({
        target: billingAccounts.tenantId,
        set: {
          stripeCustomerId: values.stripeCustomerId,
          status: values.status,
          defaultCurrency: values.defaultCurrency,
          metadata: values.metadata,
          updatedAt: sql`now()`,
        },
      })
      .returning();

    if (!account) {
      throw new Error("Failed to save billing account.");
    }
    return account;
  }

  async getBillingSubscription(
    tenantId: string,
  ): Promise<BillingSubscriptionRecord | null> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope(tenantId, (repo) =>
        repo.getBillingSubscription(tenantId),
      );
    }
    const [subscription] = await this.db
      .select()
      .from(billingSubscriptions)
      .where(eq(billingSubscriptions.tenantId, tenantId))
      .orderBy(desc(billingSubscriptions.updatedAt))
      .limit(1);
    return subscription ?? null;
  }

  async upsertBillingSubscription(
    tenantId: string,
    input: {
      billingAccountId: string;
      stripeSubscriptionId?: string | null | undefined;
      stripePriceId?: string | null | undefined;
      status: string;
      currentPeriodStart?: Date | null | undefined;
      currentPeriodEnd?: Date | null | undefined;
      metadata?: Record<string, unknown> | undefined;
    },
  ): Promise<BillingSubscriptionRecord> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope(tenantId, (repo) =>
        repo.upsertBillingSubscription(tenantId, input),
      );
    }

    const existing = input.stripeSubscriptionId
      ? await this.db
          .select()
          .from(billingSubscriptions)
          .where(
            eq(
              billingSubscriptions.stripeSubscriptionId,
              input.stripeSubscriptionId,
            ),
          )
          .limit(1)
      : [];

    const [subscription] = existing[0]
      ? await this.db
          .update(billingSubscriptions)
          .set({
            stripePriceId: input.stripePriceId ?? null,
            status: input.status,
            currentPeriodStart: input.currentPeriodStart ?? null,
            currentPeriodEnd: input.currentPeriodEnd ?? null,
            metadata: input.metadata ?? {},
            updatedAt: sql`now()`,
          })
          .where(eq(billingSubscriptions.id, existing[0].id))
          .returning()
      : await this.db
          .insert(billingSubscriptions)
          .values({
            tenantId,
            billingAccountId: input.billingAccountId,
            stripeSubscriptionId: input.stripeSubscriptionId ?? null,
            stripePriceId: input.stripePriceId ?? null,
            status: input.status,
            currentPeriodStart: input.currentPeriodStart ?? null,
            currentPeriodEnd: input.currentPeriodEnd ?? null,
            metadata: input.metadata ?? {},
          })
          .returning();

    if (!subscription) {
      throw new Error("Failed to save billing subscription.");
    }
    return subscription;
  }

  async recordStripeWebhookEvent(input: {
    stripeEventId: string;
    eventType: string;
    tenantId?: string | null | undefined;
    payload: Record<string, unknown>;
  }): Promise<{
    event: typeof stripeWebhookEvents.$inferSelect;
    duplicate: boolean;
  }> {
    const [inserted] = await this.db
      .insert(stripeWebhookEvents)
      .values({
        stripeEventId: input.stripeEventId,
        eventType: input.eventType,
        tenantId: input.tenantId ?? null,
        payload: input.payload,
      })
      .onConflictDoNothing({ target: stripeWebhookEvents.stripeEventId })
      .returning();

    if (inserted) {
      return { event: inserted, duplicate: false };
    }

    const [existing] = await this.db
      .select()
      .from(stripeWebhookEvents)
      .where(eq(stripeWebhookEvents.stripeEventId, input.stripeEventId))
      .limit(1);
    if (!existing) {
      throw new Error("Failed to record Stripe webhook event.");
    }
    return { event: existing, duplicate: true };
  }

  async markStripeWebhookEventProcessed(eventId: string) {
    await this.db
      .update(stripeWebhookEvents)
      .set({ status: "processed", processedAt: sql`now()` })
      .where(eq(stripeWebhookEvents.id, eventId));
  }

  async markStripeWebhookEventFailed(eventId: string, error: string) {
    await this.db
      .update(stripeWebhookEvents)
      .set({ status: "failed", error, processedAt: sql`now()` })
      .where(eq(stripeWebhookEvents.id, eventId));
  }

  async activateReservedTelephoneNumber(input: {
    tenantId: string;
    reservationId: string;
    stripeCustomerId: string;
    stripeSubscriptionId?: string | null | undefined;
    stripePriceId?: string | null | undefined;
    subscriptionStatus: string;
    currentPeriodStart?: Date | null | undefined;
    currentPeriodEnd?: Date | null | undefined;
    metadata?: Record<string, unknown> | undefined;
  }): Promise<OnboardingState> {
    assertTenantId(input.tenantId);
    if (this.needsTenantScope(input.tenantId)) {
      return this.withTenantScope(input.tenantId, (repo) =>
        repo.activateReservedTelephoneNumber(input),
      );
    }

    return this.withTransaction(async (repo) => {
      const [row] = await repo.db
        .select({
          reservation: telephoneNumberReservations,
          number: telephoneNumberInventory,
        })
        .from(telephoneNumberReservations)
        .innerJoin(
          telephoneNumberInventory,
          eq(telephoneNumberInventory.id, telephoneNumberReservations.numberId),
        )
        .where(
          and(
            eq(telephoneNumberReservations.id, input.reservationId),
            eq(telephoneNumberReservations.tenantId, input.tenantId),
            eq(telephoneNumberReservations.status, "active"),
          ),
        )
        .limit(1);

      if (!row) {
        throw new Error("Active telephone number reservation not found.");
      }

      const billingStatus = billingStatusFromStripe(input.subscriptionStatus);
      const billingAccount = await repo.getOrCreateBillingAccount(
        input.tenantId,
        {
          stripeCustomerId: input.stripeCustomerId,
          status: billingStatus,
          metadata: input.metadata,
        },
      );
      await repo.upsertBillingSubscription(input.tenantId, {
        billingAccountId: billingAccount.id,
        stripeSubscriptionId: input.stripeSubscriptionId ?? null,
        stripePriceId: input.stripePriceId ?? null,
        status: input.subscriptionStatus,
        currentPeriodStart: input.currentPeriodStart ?? null,
        currentPeriodEnd: input.currentPeriodEnd ?? null,
        metadata: input.metadata,
      });

      await repo.db
        .update(telephoneNumberReservations)
        .set({
          status: "completed",
          completedAt: sql`now()`,
          updatedAt: sql`now()`,
        })
        .where(eq(telephoneNumberReservations.id, row.reservation.id));

      await repo.db
        .update(telephoneNumberInventory)
        .set({
          status: "assigned",
          assignedTenantId: input.tenantId,
          updatedAt: sql`now()`,
        })
        .where(eq(telephoneNumberInventory.id, row.number.id));

      const launchReady =
        row.number.metadata &&
        typeof row.number.metadata === "object" &&
        (row.number.metadata as Record<string, unknown>).launchReady === true;
      await repo.upsertChannelConnection(input.tenantId, {
        channel: "telephone",
        provider: row.number.provider,
        externalAccountId: row.number.phoneNumber,
        status: launchReady ? "connected" : "pending",
        settings: {
          mode: "self_service_number_pool",
          setupType: "managed_number",
          provider: row.number.provider,
          phoneNumber: row.number.phoneNumber,
          numberInventoryId: row.number.id,
          sipTarget: row.number.sipTarget,
          assistantId: row.number.assistantId,
          billingStatus,
          setupChecklist: {
            numberOrdered: true,
            sipConfigured: launchReady,
            testCallCompleted: false,
          },
          updatedAt: new Date().toISOString(),
        },
      });

      await repo.db
        .update(tenants)
        .set({ status: "active", updatedAt: sql`now()` })
        .where(eq(tenants.id, input.tenantId));

      await repo.audit(
        input.tenantId,
        "billing.activated",
        "tenant",
        input.tenantId,
        {
          phoneNumber: row.number.phoneNumber,
          stripeSubscriptionId: input.stripeSubscriptionId ?? null,
        },
      );

      return repo.getOnboardingState(input.tenantId);
    });
  }

  async getOnboardingState(tenantId: string): Promise<OnboardingState> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope(tenantId, (repo) =>
        repo.getOnboardingState(tenantId),
      );
    }
    const [
      tenant,
      billingAccount,
      billingSubscription,
      activeReservation,
      assignedNumber,
    ] = await Promise.all([
      this.getTenant(tenantId),
      this.getBillingAccount(tenantId),
      this.getBillingSubscription(tenantId),
      this.getActiveTelephoneNumberReservation(tenantId),
      this.getAssignedTelephoneNumber(tenantId),
    ]);
    return {
      tenant,
      billingAccount,
      billingSubscription,
      activeReservation,
      assignedNumber,
    };
  }

  async getPlatformBillingOverview() {
    const [accounts, subscriptionsRows, numbers, usageByStatus] =
      await Promise.all([
        this.db.select().from(billingAccounts),
        this.db.select().from(billingSubscriptions),
        this.listTelephoneNumberInventory(),
        this.db
          .select({
            status: billableUsageEvents.status,
            total: sql<number>`count(*)::int`,
          })
          .from(billableUsageEvents)
          .groupBy(billableUsageEvents.status),
      ]);

    return {
      billingAccounts: accounts,
      subscriptions: subscriptionsRows,
      numbers,
      billableUsageByStatus: usageByStatus,
    };
  }

  async listChannelConnections(
    tenantId: string,
  ): Promise<ChannelConnectionRecord[]> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope<ChannelConnectionRecord[]>(tenantId, (repo) =>
        repo.listChannelConnections(tenantId),
      );
    }
    return this.db
      .select()
      .from(channelConnections)
      .where(eq(channelConnections.tenantId, tenantId))
      .orderBy(channelConnections.channel);
  }

  async upsertChannelConnection(
    tenantId: string,
    input: ChannelConnectionInput,
  ): Promise<ChannelConnectionRecord> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope<ChannelConnectionRecord>(tenantId, (repo) =>
        repo.upsertChannelConnection(tenantId, input),
      );
    }
    const values = {
      tenantId,
      channel: input.channel,
      provider: input.provider,
      externalAccountId: input.externalAccountId?.trim() || null,
      status: input.status ?? "pending",
      settings: rejectSecretSettings(input.settings ?? {}),
      updatedAt: sql`now()`,
    };

    let connection: ChannelConnectionRecord | undefined;
    try {
      [connection] = await this.db
        .insert(channelConnections)
        .values(values)
        .onConflictDoUpdate({
          target: [
            channelConnections.tenantId,
            channelConnections.channel,
            channelConnections.provider,
          ],
          set: {
            externalAccountId: values.externalAccountId,
            status: values.status,
            settings: values.settings,
            updatedAt: sql`now()`,
          },
        })
        .returning();
    } catch (error) {
      // The account id is already owned by another tenant (global unique index):
      // surface a clean conflict rather than an opaque 500.
      if (isUniqueViolation(error, "channel_connections_account_owner_idx")) {
        throw new ChannelAccountConflictError();
      }
      throw error;
    }

    if (!connection) {
      throw new Error("Failed to save channel connection.");
    }

    await this.audit(
      tenantId,
      "channel_connection.updated",
      "channel_connection",
      connection.id,
      {
        channel: connection.channel,
        provider: connection.provider,
        status: connection.status,
      },
    );

    return connection;
  }

  async saveChannelConnectionCredentials(
    tenantId: string,
    input: ChannelConnectionCredentialInput,
  ): Promise<ChannelConnectionRecord> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope<ChannelConnectionRecord>(tenantId, (repo) =>
        repo.saveChannelConnectionCredentials(tenantId, input),
      );
    }

    const values: Partial<typeof channelConnections.$inferInsert> = {
      updatedAt: sql`now()` as unknown as Date,
    };
    if (input.accessToken !== undefined) {
      values.encryptedAccessToken =
        input.accessToken === null
          ? null
          : this.encryptChannelCredential(tenantId, input, "access_token");
    }
    if (input.refreshToken !== undefined) {
      values.encryptedRefreshToken =
        input.refreshToken === null
          ? null
          : this.encryptChannelCredential(tenantId, input, "refresh_token");
    }

    const [connection] = await this.db
      .update(channelConnections)
      .set(values)
      .where(
        and(
          eq(channelConnections.tenantId, tenantId),
          eq(channelConnections.channel, input.channel),
          eq(channelConnections.provider, input.provider),
        ),
      )
      .returning();

    if (!connection) {
      throw new Error("Channel connection not found.");
    }

    await this.audit(
      tenantId,
      "channel_connection.credentials_updated",
      "channel_connection",
      connection.id,
      {
        channel: connection.channel,
        provider: connection.provider,
        accessTokenUpdated: input.accessToken !== undefined,
        refreshTokenUpdated: input.refreshToken !== undefined,
      },
    );

    return connection;
  }

  async getChannelConnectionCredentials(
    tenantId: string,
    input: Pick<ChannelConnectionCredentialInput, "channel" | "provider">,
  ): Promise<ChannelConnectionCredentials | null> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope<ChannelConnectionCredentials | null>(
        tenantId,
        (repo) => repo.getChannelConnectionCredentials(tenantId, input),
      );
    }

    const [connection] = await this.db
      .select()
      .from(channelConnections)
      .where(
        and(
          eq(channelConnections.tenantId, tenantId),
          eq(channelConnections.channel, input.channel),
          eq(channelConnections.provider, input.provider),
        ),
      )
      .limit(1);

    if (!connection) {
      return null;
    }

    return {
      accessToken: connection.encryptedAccessToken
        ? this.decryptChannelCredential(
            tenantId,
            input,
            "access_token",
            connection.encryptedAccessToken,
          )
        : null,
      refreshToken: connection.encryptedRefreshToken
        ? this.decryptChannelCredential(
            tenantId,
            input,
            "refresh_token",
            connection.encryptedRefreshToken,
          )
        : null,
    };
  }

  async getTenantByChannelConnection(
    channel: Channel,
    provider: string,
    externalAccountId: string,
  ) {
    const [row] = await this.db
      .select({ tenant: tenants })
      .from(channelConnections)
      .innerJoin(tenants, eq(tenants.id, channelConnections.tenantId))
      .where(
        and(
          eq(channelConnections.channel, channel),
          eq(channelConnections.provider, provider),
          eq(channelConnections.externalAccountId, externalAccountId),
          eq(channelConnections.status, "connected"),
          eq(tenants.status, "active"),
        ),
      )
      .limit(1);

    return row?.tenant ?? null;
  }

  async recordChannelWebhookEvent(input: {
    tenantId?: string | null;
    channel: Channel;
    providerEventId?: string | null;
    eventType: string;
    payload: Record<string, unknown>;
    status?: string;
  }): Promise<RecordChannelWebhookEventResult> {
    if (input.tenantId) {
      assertTenantId(input.tenantId);
    }
    const values = {
      tenantId: input.tenantId ?? null,
      channel: input.channel,
      providerEventId: input.providerEventId ?? null,
      eventType: input.eventType,
      payload: input.payload,
      status: input.status ?? "received",
    };

    const [event] = await this.db
      .insert(channelWebhookEvents)
      .values(values)
      .onConflictDoNothing({
        target: [
          channelWebhookEvents.tenantId,
          channelWebhookEvents.channel,
          channelWebhookEvents.providerEventId,
        ],
      })
      .returning();

    if (event) {
      return { event, duplicate: false };
    }

    if (!input.providerEventId) {
      throw new Error("Failed to record channel webhook event.");
    }

    const [existing] = await this.db
      .select()
      .from(channelWebhookEvents)
      .where(
        and(
          input.tenantId
            ? eq(channelWebhookEvents.tenantId, input.tenantId)
            : isNull(channelWebhookEvents.tenantId),
          eq(channelWebhookEvents.channel, input.channel),
          eq(channelWebhookEvents.providerEventId, input.providerEventId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new Error("Failed to load duplicate channel webhook event.");
    }

    return { event: existing, duplicate: true };
  }

  async markChannelWebhookEventProcessed(
    eventId: string,
    status = "processed",
  ): Promise<void> {
    await this.db
      .update(channelWebhookEvents)
      .set({
        status,
        error: null,
        processedAt: sql`now()`,
      })
      .where(eq(channelWebhookEvents.id, eventId));
  }

  async markChannelWebhookEventFailed(
    eventId: string,
    error: string,
  ): Promise<void> {
    await this.db
      .update(channelWebhookEvents)
      .set({
        status: "failed",
        error,
        processedAt: sql`now()`,
      })
      .where(eq(channelWebhookEvents.id, eventId));
  }

  async getWidgetConfig(publicId: string) {
    const tenant = await this.getTenantByPublicId(publicId);
    if (!tenant) {
      return null;
    }

    return {
      assistantId: tenant.publicId,
      tenantName: tenant.name,
      defaultLocale: tenant.defaultLocale,
      theme: tenant.theme,
      limits: {
        maxMessageLength: tenant.maxMessageLength,
      },
    };
  }

  async findUserByEmailForAuth(email: string): Promise<AuthUserRecord | null> {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      return null;
    }
    const [user] = await this.db
      .select({
        id: users.id,
        authUserId: users.authUserId,
        email: users.email,
        name: users.name,
        status: users.status,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);
    return user ?? null;
  }

  async findUserByAuthUserIdForAuth(
    authUserId: string,
  ): Promise<AuthUserRecord | null> {
    const [user] = await this.db
      .select({
        id: users.id,
        authUserId: users.authUserId,
        email: users.email,
        name: users.name,
        status: users.status,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(eq(users.authUserId, authUserId))
      .limit(1);
    return user ?? null;
  }

  async createPasswordUser(
    input: CreatePasswordUserInput,
  ): Promise<AuthUserRecord> {
    const email = normalizeEmail(input.email);
    if (!email) {
      throw new Error("Valid email is required.");
    }
    const existing = await this.findUserByEmailForAuth(email);
    if (existing) {
      throw new Error("Account already exists.");
    }

    const [user] = await this.db
      .insert(users)
      .values({
        email,
        name: input.name.trim() || email,
        passwordHash: input.passwordHash,
        emailVerifiedAt: sql`now()`,
      })
      .returning({
        id: users.id,
        authUserId: users.authUserId,
        email: users.email,
        name: users.name,
        status: users.status,
        passwordHash: users.passwordHash,
      });

    if (!user) {
      throw new Error("Failed to create user.");
    }

    return user;
  }

  async createUserSession(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    userAgent?: string | null | undefined;
    ipAddress?: string | null | undefined;
  }) {
    const [session] = await this.db
      .insert(userSessions)
      .values({
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        userAgent: input.userAgent ?? null,
        ipAddress: input.ipAddress ?? null,
      })
      .returning();

    if (!session) {
      throw new Error("Failed to create user session.");
    }

    return session;
  }

  async getAuthSession(tokenHash: string): Promise<AuthSessionRecord | null> {
    const [row] = await this.db
      .select({
        sessionId: userSessions.id,
        expiresAt: userSessions.expiresAt,
        userId: users.id,
        email: users.email,
        name: users.name,
        status: users.status,
      })
      .from(userSessions)
      .innerJoin(users, eq(users.id, userSessions.userId))
      .where(eq(userSessions.tokenHash, tokenHash))
      .limit(1);

    if (!row || row.status !== "active") {
      return null;
    }

    if (row.expiresAt.getTime() <= Date.now()) {
      await this.deleteUserSession(tokenHash);
      return null;
    }

    await this.db
      .update(userSessions)
      .set({ lastSeenAt: sql`now()` })
      .where(eq(userSessions.tokenHash, tokenHash));

    return {
      sessionId: row.sessionId,
      expiresAt: row.expiresAt,
      user: {
        id: row.userId,
        email: row.email,
        name: row.name,
        status: row.status,
      },
      memberships: await this.listUserMemberships(row.userId),
    };
  }

  async getAuthSessionBySupabaseUser(
    input: SupabaseAuthUserInput,
  ): Promise<AuthSessionRecord | null> {
    const email = normalizeEmail(input.email);
    if (!email) {
      return null;
    }

    const existingByAuth = await this.findUserByAuthUserIdForAuth(
      input.authUserId,
    );
    const existingByEmail = existingByAuth
      ? null
      : await this.findUserByEmailForAuth(email);

    if (
      existingByEmail?.authUserId &&
      existingByEmail.authUserId !== input.authUserId
    ) {
      return null;
    }

    const displayName =
      normalizeOptionalText(input.name) ??
      existingByAuth?.name ??
      existingByEmail?.name ??
      email;

    const [user] = existingByAuth
      ? await this.db
          .update(users)
          .set({
            email,
            name: displayName,
            emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())`,
            updatedAt: sql`now()`,
          })
          .where(eq(users.id, existingByAuth.id))
          .returning()
      : existingByEmail
        ? await this.db
            .update(users)
            .set({
              authUserId: input.authUserId,
              name: displayName,
              emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())`,
              updatedAt: sql`now()`,
            })
            .where(eq(users.id, existingByEmail.id))
            .returning()
        : await this.db
            .insert(users)
            .values({
              authUserId: input.authUserId,
              email,
              name: displayName,
              emailVerifiedAt: sql`now()`,
            })
            .returning();

    if (!user || user.status !== "active") {
      return null;
    }

    return {
      sessionId: `supabase:${input.authUserId}`,
      expiresAt: input.expiresAt,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        status: user.status,
      },
      memberships: await this.listUserMemberships(user.id),
    };
  }

  async deleteUserSession(tokenHash: string) {
    await this.db
      .delete(userSessions)
      .where(eq(userSessions.tokenHash, tokenHash));
  }

  /** Lightweight connectivity probe for health checks. */
  async ping(): Promise<boolean> {
    try {
      await this.db.execute(sql`select 1`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Remove sessions whose expiry has passed so the table does not grow
   * unbounded. Called opportunistically on login and on a background interval.
   * Returns the number of rows removed.
   */
  async deleteExpiredSessions(now = new Date()): Promise<number> {
    const removed = await this.db
      .delete(userSessions)
      .where(lt(userSessions.expiresAt, now))
      .returning({ id: userSessions.id });
    return removed.length;
  }

  async listTenantsForUser(userId: string) {
    const rows = await this.db
      .select({ tenant: tenants })
      .from(memberships)
      .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
      .innerJoin(roles, eq(roles.id, memberships.roleId))
      .where(
        and(
          eq(memberships.userId, userId),
          eq(memberships.status, "active"),
          eq(tenants.status, "active"),
        ),
      )
      .orderBy(desc(tenants.createdAt));

    return rows.map((row) => row.tenant);
  }

  async listUserMemberships(
    userId: string,
  ): Promise<TenantMembershipSummary[]> {
    const rows = await this.db
      .select({
        tenantId: tenants.id,
        tenantName: tenants.name,
        tenantSlug: tenants.slug,
        role: roles.name,
        status: memberships.status,
      })
      .from(memberships)
      .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
      .innerJoin(roles, eq(roles.id, memberships.roleId))
      .where(
        and(
          eq(memberships.userId, userId),
          eq(memberships.status, "active"),
          eq(tenants.status, "active"),
        ),
      )
      .orderBy(desc(tenants.createdAt));

    return rows.map((row) => ({
      ...row,
      role: normalizeRoleName(row.role),
    }));
  }

  async getTenantMembership(
    userId: string,
    tenantId: string,
  ): Promise<TenantMembershipSummary | null> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope<TenantMembershipSummary | null>(
        tenantId,
        (repo) => repo.getTenantMembership(userId, tenantId),
      );
    }
    const [membership] = await this.db
      .select({
        tenantId: memberships.tenantId,
        tenantName: tenants.name,
        tenantSlug: tenants.slug,
        role: roles.name,
        status: memberships.status,
      })
      .from(memberships)
      .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
      .innerJoin(roles, eq(roles.id, memberships.roleId))
      .where(
        and(
          eq(memberships.userId, userId),
          eq(memberships.tenantId, tenantId),
          eq(memberships.status, "active"),
          eq(tenants.status, "active"),
        ),
      )
      .limit(1);

    return membership
      ? {
          ...membership,
          role: normalizeRoleName(membership.role),
        }
      : null;
  }

  async listTenantUsers(
    tenantId: string,
    options?: PaginationOptions,
  ): Promise<TenantUserSummary[]> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope<TenantUserSummary[]>(tenantId, (repo) =>
        repo.listTenantUsers(tenantId, options),
      );
    }
    const { limit, offset } = resolvePagination(options);
    return this.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        status: users.status,
        role: roles.name,
        membershipStatus: memberships.status,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .innerJoin(roles, eq(roles.id, memberships.roleId))
      .where(eq(memberships.tenantId, tenantId))
      .orderBy(users.email)
      .limit(limit)
      .offset(offset);
  }

  async upsertTenantUser(
    tenantId: string,
    input: UpsertTenantUserInput,
  ): Promise<UpsertTenantUserRecord> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope<UpsertTenantUserRecord>(tenantId, (repo) =>
        repo.upsertTenantUser(tenantId, input),
      );
    }
    const email = normalizeEmail(input.email);
    if (!email) {
      throw new Error("Valid email is required.");
    }
    const roleId = await this.getOrCreateRole(input.role);
    const existingByEmail = await this.findUserByEmailForAuth(email);
    const existingByAuth = input.authUserId
      ? await this.findUserByAuthUserIdForAuth(input.authUserId)
      : null;
    if (
      existingByEmail &&
      existingByAuth &&
      existingByEmail.id !== existingByAuth.id
    ) {
      throw new Error("Supabase auth user is already linked to another user.");
    }
    if (
      existingByEmail?.authUserId &&
      input.authUserId &&
      existingByEmail.authUserId !== input.authUserId
    ) {
      throw new Error("User email is already linked to another auth user.");
    }
    const existing = existingByEmail ?? existingByAuth;

    const [user] = existing
      ? await this.db
          .update(users)
          .set({
            name: input.name.trim() || existing.name,
            ...(input.authUserId ? { authUserId: input.authUserId } : {}),
            ...(input.passwordHash
              ? {
                  passwordHash: input.passwordHash,
                  emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())`,
                }
              : {}),
            updatedAt: sql`now()`,
          })
          .where(eq(users.id, existing.id))
          .returning()
      : await this.db
          .insert(users)
          .values({
            authUserId: input.authUserId ?? null,
            email,
            name: input.name.trim() || email,
            passwordHash: input.passwordHash ?? null,
            emailVerifiedAt:
              input.passwordHash || input.authUserId ? sql`now()` : null,
          })
          .returning();

    if (!user) {
      throw new Error("Failed to save user.");
    }

    const [membership] = await this.db
      .insert(memberships)
      .values({
        tenantId,
        userId: user.id,
        roleId,
        status: "active",
      })
      .onConflictDoUpdate({
        target: [memberships.tenantId, memberships.userId],
        set: {
          roleId,
          status: "active",
          updatedAt: sql`now()`,
        },
      })
      .returning();

    await this.audit(tenantId, "tenant_user.upserted", "user", user.id, {
      email: user.email,
      role: input.role,
    });

    return {
      ...user,
      role: input.role,
      membershipId: membership?.id ?? null,
    };
  }

  async createTenantInvite(
    tenantId: string,
    input: CreateTenantInviteInput,
  ): Promise<TenantInviteRecord> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope<TenantInviteRecord>(tenantId, (repo) =>
        repo.createTenantInvite(tenantId, input),
      );
    }
    const email = normalizeEmail(input.email);
    if (!email) {
      throw new Error("Valid email is required.");
    }
    await this.getOrCreateRole(input.role);
    const [invite] = await this.db
      .insert(tenantInvites)
      .values({
        tenantId,
        email,
        roleName: input.role,
        tokenHash: input.tokenHash,
        invitedByUserId: input.invitedByUserId ?? null,
        expiresAt: input.expiresAt,
      })
      .returning();

    if (!invite) {
      throw new Error("Failed to create invite.");
    }

    await this.audit(
      tenantId,
      "tenant_invite.created",
      "tenant_invite",
      invite.id,
      {
        email,
        role: input.role,
      },
    );

    return invite;
  }

  async listTenantInvites(tenantId: string): Promise<TenantInviteRecord[]> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope<TenantInviteRecord[]>(tenantId, (repo) =>
        repo.listTenantInvites(tenantId),
      );
    }
    return this.db
      .select()
      .from(tenantInvites)
      .where(eq(tenantInvites.tenantId, tenantId))
      .orderBy(desc(tenantInvites.createdAt));
  }

  async acceptTenantInvite(input: AcceptTenantInviteInput) {
    // Run the whole accept inside a transaction so the invite is claimed and
    // the user upserted atomically (item 6). The claim is a conditional update
    // (`where status = 'pending'`) with RETURNING: only one of two concurrent
    // accepts gets a row back, so the other sees null and bails — no
    // double-create. Memberships also have a unique (tenant, user) index as a
    // second line of defence.
    return this.withTransaction(async (repo) => {
      const [invite] = await repo.db
        .select()
        .from(tenantInvites)
        .where(eq(tenantInvites.tokenHash, input.tokenHash))
        .limit(1);

      if (!invite || invite.status !== "pending") {
        return null;
      }
      if (invite.expiresAt.getTime() <= Date.now()) {
        await repo.db
          .update(tenantInvites)
          .set({ status: "expired", updatedAt: sql`now()` })
          .where(
            and(
              eq(tenantInvites.id, invite.id),
              eq(tenantInvites.status, "pending"),
            ),
          );
        return null;
      }

      // Atomically claim the invite; a concurrent accept that already flipped
      // it to "accepted" makes this match zero rows and we abort.
      const claimed = await repo.db
        .update(tenantInvites)
        .set({
          status: "accepted",
          acceptedAt: sql`now()`,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(tenantInvites.id, invite.id),
            eq(tenantInvites.status, "pending"),
          ),
        )
        .returning({ id: tenantInvites.id });

      if (claimed.length === 0) {
        return null;
      }

      return repo.upsertTenantUser(invite.tenantId, {
        email: invite.email,
        name: input.name,
        role: normalizeRoleName(invite.roleName),
        passwordHash: input.passwordHash,
      });
    });
  }

  private async publishOnboardingAnswer(
    tenantId: string,
    answer: BrainOnboardingAnswerRecord,
  ): Promise<BrainOnboardingAnswerRecord> {
    const title = answer.question;
    const content = `Question: ${answer.question}\nAnswer: ${answer.answer}`;
    const metadata = {
      ...answer.metadata,
      question: answer.question,
      answer: answer.answer,
      questionKey: answer.questionKey,
      category: answer.category,
      approvedFrom: "brain_onboarding",
    };

    if (answer.approvedChunkId) {
      const [chunk] = await this.db
        .select()
        .from(knowledgeChunks)
        .where(
          and(
            eq(knowledgeChunks.tenantId, tenantId),
            eq(knowledgeChunks.id, answer.approvedChunkId),
          ),
        )
        .limit(1);
      if (chunk) {
        await this.db
          .update(knowledgeDocuments)
          .set({
            title,
            content,
            metadata,
            updatedAt: sql`now()`,
          })
          .where(
            and(
              eq(knowledgeDocuments.tenantId, tenantId),
              eq(knowledgeDocuments.id, chunk.documentId),
            ),
          );
        await this.db
          .update(knowledgeChunks)
          .set({
            title,
            content,
            tags: ["onboarding", answer.category],
            metadata,
            status: "approved",
            embedding: null,
            updatedAt: sql`now()`,
          })
          .where(
            and(
              eq(knowledgeChunks.tenantId, tenantId),
              eq(knowledgeChunks.id, chunk.id),
            ),
          );
        const [updatedAnswer] = await this.db
          .update(brainOnboardingAnswers)
          .set({
            status: "approved",
            updatedAt: sql`now()`,
          })
          .where(
            and(
              eq(brainOnboardingAnswers.tenantId, tenantId),
              eq(brainOnboardingAnswers.id, answer.id),
            ),
          )
          .returning();
        if (updatedAnswer) {
          return updatedAnswer;
        }
      }
    }

    const [source] = await this.db
      .insert(knowledgeSources)
      .values({
        tenantId,
        type: "onboarding",
        name: "Project Brain onboarding",
        metadata: {
          questionKey: answer.questionKey,
          category: answer.category,
        },
      })
      .returning();
    if (!source) {
      throw new Error("Failed to create onboarding knowledge source.");
    }

    const [document] = await this.db
      .insert(knowledgeDocuments)
      .values({
        tenantId,
        sourceId: source.id,
        title,
        content,
        metadata,
      })
      .returning();
    if (!document) {
      throw new Error("Failed to create onboarding knowledge document.");
    }

    const [chunk] = await this.db
      .insert(knowledgeChunks)
      .values({
        tenantId,
        sourceId: source.id,
        documentId: document.id,
        title,
        content,
        tags: ["onboarding", answer.category],
        metadata,
        status: "approved",
      })
      .returning();
    if (!chunk) {
      throw new Error("Failed to create onboarding knowledge chunk.");
    }

    const [updatedAnswer] = await this.db
      .update(brainOnboardingAnswers)
      .set({
        status: "approved",
        approvedChunkId: chunk.id,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(brainOnboardingAnswers.tenantId, tenantId),
          eq(brainOnboardingAnswers.id, answer.id),
        ),
      )
      .returning();
    if (!updatedAnswer) {
      throw new Error(
        "Failed to link onboarding answer to approved knowledge.",
      );
    }
    return updatedAnswer;
  }

  async getTenantBrainSummary(tenantId: string): Promise<TenantBrainSummary> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope(tenantId, (repo) =>
        repo.getTenantBrainSummary(tenantId),
      );
    }
    const [
      [knowledgeStats],
      [pendingSuggestionStats],
      [onboardingStats],
      [ingestionStats],
    ] = await Promise.all([
      this.db
        .select({ total: sql<number>`count(*)::int` })
        .from(knowledgeChunks)
        .where(
          and(
            eq(knowledgeChunks.tenantId, tenantId),
            eq(knowledgeChunks.status, "approved"),
          ),
        ),
      this.db
        .select({ total: sql<number>`count(*)::int` })
        .from(knowledgeSuggestions)
        .where(
          and(
            eq(knowledgeSuggestions.tenantId, tenantId),
            eq(knowledgeSuggestions.status, "pending"),
          ),
        ),
      this.db
        .select({
          total: sql<number>`count(*)::int`,
          approved: sql<number>`count(*) filter (where ${brainOnboardingAnswers.status} = 'approved')::int`,
        })
        .from(brainOnboardingAnswers)
        .where(eq(brainOnboardingAnswers.tenantId, tenantId)),
      this.db
        .select({
          total: sql<number>`count(*)::int`,
          failed: sql<number>`count(*) filter (where ${documentIngestionJobs.status} = 'failed')::int`,
        })
        .from(documentIngestionJobs)
        .where(eq(documentIngestionJobs.tenantId, tenantId)),
    ]);

    return {
      approvedKnowledge: knowledgeStats?.total ?? 0,
      pendingSuggestions: pendingSuggestionStats?.total ?? 0,
      onboardingAnswers: onboardingStats?.total ?? 0,
      approvedOnboardingAnswers: onboardingStats?.approved ?? 0,
      ingestionJobs: ingestionStats?.total ?? 0,
      failedIngestionJobs: ingestionStats?.failed ?? 0,
    };
  }

  async listBrainOnboardingAnswers(
    tenantId: string,
  ): Promise<BrainOnboardingAnswerRecord[]> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope<BrainOnboardingAnswerRecord[]>(
        tenantId,
        (repo) => repo.listBrainOnboardingAnswers(tenantId),
      );
    }
    return this.db
      .select()
      .from(brainOnboardingAnswers)
      .where(eq(brainOnboardingAnswers.tenantId, tenantId))
      .orderBy(brainOnboardingAnswers.questionKey);
  }

  async upsertBrainOnboardingAnswers(
    tenantId: string,
    input: UpsertBrainOnboardingInput,
  ): Promise<BrainOnboardingAnswerRecord[]> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope<BrainOnboardingAnswerRecord[]>(
        tenantId,
        (repo) => repo.upsertBrainOnboardingAnswers(tenantId, input),
      );
    }
    return this.withTransaction(async (repo) => {
      const saved: BrainOnboardingAnswerRecord[] = [];
      for (const answer of input.answers) {
        const status =
          input.publishApproved || answer.status === "approved"
            ? "approved"
            : (answer.status ?? "draft");
        const [record] = await repo.db
          .insert(brainOnboardingAnswers)
          .values({
            tenantId,
            questionKey: answer.questionKey,
            question: answer.question,
            answer: answer.answer,
            category: answer.category ?? "general",
            status,
            metadata: answer.metadata ?? {},
          })
          .onConflictDoUpdate({
            target: [
              brainOnboardingAnswers.tenantId,
              brainOnboardingAnswers.questionKey,
            ],
            set: {
              question: answer.question,
              answer: answer.answer,
              category: answer.category ?? "general",
              status,
              metadata: answer.metadata ?? {},
              updatedAt: sql`now()`,
            },
          })
          .returning();
        if (!record) {
          throw new Error("Failed to save onboarding answer.");
        }

        saved.push(
          input.publishApproved || status === "approved"
            ? await repo.publishOnboardingAnswer(tenantId, record)
            : record,
        );
      }

      await repo.audit(
        tenantId,
        "brain.onboarding_answers.upserted",
        "tenant",
        tenantId,
        {
          count: saved.length,
          publishApproved: Boolean(input.publishApproved),
        },
      );

      return saved;
    });
  }

  async listKnowledgeSuggestions(
    tenantId: string,
    options?: PaginationOptions,
  ): Promise<KnowledgeSuggestionRecord[]> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope<KnowledgeSuggestionRecord[]>(
        tenantId,
        (repo) => repo.listKnowledgeSuggestions(tenantId, options),
      );
    }
    const { limit, offset } = resolvePagination(options);
    const status = normalizeListStatus(options) ?? "pending";
    const query = normalizeFullTextQuery(options);
    const filters: SQL[] = [eq(knowledgeSuggestions.tenantId, tenantId)];
    if (status) {
      filters.push(eq(knowledgeSuggestions.status, status));
    }
    if (query) {
      const likeQuery = `%${query}%`;
      filters.push(
        or(
          sql`${knowledgeSuggestions.suggestedQuestion} ilike ${likeQuery}`,
          sql`${knowledgeSuggestions.suggestedAnswer} ilike ${likeQuery}`,
          sql`${knowledgeSuggestions.suggestedTitle} ilike ${likeQuery}`,
        )!,
      );
    }
    return this.db
      .select()
      .from(knowledgeSuggestions)
      .where(and(...filters))
      .orderBy(desc(knowledgeSuggestions.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async createKnowledgeSuggestion(
    tenantId: string,
    input: CreateKnowledgeSuggestionInput,
  ): Promise<KnowledgeSuggestionRecord> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope<KnowledgeSuggestionRecord>(tenantId, (repo) =>
        repo.createKnowledgeSuggestion(tenantId, input),
      );
    }
    const [suggestion] = await this.db
      .insert(knowledgeSuggestions)
      .values({
        tenantId,
        sourceType: input.sourceType,
        sourceConversationId: input.sourceConversationId ?? null,
        sourceMessageId: input.sourceMessageId ?? null,
        sourceDocumentId: input.sourceDocumentId ?? null,
        suggestedQuestion: input.suggestedQuestion ?? null,
        suggestedAnswer: input.suggestedAnswer ?? null,
        suggestedTitle: input.suggestedTitle ?? null,
        suggestedTags: input.suggestedTags ?? ["suggested"],
        suggestedMetadata: input.suggestedMetadata ?? {},
        confidence: String(clampConfidence(input.confidence ?? 0)),
      })
      .onConflictDoNothing()
      .returning();

    if (suggestion) {
      await this.audit(
        tenantId,
        "knowledge_suggestion.created",
        "knowledge_suggestion",
        suggestion.id,
        {
          sourceType: input.sourceType,
        },
      );
      return suggestion;
    }

    if (input.sourceMessageId) {
      const [existing] = await this.db
        .select()
        .from(knowledgeSuggestions)
        .where(
          and(
            eq(knowledgeSuggestions.tenantId, tenantId),
            eq(knowledgeSuggestions.sourceMessageId, input.sourceMessageId),
            eq(knowledgeSuggestions.sourceType, input.sourceType),
          ),
        )
        .limit(1);
      if (existing) {
        return existing;
      }
    }

    throw new Error("Failed to create knowledge suggestion.");
  }

  async getKnowledgeSuggestion(
    tenantId: string,
    suggestionId: string,
  ): Promise<KnowledgeSuggestionRecord | null> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope<KnowledgeSuggestionRecord | null>(
        tenantId,
        (repo) => repo.getKnowledgeSuggestion(tenantId, suggestionId),
      );
    }
    const [suggestion] = await this.db
      .select()
      .from(knowledgeSuggestions)
      .where(
        and(
          eq(knowledgeSuggestions.tenantId, tenantId),
          eq(knowledgeSuggestions.id, suggestionId),
        ),
      )
      .limit(1);
    return suggestion ?? null;
  }

  /**
   * Store an AI-drafted candidate answer on a pending suggestion for review. The
   * draft is marked so the reviewer knows it is unverified; it only becomes live
   * knowledge if a human approves it via {@link approveKnowledgeSuggestion}.
   */
  async saveKnowledgeSuggestionDraft(
    tenantId: string,
    suggestionId: string,
    input: { answer: string; model?: string | null | undefined },
  ): Promise<KnowledgeSuggestionRecord> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope<KnowledgeSuggestionRecord>(tenantId, (repo) =>
        repo.saveKnowledgeSuggestionDraft(tenantId, suggestionId, input),
      );
    }
    const answer = input.answer.trim();
    if (!answer) {
      throw new Error("A draft answer is required.");
    }
    const existing = await this.getKnowledgeSuggestion(tenantId, suggestionId);
    if (!existing) {
      throw new Error("Knowledge suggestion not found.");
    }
    if (existing.status !== "pending") {
      throw new Error("Only pending suggestions can be drafted.");
    }

    const [updated] = await this.db
      .update(knowledgeSuggestions)
      .set({
        suggestedAnswer: answer,
        suggestedMetadata: {
          ...existing.suggestedMetadata,
          draftedByAI: true,
          draftModel: input.model ?? null,
          needsHumanAnswer: false,
        },
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(knowledgeSuggestions.tenantId, tenantId),
          eq(knowledgeSuggestions.id, suggestionId),
        ),
      )
      .returning();
    if (!updated) {
      throw new Error("Failed to save knowledge suggestion draft.");
    }

    await this.audit(
      tenantId,
      "knowledge_suggestion.drafted",
      "knowledge_suggestion",
      suggestionId,
      { model: input.model ?? null },
    );

    return updated;
  }

  async approveKnowledgeSuggestion(
    tenantId: string,
    suggestionId: string,
    input: ReviewKnowledgeSuggestionInput = {},
  ): Promise<{
    suggestion: KnowledgeSuggestionRecord;
    chunk: KnowledgeChunkRecord;
  }> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope(tenantId, (repo) =>
        repo.approveKnowledgeSuggestion(tenantId, suggestionId, input),
      );
    }
    return this.withTransaction(async (repo) => {
      const [suggestion] = await repo.db
        .select()
        .from(knowledgeSuggestions)
        .where(
          and(
            eq(knowledgeSuggestions.tenantId, tenantId),
            eq(knowledgeSuggestions.id, suggestionId),
          ),
        )
        .limit(1);

      if (!suggestion) {
        throw new Error("Knowledge suggestion not found.");
      }
      if (suggestion.status !== "pending") {
        throw new Error("Only pending suggestions can be approved.");
      }

      const question = (
        input.question ??
        suggestion.suggestedQuestion ??
        suggestion.suggestedTitle ??
        ""
      ).trim();
      const answer = (input.answer ?? suggestion.suggestedAnswer ?? "").trim();
      if (!question || !answer) {
        throw new Error("A question/title and answer are required to approve.");
      }

      const tags = input.tags?.length
        ? input.tags
        : suggestion.suggestedTags.length
          ? suggestion.suggestedTags
          : ["learned"];
      const title = (
        input.title ??
        suggestion.suggestedTitle ??
        question
      ).trim();
      const content = `Question: ${question}\nAnswer: ${answer}`;
      const metadata = {
        ...suggestion.suggestedMetadata,
        question,
        answer,
        suggestionId: suggestion.id,
        sourceType: suggestion.sourceType,
        approvedFrom: "knowledge_suggestion",
      };

      const [source] = await repo.db
        .insert(knowledgeSources)
        .values({
          tenantId,
          type: "learned_suggestion",
          name: "Approved learning suggestion",
          metadata: {
            suggestionId: suggestion.id,
            sourceType: suggestion.sourceType,
          },
        })
        .returning();
      if (!source) {
        throw new Error("Failed to create suggestion knowledge source.");
      }

      const [document] = await repo.db
        .insert(knowledgeDocuments)
        .values({
          tenantId,
          sourceId: source.id,
          title,
          content,
          metadata,
        })
        .returning();
      if (!document) {
        throw new Error("Failed to create suggestion knowledge document.");
      }

      const [chunk] = await repo.db
        .insert(knowledgeChunks)
        .values({
          tenantId,
          sourceId: source.id,
          documentId: document.id,
          title,
          content,
          tags,
          metadata,
          status: "approved",
        })
        .returning();
      if (!chunk) {
        throw new Error("Failed to create suggestion knowledge chunk.");
      }

      const [updatedSuggestion] = await repo.db
        .update(knowledgeSuggestions)
        .set({
          status: "approved",
          suggestedQuestion: question,
          suggestedAnswer: answer,
          suggestedTitle: title,
          suggestedTags: tags,
          reviewedByUserId: input.reviewedByUserId ?? null,
          reviewedAt: sql`now()`,
          reviewNote: input.reviewNote ?? null,
          approvedChunkId: chunk.id,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(knowledgeSuggestions.tenantId, tenantId),
            eq(knowledgeSuggestions.id, suggestionId),
          ),
        )
        .returning();
      if (!updatedSuggestion) {
        throw new Error("Failed to mark suggestion approved.");
      }

      await repo.audit(
        tenantId,
        "knowledge_suggestion.approved",
        "knowledge_suggestion",
        suggestion.id,
        {
          chunkId: chunk.id,
          question,
        },
      );

      return { suggestion: updatedSuggestion, chunk };
    });
  }

  async rejectKnowledgeSuggestion(
    tenantId: string,
    suggestionId: string,
    input: ReviewKnowledgeSuggestionInput = {},
  ): Promise<KnowledgeSuggestionRecord> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope<KnowledgeSuggestionRecord>(tenantId, (repo) =>
        repo.rejectKnowledgeSuggestion(tenantId, suggestionId, input),
      );
    }
    const [suggestion] = await this.db
      .update(knowledgeSuggestions)
      .set({
        status: "rejected",
        reviewedByUserId: input.reviewedByUserId ?? null,
        reviewedAt: sql`now()`,
        reviewNote: input.reviewNote ?? null,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(knowledgeSuggestions.tenantId, tenantId),
          eq(knowledgeSuggestions.id, suggestionId),
          eq(knowledgeSuggestions.status, "pending"),
        ),
      )
      .returning();

    if (!suggestion) {
      throw new Error("Pending knowledge suggestion not found.");
    }

    await this.audit(
      tenantId,
      "knowledge_suggestion.rejected",
      "knowledge_suggestion",
      suggestion.id,
      {
        reviewNote: input.reviewNote ?? null,
      },
    );

    return suggestion;
  }

  async listDocumentIngestionJobs(
    tenantId: string,
    options?: PaginationOptions,
  ): Promise<DocumentIngestionJobRecord[]> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope<DocumentIngestionJobRecord[]>(
        tenantId,
        (repo) => repo.listDocumentIngestionJobs(tenantId, options),
      );
    }
    const { limit, offset } = resolvePagination(options);
    const status = normalizeListStatus(options);
    const filters: SQL[] = [eq(documentIngestionJobs.tenantId, tenantId)];
    if (status) {
      filters.push(eq(documentIngestionJobs.status, status));
    }
    return this.db
      .select()
      .from(documentIngestionJobs)
      .where(and(...filters))
      .orderBy(desc(documentIngestionJobs.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async recordDocumentIngestionFailure(
    tenantId: string,
    input: RecordDocumentIngestionFailureInput,
  ): Promise<DocumentIngestionJobRecord> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope<DocumentIngestionJobRecord>(
        tenantId,
        (repo) => repo.recordDocumentIngestionFailure(tenantId, input),
      );
    }
    const [job] = await this.db
      .insert(documentIngestionJobs)
      .values({
        tenantId,
        objectKey: input.objectKey ?? null,
        fileName: input.fileName,
        contentType: input.contentType,
        checksum: input.checksum ?? null,
        status: "failed",
        error: input.error,
        parserMetadata: input.metadata ?? {},
      })
      .returning();
    if (!job) {
      throw new Error("Failed to record document ingestion failure.");
    }
    await this.audit(
      tenantId,
      "knowledge_document.ingestion_failed",
      "document_ingestion_job",
      job.id,
      {
        fileName: input.fileName,
        error: input.error,
      },
    );
    return job;
  }

  async ingestKnowledgeDocument(
    tenantId: string,
    input: IngestKnowledgeDocumentInput,
  ): Promise<IngestKnowledgeDocumentResult> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope<IngestKnowledgeDocumentResult>(
        tenantId,
        (repo) => repo.ingestKnowledgeDocument(tenantId, input),
      );
    }

    return this.withTransaction(async (repo) => {
      const text = normalizeKnowledgeText(input.extractedText);
      if (!text) {
        throw new Error("Document extraction produced no text.");
      }
      const tags = input.suggestedTags?.length
        ? input.suggestedTags
        : ["document", "upload"];
      const checksum = input.checksum?.trim() || null;
      const metadata = {
        ...(input.metadata ?? {}),
        fileName: input.fileName,
        contentType: input.contentType,
        checksum,
        ingestedFrom: "document_upload",
      };

      if (checksum) {
        const [existing] = await repo.db
          .select({
            document: knowledgeDocuments,
            source: knowledgeSources,
          })
          .from(knowledgeDocuments)
          .innerJoin(
            knowledgeSources,
            eq(knowledgeSources.id, knowledgeDocuments.sourceId),
          )
          .where(
            and(
              eq(knowledgeDocuments.tenantId, tenantId),
              eq(knowledgeDocuments.checksum, checksum),
            ),
          )
          .limit(1);
        if (existing) {
          const [job] = await repo.db
            .insert(documentIngestionJobs)
            .values({
              tenantId,
              sourceId: existing.source.id,
              documentId: existing.document.id,
              objectKey: input.objectKey ?? null,
              fileName: input.fileName,
              contentType: input.contentType,
              checksum,
              status: "archived",
              parserMetadata: {
                ...metadata,
                duplicate: true,
                duplicateDocumentId: existing.document.id,
              },
            })
            .returning();
          if (!job) {
            throw new Error("Failed to record duplicate ingestion job.");
          }
          return {
            source: existing.source,
            document: existing.document,
            job,
            suggestions: [],
            duplicate: true,
          };
        }
      }

      const [source] = await repo.db
        .insert(knowledgeSources)
        .values({
          tenantId,
          type: "document_upload",
          name: input.sourceName ?? input.fileName,
          metadata,
        })
        .returning();
      if (!source) {
        throw new Error("Failed to create document knowledge source.");
      }

      const [document] = await repo.db
        .insert(knowledgeDocuments)
        .values({
          tenantId,
          sourceId: source.id,
          title: input.fileName,
          content: text,
          status: "pending_review",
          checksum,
          metadata,
        })
        .returning();
      if (!document) {
        throw new Error("Failed to create knowledge document.");
      }

      const [job] = await repo.db
        .insert(documentIngestionJobs)
        .values({
          tenantId,
          sourceId: source.id,
          documentId: document.id,
          objectKey: input.objectKey ?? null,
          fileName: input.fileName,
          contentType: input.contentType,
          checksum,
          status: "pending_review",
          parserMetadata: {
            ...metadata,
            textCharacters: text.length,
          },
        })
        .returning();
      if (!job) {
        throw new Error("Failed to create document ingestion job.");
      }

      const sections = buildDocumentSuggestionSections(
        text,
        input.fileName,
        input.maxSuggestions,
      );
      const suggestions: KnowledgeSuggestionRecord[] = [];
      for (const section of sections) {
        const suggestion = await repo.createKnowledgeSuggestion(tenantId, {
          sourceType: "document_extraction",
          sourceDocumentId: document.id,
          suggestedQuestion: section.title,
          suggestedTitle: section.title,
          suggestedAnswer: section.content,
          suggestedTags: tags,
          suggestedMetadata: {
            ...metadata,
            documentId: document.id,
            ingestionJobId: job.id,
            sectionIndex: section.sectionIndex,
          },
          confidence: 0.7,
        });
        suggestions.push(suggestion);
      }

      await repo.audit(
        tenantId,
        "knowledge_document.ingested",
        "knowledge_document",
        document.id,
        {
          fileName: input.fileName,
          suggestions: suggestions.length,
          checksum,
        },
      );

      return { source, document, job, suggestions, duplicate: false };
    });
  }

  async scanKnowledgeSuggestions(
    tenantId: string,
    options: { limit?: number | undefined } = {},
  ): Promise<ScanKnowledgeSuggestionsResult> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope<ScanKnowledgeSuggestionsResult>(
        tenantId,
        (repo) => repo.scanKnowledgeSuggestions(tenantId, options),
      );
    }

    const limit = Math.min(Math.max(Math.trunc(options.limit ?? 50), 1), 200);
    const handoffs = await this.db
      .select()
      .from(handoffRequests)
      .where(eq(handoffRequests.tenantId, tenantId))
      .orderBy(desc(handoffRequests.createdAt))
      .limit(limit);

    const created: KnowledgeSuggestionRecord[] = [];
    let skipped = 0;
    for (const handoff of handoffs) {
      const question = normalizeKnowledgeText(handoff.requesterMessage);
      if (
        !isLearningHandoffReason(handoff.reason) ||
        !isMeaningfulQuestion(question)
      ) {
        skipped += 1;
        continue;
      }

      const filters: SQL[] = [
        eq(knowledgeSuggestions.tenantId, tenantId),
        eq(knowledgeSuggestions.sourceType, "unanswered_question"),
        eq(knowledgeSuggestions.suggestedQuestion, question),
      ];
      if (handoff.conversationId) {
        filters.push(
          eq(knowledgeSuggestions.sourceConversationId, handoff.conversationId),
        );
      } else {
        filters.push(
          sql`${knowledgeSuggestions.suggestedMetadata}->>'handoffId' = ${handoff.id}`,
        );
      }

      const [existing] = await this.db
        .select({ id: knowledgeSuggestions.id })
        .from(knowledgeSuggestions)
        .where(and(...filters))
        .limit(1);
      if (existing) {
        skipped += 1;
        continue;
      }

      const suggestion = await this.createKnowledgeSuggestion(tenantId, {
        sourceType: "unanswered_question",
        sourceConversationId: handoff.conversationId ?? null,
        suggestedQuestion: question,
        suggestedTitle: question,
        suggestedTags: ["unanswered", handoff.reason, handoff.channel].filter(
          Boolean,
        ),
        suggestedMetadata: {
          handoffId: handoff.id,
          handoffReason: handoff.reason,
          channel: handoff.channel,
          needsHumanAnswer: true,
        },
        confidence: 0.45,
      });
      created.push(suggestion);
    }

    if (created.length > 0) {
      await this.audit(
        tenantId,
        "knowledge_suggestion.scan.created",
        "tenant",
        tenantId,
        {
          created: created.length,
          scanned: handoffs.length,
        },
      );
    }

    return { created, skipped, scanned: handoffs.length };
  }

  async addFaq(tenantId: string, input: AddFaqInput): Promise<AddFaqResult> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope<AddFaqResult>(tenantId, (repo) =>
        repo.addFaq(tenantId, input),
      );
    }
    const tenant = await this.getTenant(tenantId);
    if (!tenant) {
      throw new Error("Tenant not found.");
    }

    const [source] = await this.db
      .insert(knowledgeSources)
      .values({
        tenantId,
        type: "manual_faq",
        name: "Manual FAQ",
        metadata: {
          entryType: "faq",
        },
      })
      .returning();

    if (!source) {
      throw new Error("Failed to create knowledge source.");
    }

    const content = `Question: ${input.question}\nAnswer: ${input.answer}`;
    const [document] = await this.db
      .insert(knowledgeDocuments)
      .values({
        tenantId,
        sourceId: source.id,
        title: input.question,
        content,
        metadata: {
          question: input.question,
          answer: input.answer,
        },
      })
      .returning();

    if (!document) {
      throw new Error("Failed to create knowledge document.");
    }

    const [chunk] = await this.db
      .insert(knowledgeChunks)
      .values({
        tenantId,
        sourceId: source.id,
        documentId: document.id,
        title: input.question,
        content,
        tags: input.tags ?? ["faq"],
        metadata: {
          question: input.question,
          answer: input.answer,
        },
      })
      .returning();

    if (!chunk) {
      throw new Error("Failed to create knowledge chunk.");
    }

    await this.audit(
      tenantId,
      "knowledge.faq.created",
      "knowledge_document",
      document.id,
      {
        question: input.question,
      },
    );

    return { source, document, chunk };
  }

  async listKnowledge(
    tenantId: string,
    options?: PaginationOptions,
  ): Promise<KnowledgeListItem[]> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope<KnowledgeListItem[]>(tenantId, (repo) =>
        repo.listKnowledge(tenantId, options),
      );
    }
    const { limit, offset } = resolvePagination(options);
    const query = normalizeFullTextQuery(options);
    const status = normalizeListStatus(options);
    const filters: SQL[] = [eq(knowledgeChunks.tenantId, tenantId)];
    if (status) {
      filters.push(eq(knowledgeChunks.status, status));
    }
    if (query) {
      const searchQuery = sql`websearch_to_tsquery('simple'::regconfig, ${query})`;
      filters.push(
        sql`to_tsvector('simple'::regconfig, knowledge_chunk_search_text(${knowledgeChunks.title}, ${knowledgeChunks.content}, ${knowledgeChunks.tags})) @@ ${searchQuery}`,
      );
    }
    return this.db
      .select({
        id: knowledgeChunks.id,
        documentId: knowledgeChunks.documentId,
        sourceId: knowledgeChunks.sourceId,
        title: knowledgeChunks.title,
        content: knowledgeChunks.content,
        tags: knowledgeChunks.tags,
        status: knowledgeChunks.status,
        metadata: knowledgeChunks.metadata,
        createdAt: knowledgeChunks.createdAt,
        updatedAt: knowledgeChunks.updatedAt,
      })
      .from(knowledgeChunks)
      .where(and(...filters))
      .orderBy(desc(knowledgeChunks.createdAt))
      .limit(limit)
      .offset(offset);
  }
  async getOneBrainSyncRecord(tenantId: string, input: SyncSourceInput) {
    assertTenantId(tenantId);
    return this.needsTenantScope(tenantId)
      ? this.withTenantScope(tenantId, (repo) =>
          getOneBrainSyncRecordRow(repo.db, tenantId, input),
        )
      : getOneBrainSyncRecordRow(this.db, tenantId, input);
  }
  async getOneBrainSyncSummary(tenantId: string, limit?: number) {
    assertTenantId(tenantId);
    return this.needsTenantScope(tenantId)
      ? this.withTenantScope(tenantId, (repo) =>
          getOneBrainSyncSummaryRow(repo.db, tenantId, limit),
        )
      : getOneBrainSyncSummaryRow(this.db, tenantId, limit);
  }
  async recordOneBrainSyncSuccess(tenantId: string, input: SyncRecordInput) {
    assertTenantId(tenantId);
    return this.needsTenantScope(tenantId)
      ? this.withTenantScope(tenantId, (repo) =>
          recordOneBrainSyncSuccessRow(repo.db, tenantId, input),
        )
      : recordOneBrainSyncSuccessRow(this.db, tenantId, input);
  }
  async recordOneBrainSyncFailure(tenantId: string, input: SyncRecordInput) {
    assertTenantId(tenantId);
    return this.needsTenantScope(tenantId)
      ? this.withTenantScope(tenantId, (repo) =>
          recordOneBrainSyncFailureRow(repo.db, tenantId, input),
        )
      : recordOneBrainSyncFailureRow(this.db, tenantId, input);
  }

  async createPortalLinkProjection(
    tenantId: string,
    input: CreatePortalLinkProjectionInput,
  ): Promise<PortalLinkProjectionRecord> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope(tenantId, (repo) =>
        repo.createPortalLinkProjection(tenantId, input),
      );
    }
    const [record] = await this.db
      .insert(portalLinkProjections)
      .values({
        tenantId,
        onebrainRecordId: input.onebrainRecordId,
        tokenHash: input.tokenHash,
        conversationId: input.conversationId ?? null,
        contactId: input.contactId ?? null,
        scope: input.scope ?? "conversation",
        expiresAt: input.expiresAt,
        createdByUserId: input.createdByUserId ?? null,
        metadata: input.metadata ?? {},
      })
      .returning();
    if (!record) {
      throw new Error("Failed to create portal link projection.");
    }
    return record;
  }

  async getPortalLinkProjectionByTokenHash(
    tenantId: string,
    tokenHash: string,
  ): Promise<PortalLinkProjectionRecord | null> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope(tenantId, (repo) =>
        repo.getPortalLinkProjectionByTokenHash(tenantId, tokenHash),
      );
    }
    const [record] = await this.db
      .select()
      .from(portalLinkProjections)
      .where(
        and(
          eq(portalLinkProjections.tenantId, tenantId),
          eq(portalLinkProjections.tokenHash, tokenHash),
        ),
      )
      .limit(1);
    return record ?? null;
  }

  async getPortalLinkProjection(
    tenantId: string,
    linkId: string,
  ): Promise<PortalLinkProjectionRecord | null> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope(tenantId, (repo) =>
        repo.getPortalLinkProjection(tenantId, linkId),
      );
    }
    const [record] = await this.db
      .select()
      .from(portalLinkProjections)
      .where(
        and(
          eq(portalLinkProjections.tenantId, tenantId),
          eq(portalLinkProjections.id, linkId),
        ),
      )
      .limit(1);
    return record ?? null;
  }

  async disablePortalLinkProjection(
    tenantId: string,
    linkId: string,
  ): Promise<PortalLinkProjectionRecord | null> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope(tenantId, (repo) =>
        repo.disablePortalLinkProjection(tenantId, linkId),
      );
    }
    const [record] = await this.db
      .update(portalLinkProjections)
      .set({
        status: "disabled",
        disabledAt: new Date(),
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(portalLinkProjections.tenantId, tenantId),
          eq(portalLinkProjections.id, linkId),
        ),
      )
      .returning();
    return record ?? null;
  }

  async markPortalLinkProjectionUsed(
    tenantId: string,
    linkId: string,
  ): Promise<void> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope<void>(tenantId, (repo) =>
        repo.markPortalLinkProjectionUsed(tenantId, linkId),
      );
    }
    await this.db
      .update(portalLinkProjections)
      .set({
        lastUsedAt: new Date(),
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(portalLinkProjections.tenantId, tenantId),
          eq(portalLinkProjections.id, linkId),
        ),
      );
  }

  async updateFaq(
    tenantId: string,
    knowledgeId: string,
    input: UpdateFaqInput,
  ): Promise<KnowledgeChunkRecord | undefined> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope<KnowledgeChunkRecord | undefined>(
        tenantId,
        (repo) => repo.updateFaq(tenantId, knowledgeId, input),
      );
    }
    const [chunk] = await this.db
      .select()
      .from(knowledgeChunks)
      .where(
        and(
          eq(knowledgeChunks.tenantId, tenantId),
          eq(knowledgeChunks.id, knowledgeId),
        ),
      )
      .limit(1);

    if (!chunk) {
      throw new Error("Knowledge item not found.");
    }

    const content = `Question: ${input.question}\nAnswer: ${input.answer}`;
    const metadata = {
      question: input.question,
      answer: input.answer,
    };

    await this.db
      .update(knowledgeDocuments)
      .set({
        title: input.question,
        content,
        metadata,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(knowledgeDocuments.tenantId, tenantId),
          eq(knowledgeDocuments.id, chunk.documentId),
        ),
      );

    const [updatedChunk] = await this.db
      .update(knowledgeChunks)
      .set({
        title: input.question,
        content,
        tags: input.tags ?? chunk.tags,
        metadata,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(knowledgeChunks.tenantId, tenantId),
          eq(knowledgeChunks.id, knowledgeId),
        ),
      )
      .returning();

    await this.audit(
      tenantId,
      "knowledge.faq.updated",
      "knowledge_chunk",
      knowledgeId,
      {
        question: input.question,
      },
    );

    return updatedChunk;
  }

  async deleteKnowledge(tenantId: string, knowledgeId: string): Promise<void> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope<void>(tenantId, (repo) =>
        repo.deleteKnowledge(tenantId, knowledgeId),
      );
    }
    const [chunk] = await this.db
      .select()
      .from(knowledgeChunks)
      .where(
        and(
          eq(knowledgeChunks.tenantId, tenantId),
          eq(knowledgeChunks.id, knowledgeId),
        ),
      )
      .limit(1);

    if (!chunk) {
      throw new Error("Knowledge item not found.");
    }

    await this.db
      .delete(knowledgeSources)
      .where(
        and(
          eq(knowledgeSources.tenantId, tenantId),
          eq(knowledgeSources.id, chunk.sourceId),
        ),
      );

    await this.audit(
      tenantId,
      "knowledge.faq.deleted",
      "knowledge_chunk",
      knowledgeId,
      {
        title: chunk.title,
      },
    );
  }

  async getTenantPolicy(tenantId: string): Promise<TenantPolicy> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope(tenantId, (repo) =>
        repo.getTenantPolicy(tenantId),
      );
    }
    const tenant = await this.getTenant(tenantId);
    if (!tenant) {
      throw new Error("Tenant not found.");
    }

    const [storedAllowedIntents, storedBlockedTopics, [escalationRule]] =
      await Promise.all([
        this.db
          .select()
          .from(allowedIntents)
          .where(eq(allowedIntents.tenantId, tenantId)),
        this.db
          .select()
          .from(blockedTopics)
          .where(eq(blockedTopics.tenantId, tenantId)),
        this.db
          .select()
          .from(escalationRules)
          .where(
            and(
              eq(escalationRules.tenantId, tenantId),
              eq(escalationRules.enabled, true),
            ),
          )
          .limit(1),
      ]);

    const blocked: BlockedTopic[] = storedBlockedTopics.map((topic) => {
      const mapped: BlockedTopic = {
        name: topic.name,
        terms: topic.terms,
        enabled: topic.enabled,
      };
      if (topic.response) {
        mapped.response = topic.response;
      }
      return mapped;
    });

    const mappedAllowedIntents: AllowedIntent[] = storedAllowedIntents.map(
      (intent) => {
        const mapped: AllowedIntent = {
          name: intent.name,
          keywords: intent.keywords,
          examples: intent.examples,
          enabled: intent.enabled,
        };
        if (intent.description) {
          mapped.description = intent.description;
        }
        return mapped;
      },
    );

    const escalation = {
      enabled: escalationRule?.enabled ?? true,
      contactLabel: escalationRule?.contactLabel ?? "team",
      createHandoffRequest: escalationRule?.createHandoffRequest ?? true,
    };
    if (escalationRule?.contactValue) {
      Object.assign(escalation, { contactValue: escalationRule.contactValue });
    }

    const basePolicy = createDefaultTenantPolicy(tenantId);
    return {
      ...basePolicy,
      allowedIntents: mappedAllowedIntents,
      blockedTopics: blocked,
      confidenceThreshold: Number(tenant.confidenceThreshold),
      maxMessageLength: tenant.maxMessageLength,
      defaultLocale: tenant.defaultLocale,
      tone:
        tenant.tone === "formal" || tenant.tone === "neutral"
          ? tenant.tone
          : "friendly",
      escalation,
    };
  }

  async searchKnowledge(
    tenantId: string,
    query: string,
    limit: number,
  ): Promise<KnowledgeChunk[]> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope(tenantId, (repo) =>
        repo.searchKnowledge(tenantId, query, limit),
      );
    }
    const requestedLimit = Math.max(limit, 1);
    const rowLimit = Math.max(requestedLimit * 5, requestedLimit);
    const searchVector = sql`to_tsvector('simple'::regconfig, knowledge_chunk_search_text(${knowledgeChunks.title}, ${knowledgeChunks.content}, ${knowledgeChunks.tags}))`;
    const searchQuery = sql`websearch_to_tsquery('simple'::regconfig, ${query})`;
    const ftsRows = query.trim()
      ? await this.db
          .select()
          .from(knowledgeChunks)
          .where(
            and(
              eq(knowledgeChunks.tenantId, tenantId),
              eq(knowledgeChunks.status, "approved"),
              sql`${searchVector} @@ ${searchQuery}`,
            ),
          )
          .orderBy(sql`ts_rank_cd(${searchVector}, ${searchQuery}) desc`)
          .limit(rowLimit)
      : [];

    const rows =
      ftsRows.length > 0
        ? ftsRows
        : await this.db
            .select()
            .from(knowledgeChunks)
            .where(
              and(
                eq(knowledgeChunks.tenantId, tenantId),
                eq(knowledgeChunks.status, "approved"),
              ),
            )
            .limit(rowLimit);

    return rankChunks(
      query,
      rows.map((row) => {
        const chunk: KnowledgeChunk = {
          id: row.id,
          tenantId: row.tenantId,
          documentId: row.documentId,
          sourceId: row.sourceId,
          content: row.content,
          tags: row.tags,
          metadata: row.metadata,
        };
        if (row.title) {
          chunk.title = row.title;
        }
        return chunk;
      }),
    ).slice(0, requestedLimit);
  }

  /**
   * Semantic retrieval over stored embeddings using pgvector cosine distance.
   * Scores are normalised to 0..1 (1 = identical). Returns nothing when no
   * approved chunk has an embedding yet.
   */
  async searchKnowledgeByEmbedding(
    tenantId: string,
    embedding: number[],
    limit: number,
  ): Promise<RetrievedChunk[]> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope(tenantId, (repo) =>
        repo.searchKnowledgeByEmbedding(tenantId, embedding, limit),
      );
    }
    if (embedding.length === 0) {
      return [];
    }
    const literal = `[${embedding.join(",")}]`;
    const distance = sql<number>`${knowledgeChunks.embedding} <=> ${literal}::vector`;
    const rows = await this.db
      .select({
        id: knowledgeChunks.id,
        tenantId: knowledgeChunks.tenantId,
        documentId: knowledgeChunks.documentId,
        sourceId: knowledgeChunks.sourceId,
        title: knowledgeChunks.title,
        content: knowledgeChunks.content,
        tags: knowledgeChunks.tags,
        metadata: knowledgeChunks.metadata,
        distance,
      })
      .from(knowledgeChunks)
      .where(
        and(
          eq(knowledgeChunks.tenantId, tenantId),
          eq(knowledgeChunks.status, "approved"),
          isNotNull(knowledgeChunks.embedding),
        ),
      )
      .orderBy(distance)
      .limit(Math.max(limit, 1));

    return rows.map((row) => {
      const chunk: RetrievedChunk = {
        id: row.id,
        tenantId: row.tenantId,
        documentId: row.documentId,
        sourceId: row.sourceId,
        content: row.content,
        tags: row.tags,
        metadata: row.metadata,
        score: Math.max(0, Math.min(1, 1 - Number(row.distance))),
      };
      if (row.title) {
        chunk.title = row.title;
      }
      return chunk;
    });
  }

  /** Persist a computed embedding for a single approved chunk. */
  async setChunkEmbedding(
    tenantId: string,
    chunkId: string,
    embedding: number[],
  ): Promise<void> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope(tenantId, (repo) =>
        repo.setChunkEmbedding(tenantId, chunkId, embedding),
      );
    }
    await this.db
      .update(knowledgeChunks)
      .set({ embedding, updatedAt: sql`now()` })
      .where(
        and(
          eq(knowledgeChunks.tenantId, tenantId),
          eq(knowledgeChunks.id, chunkId),
        ),
      );
  }

  /** Fetch chunk text for embedding generation (worker backfill). */
  async listChunksForEmbedding(
    tenantId: string,
    chunkIds: string[],
  ): Promise<Array<Pick<KnowledgeChunk, "id" | "title" | "content">>> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope(tenantId, (repo) =>
        repo.listChunksForEmbedding(tenantId, chunkIds),
      );
    }
    if (chunkIds.length === 0) {
      return [];
    }
    const rows = await this.db
      .select({
        id: knowledgeChunks.id,
        title: knowledgeChunks.title,
        content: knowledgeChunks.content,
      })
      .from(knowledgeChunks)
      .where(
        and(
          eq(knowledgeChunks.tenantId, tenantId),
          inArray(knowledgeChunks.id, chunkIds),
        ),
      );
    return rows.map((row) => {
      const chunk: Pick<KnowledgeChunk, "id" | "title" | "content"> = {
        id: row.id,
        content: row.content,
      };
      if (row.title) {
        chunk.title = row.title;
      }
      return chunk;
    });
  }

  /**
   * Approved chunks that still lack an embedding, in id order so the backfill
   * can page through them deterministically.
   */
  async listChunksMissingEmbedding(
    tenantId: string,
    limit = 200,
  ): Promise<Array<Pick<KnowledgeChunk, "id" | "title" | "content">>> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope(tenantId, (repo) =>
        repo.listChunksMissingEmbedding(tenantId, limit),
      );
    }
    const rows = await this.db
      .select({
        id: knowledgeChunks.id,
        title: knowledgeChunks.title,
        content: knowledgeChunks.content,
      })
      .from(knowledgeChunks)
      .where(
        and(
          eq(knowledgeChunks.tenantId, tenantId),
          eq(knowledgeChunks.status, "approved"),
          isNull(knowledgeChunks.embedding),
        ),
      )
      .orderBy(knowledgeChunks.id)
      .limit(Math.max(limit, 1));
    return rows.map((row) => {
      const chunk: Pick<KnowledgeChunk, "id" | "title" | "content"> = {
        id: row.id,
        content: row.content,
      };
      if (row.title) {
        chunk.title = row.title;
      }
      return chunk;
    });
  }

  async findOrCreateConversation(input: {
    tenantId: string;
    publicConversationId?: string;
    channel: Channel;
    externalUserId?: string;
    locale?: string;
    contact?: ContactProfileInput;
  }): Promise<ConversationRecord> {
    assertTenantId(input.tenantId);
    if (this.needsTenantScope(input.tenantId)) {
      return this.withTenantScope(input.tenantId, (repo) =>
        repo.findOrCreateConversation(input),
      );
    }
    const contact = await this.resolveContactForConversation({
      tenantId: input.tenantId,
      channel: input.channel,
      externalUserId: input.externalUserId,
      contact: input.contact,
    });

    if (input.publicConversationId) {
      const [existing] = await this.db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.tenantId, input.tenantId),
            eq(conversations.publicId, input.publicConversationId),
          ),
        )
        .limit(1);
      if (existing) {
        if (contact) {
          await this.linkConversationContact(
            input.tenantId,
            existing.id,
            contact.id,
          );
        }
        return existing;
      }
    }

    const [conversation] = await this.db
      .insert(conversations)
      .values({
        tenantId: input.tenantId,
        publicId: input.publicConversationId ?? createPublicConversationId(),
        channel: input.channel,
        externalUserId: input.externalUserId,
        locale: input.locale ?? "en",
      })
      .returning();

    if (!conversation) {
      throw new Error("Failed to create conversation.");
    }

    if (contact) {
      await this.linkConversationContact(
        input.tenantId,
        conversation.id,
        contact.id,
      );
    }

    return conversation;
  }

  async enrichConversationContact(input: {
    tenantId: string;
    conversationId: string;
    channel?: Channel;
    externalUserId?: string | null;
    contact: ContactProfileInput;
  }): Promise<ContactRecord | null> {
    assertTenantId(input.tenantId);
    if (this.needsTenantScope(input.tenantId)) {
      return this.withTenantScope<ContactRecord | null>(
        input.tenantId,
        (repo) => repo.enrichConversationContact(input),
      );
    }
    const [conversation] = await this.db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.tenantId, input.tenantId),
          eq(conversations.id, input.conversationId),
        ),
      )
      .limit(1);

    if (!conversation) {
      throw new Error("Conversation not found.");
    }

    const channel = input.channel ?? (conversation.channel as Channel);
    const externalUserId = input.externalUserId ?? conversation.externalUserId;
    const linkedContactId = await this.getConversationContactId(
      input.tenantId,
      conversation.id,
    );
    const contact = await this.resolveContactForConversation({
      tenantId: input.tenantId,
      channel,
      externalUserId: externalUserId ?? undefined,
      contact: input.contact,
      preferredContactId: linkedContactId ?? undefined,
    });

    if (!contact) {
      return null;
    }

    if (linkedContactId !== contact.id) {
      await this.linkConversationContact(
        input.tenantId,
        conversation.id,
        contact.id,
      );
    }

    await this.audit(
      input.tenantId,
      "contact.enriched",
      "contact",
      contact.id,
      {
        conversationId: conversation.id,
        channel,
        fields: Object.keys(input.contact),
      },
    );

    return contact;
  }

  async addMessage(input: {
    tenantId: string;
    conversationId: string;
    channel: Channel;
    direction: "inbound" | "outbound";
    role: "user" | "assistant" | "system" | "operator";
    content: string;
    authorUserId?: string | null;
    providerEventId?: string | null;
    trace?: Record<string, unknown>;
  }): Promise<MessageRecord> {
    assertTenantId(input.tenantId);
    if (this.needsTenantScope(input.tenantId)) {
      return this.withTenantScope(input.tenantId, (repo) =>
        repo.addMessage(input),
      );
    }
    const providerEventId = input.providerEventId ?? null;
    const values = {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      channel: input.channel,
      direction: input.direction,
      role: input.role,
      content: input.content,
      authorUserId: input.authorUserId ?? null,
      providerEventId,
      trace: input.trace ?? {},
    };

    // When the message carries a provider event id, dedupe against webhook
    // retries: a second delivery of the same event returns the already-stored
    // turn instead of appending a duplicate.
    if (providerEventId) {
      const [inserted] = await this.db
        .insert(messages)
        .values(values)
        .onConflictDoNothing({
          target: [
            messages.tenantId,
            messages.conversationId,
            messages.providerEventId,
          ],
        })
        .returning();
      if (inserted) {
        return inserted;
      }
      const [existing] = await this.db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.tenantId, input.tenantId),
            eq(messages.conversationId, input.conversationId),
            eq(messages.providerEventId, providerEventId),
          ),
        )
        .limit(1);
      if (!existing) {
        throw new Error("Failed to store message.");
      }
      return existing;
    }

    const [message] = await this.db.insert(messages).values(values).returning();

    if (!message) {
      throw new Error("Failed to store message.");
    }

    return message;
  }

  async recordMessageDelivery(input: {
    tenantId: string;
    messageId?: string | null;
    conversationId?: string | null;
    channel: Channel;
    provider: string;
    providerMessageId?: string | null;
    status: string;
    detail?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<MessageDeliveryRecord | undefined> {
    assertTenantId(input.tenantId);
    if (this.needsTenantScope(input.tenantId)) {
      return this.withTenantScope<MessageDeliveryRecord | undefined>(
        input.tenantId,
        (repo) => repo.recordMessageDelivery(input),
      );
    }
    const [delivery] = await this.db
      .insert(messageDeliveries)
      .values({
        tenantId: input.tenantId,
        messageId: input.messageId ?? null,
        conversationId: input.conversationId ?? null,
        channel: input.channel,
        provider: input.provider,
        providerMessageId: input.providerMessageId ?? null,
        status: input.status,
        detail: input.detail ?? null,
        metadata: input.metadata ?? {},
      })
      .returning();

    return delivery;
  }

  /**
   * Reserve an outbound delivery for an idempotency key BEFORE the send happens.
   * Inserts a `pending` intent row; if a delivery for (tenant, key) already
   * exists the insert is a no-op and this returns `{ claimed: false }` — the
   * caller must NOT send again, because a prior (possibly retried) processing
   * already owns this reply. Returns `{ claimed: true, id }` when this caller
   * won the insert and should proceed to send, then finalize by that id. This is
   * the outbox claim that closes the webhook-retry double-send window.
   */
  async claimOutboundDelivery(input: {
    tenantId: string;
    conversationId?: string | null;
    channel: Channel;
    provider: string;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ claimed: boolean; id: string | null }> {
    assertTenantId(input.tenantId);
    if (this.needsTenantScope(input.tenantId)) {
      return this.withTenantScope<{ claimed: boolean; id: string | null }>(
        input.tenantId,
        (repo) => repo.claimOutboundDelivery(input),
      );
    }
    const [inserted] = await this.db
      .insert(messageDeliveries)
      .values({
        tenantId: input.tenantId,
        conversationId: input.conversationId ?? null,
        channel: input.channel,
        provider: input.provider,
        status: "pending",
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata ?? {},
      })
      .onConflictDoNothing({
        target: [messageDeliveries.tenantId, messageDeliveries.idempotencyKey],
      })
      .returning({ id: messageDeliveries.id });
    if (inserted) {
      return { claimed: true, id: inserted.id };
    }
    return { claimed: false, id: null };
  }

  /**
   * Record the outcome of a claimed outbound send on its intent row (see
   * claimOutboundDelivery): sets the terminal status, provider message id, links
   * the stored outbound message, and replaces the metadata with the final
   * routing/retry state so the delivery-retry worker can pick it up on failure.
   */
  async finalizeOutboundDelivery(input: {
    tenantId: string;
    deliveryId: string;
    messageId?: string | null;
    status: string;
    providerMessageId?: string | null;
    detail?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    assertTenantId(input.tenantId);
    if (this.needsTenantScope(input.tenantId)) {
      return this.withTenantScope<void>(input.tenantId, (repo) =>
        repo.finalizeOutboundDelivery(input),
      );
    }
    await this.db
      .update(messageDeliveries)
      .set({
        messageId: input.messageId ?? null,
        status: input.status,
        providerMessageId: input.providerMessageId ?? null,
        detail: input.detail ?? null,
        metadata: input.metadata ?? {},
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(messageDeliveries.tenantId, input.tenantId),
          eq(messageDeliveries.id, input.deliveryId),
        ),
      );
  }

  /**
   * Apply a provider delivery/read status callback to a stored delivery, matched
   * by provider message id within the tenant. Advances the lifecycle forwards
   * only (sent → delivered → read); a `failed` callback is a terminal async
   * rejection that is not auto-retried. Idempotent: a replayed, stale, or
   * out-of-order callback is a safe no-op. Returns whether a delivery matched
   * and whether its status actually moved.
   */
  async applyDeliveryStatusCallback(input: {
    tenantId: string;
    providerMessageId: string;
    status: "sent" | "delivered" | "read" | "failed";
    timestamp?: string | null;
    recipientId?: string | null;
    error?: { code?: number; title?: string; detail?: string } | null;
  }): Promise<{ matched: boolean; applied: boolean }> {
    assertTenantId(input.tenantId);
    if (this.needsTenantScope(input.tenantId)) {
      return this.withTenantScope<{ matched: boolean; applied: boolean }>(
        input.tenantId,
        (repo) => repo.applyDeliveryStatusCallback(input),
      );
    }
    const [delivery] = await this.db
      .select({
        id: messageDeliveries.id,
        status: messageDeliveries.status,
        detail: messageDeliveries.detail,
        metadata: messageDeliveries.metadata,
      })
      .from(messageDeliveries)
      .where(
        and(
          eq(messageDeliveries.tenantId, input.tenantId),
          eq(messageDeliveries.providerMessageId, input.providerMessageId),
        ),
      )
      .limit(1);
    if (!delivery) {
      return { matched: false, applied: false };
    }

    // "read" and "failed" are terminal — never move off them.
    if (delivery.status === "read" || delivery.status === "failed") {
      return { matched: true, applied: false };
    }
    // Success statuses advance forwards only; ignore a stale/duplicate callback.
    if (
      input.status !== "failed" &&
      deliveryStatusRank(input.status) <= deliveryStatusRank(delivery.status)
    ) {
      return { matched: true, applied: false };
    }

    const metadata = {
      ...((delivery.metadata ?? {}) as Record<string, unknown>),
    };
    const statusTimestamps = {
      ...((metadata.statusTimestamps as Record<string, unknown> | undefined) ??
        {}),
    };
    statusTimestamps[input.status] =
      input.timestamp ?? new Date().toISOString();
    metadata.statusTimestamps = statusTimestamps;
    if (input.recipientId) {
      metadata.recipientId = input.recipientId;
    }
    let detail = delivery.detail ?? null;
    if (input.status === "failed") {
      // A post-acceptance provider rejection is not auto-retried.
      metadata.retryable = false;
      if (input.error) {
        metadata.error = input.error;
        detail = input.error.detail ?? input.error.title ?? detail;
      }
    }

    await this.db
      .update(messageDeliveries)
      .set({
        status: input.status,
        detail,
        metadata,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(messageDeliveries.tenantId, input.tenantId),
          eq(messageDeliveries.id, delivery.id),
        ),
      );

    return { matched: true, applied: true };
  }

  /**
   * System-wide (cross-tenant) sweep used by the delivery-retry worker: find
   * failed, retry-eligible outbound deliveries whose last attempt is older than
   * `before` and that have not yet exhausted `maxAttempts`. Not tenant-scoped
   * because the worker runs as a trusted maintenance job across all tenants
   * (like retention cleanup); the re-send is still routed per-tenant.
   */
  async listRetryableDeliveries(options: {
    before: Date;
    maxAttempts: number;
    limit: number;
  }): Promise<RetryableDelivery[]> {
    const rows = await this.db
      .select({
        id: messageDeliveries.id,
        tenantId: messageDeliveries.tenantId,
        channel: messageDeliveries.channel,
        provider: messageDeliveries.provider,
        text: messages.content,
        metadata: messageDeliveries.metadata,
      })
      .from(messageDeliveries)
      .innerJoin(messages, eq(messageDeliveries.messageId, messages.id))
      .where(
        and(
          eq(messageDeliveries.status, "failed"),
          sql`(${messageDeliveries.metadata} ->> 'retryable') = 'true'`,
          sql`coalesce((${messageDeliveries.metadata} ->> 'attempts')::int, 0) < ${options.maxAttempts}`,
          lt(messageDeliveries.updatedAt, options.before),
        ),
      )
      .orderBy(messageDeliveries.updatedAt)
      .limit(options.limit);

    return rows.map((row) => {
      const metadata = (row.metadata ?? {}) as Record<string, unknown>;
      return {
        id: row.id,
        tenantId: row.tenantId,
        channel: row.channel as Channel,
        provider: row.provider,
        text: row.text ?? "",
        providerAccountId: readStringOrNull(metadata.providerAccountId),
        externalConversationId: readStringOrNull(
          metadata.externalConversationId,
        ),
        externalUserId: readStringOrNull(metadata.externalUserId),
        attempts: readAttempts(metadata.attempts),
      };
    });
  }

  /**
   * Record the outcome of a delivery-retry attempt. On success the delivery is
   * marked sent with the new provider message id; on failure the attempt
   * counter is incremented (and `retryable` cleared once exhausted, so the row
   * is not swept again). Always bumps `updatedAt` so the backoff window advances.
   */
  async applyDeliveryRetryOutcome(
    tenantId: string,
    deliveryId: string,
    outcome: {
      succeeded: boolean;
      attempts: number;
      exhausted?: boolean;
      providerMessageId?: string | null;
      detail?: string | null;
    },
  ): Promise<void> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope<void>(tenantId, (repo) =>
        repo.applyDeliveryRetryOutcome(tenantId, deliveryId, outcome),
      );
    }
    const [existing] = await this.db
      .select({ metadata: messageDeliveries.metadata })
      .from(messageDeliveries)
      .where(
        and(
          eq(messageDeliveries.tenantId, tenantId),
          eq(messageDeliveries.id, deliveryId),
        ),
      )
      .limit(1);
    const metadata = {
      ...((existing?.metadata ?? {}) as Record<string, unknown>),
    };
    metadata.attempts = outcome.attempts;
    if (outcome.succeeded) {
      metadata.retryable = false;
    } else if (outcome.exhausted) {
      // Stop sweeping a permanently-failed delivery, but keep it "failed" so it
      // still counts against the failure rate in analytics.
      metadata.retryable = false;
    }
    await this.db
      .update(messageDeliveries)
      .set({
        status: outcome.succeeded ? "sent" : "failed",
        providerMessageId: outcome.succeeded
          ? (outcome.providerMessageId ?? null)
          : undefined,
        detail: outcome.detail ?? null,
        metadata,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(messageDeliveries.tenantId, tenantId),
          eq(messageDeliveries.id, deliveryId),
        ),
      );
  }

  async listConversationMessages(
    tenantId: string,
    conversationId: string,
  ): Promise<MessageRecord[]> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope<MessageRecord[]>(tenantId, (repo) =>
        repo.listConversationMessages(tenantId, conversationId),
      );
    }
    return this.db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.tenantId, tenantId),
          eq(messages.conversationId, conversationId),
        ),
      )
      .orderBy(messages.createdAt);
  }

  /**
   * Update the human-takeover state of a conversation. Any field left undefined
   * is preserved. When `stampFirstHumanResponse` is true and no first human turn
   * has been recorded yet, `first_human_response_at` is set to now() so
   * first-response time can be measured from the first operator reply.
   */
  async setConversationHandling(input: {
    tenantId: string;
    conversationId: string;
    aiPaused?: boolean;
    assignedUserId?: string | null;
    stampFirstHumanResponse?: boolean;
  }): Promise<ConversationRecord | null> {
    assertTenantId(input.tenantId);
    if (this.needsTenantScope(input.tenantId)) {
      return this.withTenantScope<ConversationRecord | null>(
        input.tenantId,
        (repo) => repo.setConversationHandling(input),
      );
    }
    const patch: Partial<typeof conversations.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (input.aiPaused !== undefined) {
      patch.aiPaused = input.aiPaused;
    }
    if (input.assignedUserId !== undefined) {
      patch.assignedUserId = input.assignedUserId;
    }
    if (input.stampFirstHumanResponse) {
      // Only stamp the first human turn once; keep the original timestamp on
      // later replies so the metric reflects time-to-first-response.
      patch.firstHumanResponseAt =
        sql`coalesce(${conversations.firstHumanResponseAt}, now())` as unknown as Date;
    }
    const [updated] = await this.db
      .update(conversations)
      .set(patch)
      .where(
        and(
          eq(conversations.tenantId, input.tenantId),
          eq(conversations.id, input.conversationId),
        ),
      )
      .returning();
    return updated ?? null;
  }

  /**
   * Resolve everything an operator reply needs to reach the customer on the
   * conversation's channel: the conversation itself, the provider account id and
   * recipient recovered from the most recent inbound message, and when that
   * inbound arrived (for the Meta 24-hour customer-service window check).
   */
  async getConversationReplyContext(input: {
    tenantId: string;
    conversationId: string;
  }): Promise<{
    conversation: ConversationRecord;
    lastInboundAt: Date | null;
    providerAccountId: string | null;
    externalUserId: string | null;
    externalConversationId: string | null;
  } | null> {
    assertTenantId(input.tenantId);
    if (this.needsTenantScope(input.tenantId)) {
      return this.withTenantScope(input.tenantId, (repo) =>
        repo.getConversationReplyContext(input),
      );
    }
    const [conversation] = await this.db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.tenantId, input.tenantId),
          eq(conversations.id, input.conversationId),
        ),
      )
      .limit(1);
    if (!conversation) {
      return null;
    }
    const [lastInbound] = await this.db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.tenantId, input.tenantId),
          eq(messages.conversationId, input.conversationId),
          eq(messages.direction, "inbound"),
        ),
      )
      .orderBy(desc(messages.createdAt))
      .limit(1);
    const trace = (lastInbound?.trace ?? {}) as Record<string, unknown>;
    return {
      conversation,
      lastInboundAt: lastInbound?.createdAt ?? null,
      providerAccountId: readStringOrNull(trace.providerAccountId),
      externalUserId:
        conversation.externalUserId ?? readStringOrNull(trace.externalUserId),
      externalConversationId: readStringOrNull(trace.externalConversationId),
    };
  }

  /**
   * The operator ("human takeover") turns a website widget must render for a
   * visitor. Scoped by the opaque conversation public id the widget already
   * holds, and to a single tenant, so one visitor can only ever pull their own
   * conversation. Only outbound operator messages are returned — never inbound
   * or AI turns (the widget already has those) — and never message traces.
   */
  async listOperatorRepliesForWidget(input: {
    tenantId: string;
    conversationPublicId: string;
    since?: Date;
    limit: number;
  }): Promise<Array<{ id: string; text: string; createdAt: Date }>> {
    assertTenantId(input.tenantId);
    if (this.needsTenantScope(input.tenantId)) {
      return this.withTenantScope(input.tenantId, (repo) =>
        repo.listOperatorRepliesForWidget(input),
      );
    }
    const [conversation] = await this.db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          eq(conversations.tenantId, input.tenantId),
          eq(conversations.publicId, input.conversationPublicId),
          eq(conversations.channel, "website"),
        ),
      )
      .limit(1);
    if (!conversation) {
      return [];
    }
    const conditions = [
      eq(messages.tenantId, input.tenantId),
      eq(messages.conversationId, conversation.id),
      eq(messages.role, "operator"),
      eq(messages.direction, "outbound"),
    ];
    if (input.since) {
      conditions.push(gt(messages.createdAt, input.since));
    }
    const rows = await this.db
      .select({
        id: messages.id,
        text: messages.content,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(and(...conditions))
      .orderBy(messages.createdAt)
      .limit(Math.max(1, Math.min(input.limit, 100)));
    return rows;
  }

  async listConversations(
    tenantId: string,
    options?: PaginationOptions,
  ): Promise<ConversationRecord[]> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope<ConversationRecord[]>(tenantId, (repo) =>
        repo.listConversations(tenantId, options),
      );
    }
    const { limit, offset } = resolvePagination(options);
    const query = normalizeFullTextQuery(options);
    const status = normalizeListStatus(options);
    const filters: SQL[] = [eq(conversations.tenantId, tenantId)];
    if (status) {
      filters.push(eq(conversations.status, status));
    }
    if (query) {
      const searchQuery = sql`websearch_to_tsquery('simple'::regconfig, ${query})`;
      filters.push(
        sql`to_tsvector('simple'::regconfig, admin_conversation_search_text(${conversations.publicId}, ${conversations.channel}, ${conversations.externalUserId}, ${conversations.locale})) @@ ${searchQuery}`,
      );
    }
    return this.db
      .select()
      .from(conversations)
      .where(and(...filters))
      .orderBy(desc(conversations.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async getConversation(
    tenantId: string,
    conversationId: string,
  ): Promise<ConversationRecord | null> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope<ConversationRecord | null>(tenantId, (repo) =>
        repo.getConversation(tenantId, conversationId),
      );
    }
    const [conversation] = await this.db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.tenantId, tenantId),
          eq(conversations.id, conversationId),
        ),
      )
      .limit(1);
    return conversation ?? null;
  }

  async listUnifiedInbox(
    tenantId: string,
    options?: PaginationOptions,
  ): Promise<UnifiedInboxItem[]> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope<UnifiedInboxItem[]>(tenantId, (repo) =>
        repo.listUnifiedInbox(tenantId, options),
      );
    }
    const { limit, offset } = resolvePagination(options);
    const query = normalizeFullTextQuery(options);
    const status = normalizeListStatus(options);
    const filters: SQL[] = [eq(conversations.tenantId, tenantId)];
    if (status) {
      filters.push(eq(conversations.status, status));
    }
    if (query) {
      const searchQuery = sql`websearch_to_tsquery('simple'::regconfig, ${query})`;
      filters.push(
        sql`(
          to_tsvector('simple'::regconfig, admin_conversation_search_text(${conversations.publicId}, ${conversations.channel}, ${conversations.externalUserId}, ${conversations.locale})) @@ ${searchQuery}
          or to_tsvector('simple'::regconfig, admin_contact_search_text(${contacts.displayName}, ${contacts.email}, ${contacts.phone}, ${contacts.company}, ${contacts.identifiers})) @@ ${searchQuery}
        )`,
      );
    }
    const conversationRows = await this.db
      .select({
        conversation: conversations,
        contact: contacts,
      })
      .from(conversations)
      .leftJoin(
        conversationContacts,
        and(
          eq(conversationContacts.tenantId, conversations.tenantId),
          eq(conversationContacts.conversationId, conversations.id),
        ),
      )
      .leftJoin(
        contacts,
        and(
          eq(contacts.tenantId, tenantId),
          eq(contacts.id, conversationContacts.contactId),
        ),
      )
      .where(and(...filters))
      .orderBy(desc(conversations.updatedAt))
      .limit(limit)
      .offset(offset);

    const conversationIds = conversationRows.map((row) => row.conversation.id);
    if (conversationIds.length === 0) {
      return [];
    }

    const [recentMessages, messageCounts, openHandoffs] = await Promise.all([
      this.db
        .select({
          id: messages.id,
          conversationId: messages.conversationId,
          direction: messages.direction,
          role: messages.role,
          content: messages.content,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(
          and(
            eq(messages.tenantId, tenantId),
            inArray(messages.conversationId, conversationIds),
            sql`${messages.createdAt} = (
              select max(latest_messages.created_at)
              from messages latest_messages
              where latest_messages.tenant_id = ${tenantId}
                and latest_messages.conversation_id = ${messages.conversationId}
            )`,
          ),
        )
        .orderBy(desc(messages.createdAt)),
      this.db
        .select({
          conversationId: messages.conversationId,
          total: sql<number>`count(*)::int`,
        })
        .from(messages)
        .where(
          and(
            eq(messages.tenantId, tenantId),
            inArray(messages.conversationId, conversationIds),
          ),
        )
        .groupBy(messages.conversationId),
      this.db
        .select()
        .from(handoffRequests)
        .where(
          and(
            eq(handoffRequests.tenantId, tenantId),
            inArray(handoffRequests.conversationId, conversationIds),
            or(
              eq(handoffRequests.status, "open"),
              eq(handoffRequests.status, "in_progress"),
            ),
          ),
        ),
    ]);

    const lastMessageByConversation = new Map<
      string,
      (typeof recentMessages)[number]
    >();
    const messageCountByConversation = new Map<string, number>();
    for (const message of recentMessages) {
      if (!lastMessageByConversation.has(message.conversationId)) {
        lastMessageByConversation.set(message.conversationId, message);
      }
    }
    for (const item of messageCounts) {
      messageCountByConversation.set(item.conversationId, item.total);
    }

    const handoffsByConversation = new Map<string, typeof openHandoffs>();
    for (const handoff of openHandoffs) {
      if (!handoff.conversationId) {
        continue;
      }
      const items = handoffsByConversation.get(handoff.conversationId) ?? [];
      items.push(handoff);
      handoffsByConversation.set(handoff.conversationId, items);
    }

    return conversationRows.map(({ conversation, contact }) => {
      const lastMessage = lastMessageByConversation.get(conversation.id);
      const handoffs = handoffsByConversation.get(conversation.id) ?? [];
      return {
        id: conversation.id,
        publicId: conversation.publicId,
        channel: conversation.channel,
        status: conversation.status,
        locale: conversation.locale,
        externalUserId: conversation.externalUserId,
        summary: conversation.summary,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        contact,
        lastMessage: lastMessage
          ? {
              id: lastMessage.id,
              direction: lastMessage.direction,
              role: lastMessage.role,
              content: lastMessage.content,
              createdAt: lastMessage.createdAt,
            }
          : null,
        messageCount: messageCountByConversation.get(conversation.id) ?? 0,
        openHandoffs: handoffs.map((handoff) => ({
          id: handoff.id,
          reason: handoff.reason,
          status: handoff.status,
          assignedTo: handoff.assignedTo,
          createdAt: handoff.createdAt,
        })),
        nextAction: deriveConversationNextAction(
          conversation.channel,
          handoffs,
        ),
      };
    });
  }

  async listContacts(
    tenantId: string,
    options?: PaginationOptions,
  ): Promise<ContactRecord[]> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope<ContactRecord[]>(tenantId, (repo) =>
        repo.listContacts(tenantId, options),
      );
    }
    const { limit, offset } = resolvePagination(options);
    const query = normalizeFullTextQuery(options);
    const filters: SQL[] = [eq(contacts.tenantId, tenantId)];
    if (query) {
      const searchQuery = sql`websearch_to_tsquery('simple'::regconfig, ${query})`;
      filters.push(
        sql`to_tsvector('simple'::regconfig, admin_contact_search_text(${contacts.displayName}, ${contacts.email}, ${contacts.phone}, ${contacts.company}, ${contacts.identifiers})) @@ ${searchQuery}`,
      );
    }
    return this.db
      .select()
      .from(contacts)
      .where(and(...filters))
      .orderBy(desc(contacts.updatedAt))
      .limit(limit)
      .offset(offset);
  }

  async getContact(
    tenantId: string,
    contactId: string,
  ): Promise<ContactRecord | null> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope<ContactRecord | null>(tenantId, (repo) =>
        repo.getContact(tenantId, contactId),
      );
    }
    const [contact] = await this.db
      .select()
      .from(contacts)
      .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, contactId)))
      .limit(1);
    return contact ?? null;
  }

  async listHandoffs(
    tenantId: string,
    options?: PaginationOptions,
  ): Promise<HandoffRecord[]> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope<HandoffRecord[]>(tenantId, (repo) =>
        repo.listHandoffs(tenantId, options),
      );
    }
    const { limit, offset } = resolvePagination(options);
    const query = normalizeFullTextQuery(options);
    const status = normalizeListStatus(options);
    const filters: SQL[] = [eq(handoffRequests.tenantId, tenantId)];
    if (status) {
      filters.push(eq(handoffRequests.status, status));
    }
    if (query) {
      const searchQuery = sql`websearch_to_tsquery('simple'::regconfig, ${query})`;
      filters.push(
        sql`to_tsvector('simple'::regconfig, admin_handoff_search_text(${handoffRequests.reason}, ${handoffRequests.requesterMessage}, ${handoffRequests.channel}, ${handoffRequests.assignedTo}, ${handoffRequests.metadata})) @@ ${searchQuery}`,
      );
    }
    return this.db
      .select()
      .from(handoffRequests)
      .where(and(...filters))
      .orderBy(desc(handoffRequests.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async updateHandoff(
    tenantId: string,
    handoffId: string,
    input: {
      status?: "open" | "in_progress" | "resolved" | "dismissed" | undefined;
      assignedTo?: string | null | undefined;
      pipelineStage?:
        | "new"
        | "contacted"
        | "qualified"
        | "proposal"
        | "won"
        | "lost"
        | undefined;
      note?: string | undefined;
      // Answer the employee gave the customer while resolving. Captured as a
      // `human_reply` learning suggestion (subject to review) so the shared
      // brain improves from staff answers across every channel.
      resolutionAnswer?: string | undefined;
    },
  ): Promise<HandoffRecord> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope<HandoffRecord>(tenantId, (repo) =>
        repo.updateHandoff(tenantId, handoffId, input),
      );
    }
    const [existing] = await this.db
      .select()
      .from(handoffRequests)
      .where(
        and(
          eq(handoffRequests.tenantId, tenantId),
          eq(handoffRequests.id, handoffId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new Error("Handoff request not found.");
    }

    const values: {
      status?: "open" | "in_progress" | "resolved" | "dismissed";
      assignedTo?: string | null;
      metadata?: Record<string, unknown>;
      updatedAt: SQL;
    } = {
      updatedAt: sql`now()`,
    };

    if (input.status) {
      values.status = input.status;
    }
    if ("assignedTo" in input) {
      values.assignedTo = input.assignedTo ?? null;
    }
    if (input.pipelineStage || input.note) {
      const metadata = {
        ...(existing.metadata ?? {}),
      };
      if (input.pipelineStage) {
        metadata.pipelineStage = input.pipelineStage;
        metadata.pipelineUpdatedAt = new Date().toISOString();
      }
      if (input.note) {
        const notes = Array.isArray(metadata.notes) ? metadata.notes : [];
        metadata.notes = [
          ...notes,
          {
            body: input.note,
            createdAt: new Date().toISOString(),
          },
        ];
      }
      values.metadata = metadata;
    }

    const [handoff] = await this.db
      .update(handoffRequests)
      .set(values)
      .where(
        and(
          eq(handoffRequests.tenantId, tenantId),
          eq(handoffRequests.id, handoffId),
        ),
      )
      .returning();

    if (!handoff) {
      throw new Error("Handoff request not found.");
    }

    await this.audit(
      tenantId,
      "handoff.updated",
      "handoff_request",
      handoffId,
      {
        status: handoff.status,
        assignedTo: handoff.assignedTo,
      },
    );

    // Learn from the employee's answer. Prefer an explicit resolutionAnswer;
    // otherwise treat the note supplied while resolving as the answer. Only when
    // the handoff ends up resolved. Best-effort: a failure here must never break
    // resolving the handoff, and the suggestion still needs human approval
    // before it reaches the brain.
    const resolutionAnswer =
      input.resolutionAnswer?.trim() ||
      (handoff.status === "resolved" ? input.note?.trim() : "") ||
      "";
    if (handoff.status === "resolved" && resolutionAnswer) {
      try {
        await this.captureHumanReplyFromHandoff(
          tenantId,
          handoff,
          resolutionAnswer,
          Boolean(!input.resolutionAnswer?.trim() && input.note?.trim()),
        );
      } catch (error) {
        console.warn(
          `[knowledge-learning] failed to capture human reply for handoff ${handoff.id}`,
          error,
        );
      }
    }

    return handoff;
  }

  /**
   * Turn an employee's resolution answer into a `human_reply` knowledge
   * suggestion pairing the original customer question with the staff answer.
   * Deduped per handoff so repeated edits don't stack duplicates. The suggestion
   * lands in the review queue (status "pending") — it never becomes live
   * knowledge without a human approving it, which keeps the refusal guardrail
   * intact.
   */
  private async captureHumanReplyFromHandoff(
    tenantId: string,
    handoff: HandoffRecord,
    answer: string,
    answeredFromNote: boolean,
  ): Promise<void> {
    if (!isLearningHandoffReason(handoff.reason)) {
      return;
    }
    const question = normalizeKnowledgeText(handoff.requesterMessage);
    const normalizedAnswer = normalizeKnowledgeText(answer);
    if (!isMeaningfulQuestion(question) || normalizedAnswer.length < 2) {
      return;
    }

    const [existing] = await this.db
      .select({ id: knowledgeSuggestions.id })
      .from(knowledgeSuggestions)
      .where(
        and(
          eq(knowledgeSuggestions.tenantId, tenantId),
          eq(knowledgeSuggestions.sourceType, "human_reply"),
          sql`${knowledgeSuggestions.suggestedMetadata}->>'handoffId' = ${handoff.id}`,
        ),
      )
      .limit(1);
    if (existing) {
      return;
    }

    await this.createKnowledgeSuggestion(tenantId, {
      sourceType: "human_reply",
      sourceConversationId: handoff.conversationId ?? null,
      suggestedQuestion: question,
      suggestedTitle: question,
      suggestedAnswer: normalizedAnswer,
      suggestedTags: ["learned", "human_reply", handoff.channel].filter(
        Boolean,
      ),
      suggestedMetadata: {
        handoffId: handoff.id,
        handoffReason: handoff.reason,
        channel: handoff.channel,
        answeredBy: handoff.assignedTo ?? null,
        answeredFromNote,
      },
      confidence: 0.8,
    });
  }

  async createHandoff(input: HandoffInput): Promise<HandoffRecord> {
    assertTenantId(input.tenantId);
    if (this.needsTenantScope(input.tenantId)) {
      return this.withTenantScope<HandoffRecord>(input.tenantId, (repo) =>
        repo.createHandoff(input),
      );
    }
    const metadata =
      input.reason === "lead_capture" || input.reason === "readiness_assessment"
        ? { pipelineStage: "new", ...(input.metadata ?? {}) }
        : (input.metadata ?? {});

    const [handoff] = await this.db
      .insert(handoffRequests)
      .values({
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        channel: input.channel,
        reason: input.reason,
        requesterMessage: input.message,
        metadata,
      })
      .returning();

    if (!handoff) {
      throw new Error("Failed to create handoff request.");
    }

    return handoff;
  }

  /**
   * Atomically run the website lead / readiness write flow:
   * find-or-create conversation -> enrich contact -> store message -> create
   * handoff. Wrapping these in one transaction means a partial failure rolls
   * back instead of leaving an orphan conversation/message without a handoff.
   *
   * Idempotency (item 5): when `idempotencyKey` is supplied, a retry that hits
   * the partial unique index on (tenant, conversation, key) reuses the existing
   * handoff instead of creating a duplicate (insert ... on conflict do nothing,
   * then select). When no key is supplied the behaviour is identical to the
   * previous sequential code path. Returns the conversation plus the handoff so
   * the caller can still send notifications / log usage outside the tx.
   */
  async captureWebsiteLead(input: {
    tenantId: string;
    channel: Channel;
    locale?: string;
    publicConversationId?: string;
    externalUserId?: string;
    contact: ContactProfileInput;
    message: string;
    trace?: Record<string, unknown>;
    reason: string;
    handoffMetadata?: Record<string, unknown>;
    idempotencyKey?: string | null;
  }): Promise<{
    conversation: ConversationRecord;
    handoff: typeof handoffRequests.$inferSelect | undefined;
  }> {
    assertTenantId(input.tenantId);
    if (this.needsTenantScope(input.tenantId)) {
      return this.withTenantScope(input.tenantId, (repo) =>
        repo.captureWebsiteLead(input),
      );
    }
    return this.withTransaction(async (repo) => {
      const conversationInput: Parameters<
        TenantRepository["findOrCreateConversation"]
      >[0] = {
        tenantId: input.tenantId,
        channel: input.channel,
      };
      if (input.locale !== undefined) {
        conversationInput.locale = input.locale;
      }
      if (input.publicConversationId !== undefined) {
        conversationInput.publicConversationId = input.publicConversationId;
      }
      if (input.externalUserId !== undefined) {
        conversationInput.externalUserId = input.externalUserId;
      }

      const conversation =
        await repo.findOrCreateConversation(conversationInput);

      await repo.enrichConversationContact({
        tenantId: input.tenantId,
        conversationId: conversation.id,
        channel: input.channel,
        externalUserId: input.externalUserId ?? null,
        contact: input.contact,
      });

      await repo.addMessage({
        tenantId: input.tenantId,
        conversationId: conversation.id,
        channel: input.channel,
        direction: "inbound",
        role: "user",
        content: input.message,
        ...(input.trace ? { trace: input.trace } : {}),
      });

      const handoff = await repo.createHandoffIdempotent({
        tenantId: input.tenantId,
        conversationId: conversation.id,
        channel: input.channel,
        reason: input.reason,
        message: input.message,
        ...(input.handoffMetadata ? { metadata: input.handoffMetadata } : {}),
        idempotencyKey: input.idempotencyKey ?? null,
      });

      return { conversation, handoff };
    });
  }

  /**
   * Like {@link createHandoff} but dedupes on `idempotencyKey` when present. A
   * concurrent or retried call with the same (tenant, conversation, key) reuses
   * the row created first via `on conflict do nothing` + select. With a null key
   * it behaves exactly like {@link createHandoff}.
   */
  private async createHandoffIdempotent(input: {
    tenantId: string;
    conversationId: string;
    channel: Channel;
    reason: string;
    message: string;
    metadata?: Record<string, unknown>;
    idempotencyKey?: string | null;
  }): Promise<typeof handoffRequests.$inferSelect | undefined> {
    const metadata =
      input.reason === "lead_capture" || input.reason === "readiness_assessment"
        ? { pipelineStage: "new", ...(input.metadata ?? {}) }
        : (input.metadata ?? {});

    const key = input.idempotencyKey ?? null;

    if (!key) {
      const [handoff] = await this.db
        .insert(handoffRequests)
        .values({
          tenantId: input.tenantId,
          conversationId: input.conversationId,
          channel: input.channel,
          reason: input.reason,
          requesterMessage: input.message,
          metadata,
        })
        .returning();
      return handoff;
    }

    const [inserted] = await this.db
      .insert(handoffRequests)
      .values({
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        channel: input.channel,
        reason: input.reason,
        requesterMessage: input.message,
        metadata,
        idempotencyKey: key,
      })
      .onConflictDoNothing({
        target: [
          handoffRequests.tenantId,
          handoffRequests.conversationId,
          handoffRequests.idempotencyKey,
        ],
      })
      .returning();

    if (inserted) {
      return inserted;
    }

    // A row with this key already existed (retry): return it instead of a dup.
    const [existing] = await this.db
      .select()
      .from(handoffRequests)
      .where(
        and(
          eq(handoffRequests.tenantId, input.tenantId),
          eq(handoffRequests.conversationId, input.conversationId),
          eq(handoffRequests.idempotencyKey, key),
        ),
      )
      .limit(1);

    return existing;
  }

  async logUsage(input: {
    tenantId: string;
    channel: Channel;
    eventType: string;
    credits: number;
    estimatedCostCents?: number;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    assertTenantId(input.tenantId);
    if (this.needsTenantScope(input.tenantId)) {
      return this.withTenantScope<void>(input.tenantId, (repo) =>
        repo.logUsage(input),
      );
    }
    await this.db.insert(usageEvents).values({
      tenantId: input.tenantId,
      channel: input.channel,
      eventType: input.eventType,
      credits: input.credits,
      estimatedCostCents: input.estimatedCostCents ?? 0,
      metadata: input.metadata ?? {},
    });
  }

  async recordBillableAcceptedCall(input: {
    tenantId: string;
    providerCallId: string;
    sourceUsageEventId?: string | null | undefined;
    quantity?: number | undefined;
    unitAmountCents?: number | undefined;
    metadata?: Record<string, unknown> | undefined;
  }): Promise<{ event: BillableUsageEventRecord; duplicate: boolean }> {
    assertTenantId(input.tenantId);
    if (this.needsTenantScope(input.tenantId)) {
      return this.withTenantScope(input.tenantId, (repo) =>
        repo.recordBillableAcceptedCall(input),
      );
    }

    const providerCallId = input.providerCallId.trim();
    if (!providerCallId) {
      throw new Error("providerCallId is required.");
    }

    const [inserted] = await this.db
      .insert(billableUsageEvents)
      .values({
        tenantId: input.tenantId,
        providerCallId,
        sourceUsageEventId: input.sourceUsageEventId ?? null,
        channel: "telephone",
        eventType: "accepted_call",
        quantity: input.quantity ?? 1,
        unitAmountCents: input.unitAmountCents ?? 10,
        metadata: input.metadata ?? {},
      })
      .onConflictDoNothing({
        target: [
          billableUsageEvents.tenantId,
          billableUsageEvents.providerCallId,
        ],
      })
      .returning();

    if (inserted) {
      return { event: inserted, duplicate: false };
    }

    const [existing] = await this.db
      .select()
      .from(billableUsageEvents)
      .where(
        and(
          eq(billableUsageEvents.tenantId, input.tenantId),
          eq(billableUsageEvents.providerCallId, providerCallId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new Error("Failed to record billable usage event.");
    }
    return { event: existing, duplicate: true };
  }

  async markBillableUsageReported(
    tenantId: string,
    eventId: string,
    stripeMeterEventId: string,
  ): Promise<void> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope(tenantId, (repo) =>
        repo.markBillableUsageReported(tenantId, eventId, stripeMeterEventId),
      );
    }
    await this.db
      .update(billableUsageEvents)
      .set({
        status: "reported",
        stripeMeterEventId,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(billableUsageEvents.tenantId, tenantId),
          eq(billableUsageEvents.id, eventId),
        ),
      );
  }

  async markBillableUsageFailed(
    tenantId: string,
    eventId: string,
    detail: string,
  ): Promise<void> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope(tenantId, (repo) =>
        repo.markBillableUsageFailed(tenantId, eventId, detail),
      );
    }
    const [existing] = await this.db
      .select()
      .from(billableUsageEvents)
      .where(
        and(
          eq(billableUsageEvents.tenantId, tenantId),
          eq(billableUsageEvents.id, eventId),
        ),
      )
      .limit(1);
    if (!existing) {
      return;
    }
    await this.db
      .update(billableUsageEvents)
      .set({
        status: "failed",
        metadata: {
          ...(existing.metadata ?? {}),
          reportError: detail,
        },
        updatedAt: sql`now()`,
      })
      .where(eq(billableUsageEvents.id, eventId));
  }

  async getTenantAnalytics(
    tenantId: string,
    options: { windowDays?: number } = {},
  ): Promise<TenantAnalyticsResult> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope<TenantAnalyticsResult>(tenantId, (repo) =>
        repo.getTenantAnalytics(tenantId, options),
      );
    }
    const windowDays =
      Number.isInteger(options.windowDays) && (options.windowDays ?? 0) > 0
        ? (options.windowDays as number)
        : 30;
    const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const [
      [conversationStats],
      [messageStats],
      [knowledgeStats],
      [openHandoffStats],
      [totalHandoffStats],
      [leadStats],
      [contactStats],
      usageByStatus,
      deliveryStatusRows,
      channelRows,
      [voiceStats],
      [windowConversationStats],
      [windowMessageStats],
      [windowHandoffStats],
    ] = await Promise.all([
      this.db
        .select({
          total: sql<number>`count(*)::int`,
          lastAt: sql<string | null>`max(${conversations.createdAt})`,
        })
        .from(conversations)
        .where(eq(conversations.tenantId, tenantId)),
      this.db
        .select({
          total: sql<number>`count(*)::int`,
          lastAt: sql<string | null>`max(${messages.createdAt})`,
        })
        .from(messages)
        .where(eq(messages.tenantId, tenantId)),
      this.db
        .select({
          total: sql<number>`count(*)::int`,
        })
        .from(knowledgeChunks)
        .where(
          and(
            eq(knowledgeChunks.tenantId, tenantId),
            eq(knowledgeChunks.status, "approved"),
          ),
        ),
      this.db
        .select({
          total: sql<number>`count(*)::int`,
        })
        .from(handoffRequests)
        .where(
          and(
            eq(handoffRequests.tenantId, tenantId),
            eq(handoffRequests.status, "open"),
          ),
        ),
      this.db
        .select({
          total: sql<number>`count(*)::int`,
        })
        .from(handoffRequests)
        .where(eq(handoffRequests.tenantId, tenantId)),
      // Lead-capture / readiness-assessment handoffs = captured leads. Mirrors
      // the admin client's `leadHandoffs` filter so the aggregate lead count
      // matches what a content-privileged member would derive from the list.
      this.db
        .select({
          total: sql<number>`count(*)::int`,
        })
        .from(handoffRequests)
        .where(
          and(
            eq(handoffRequests.tenantId, tenantId),
            inArray(handoffRequests.reason, [
              "lead_capture",
              "readiness_assessment",
            ]),
          ),
        ),
      this.db
        .select({
          total: sql<number>`count(*)::int`,
        })
        .from(contacts)
        .where(eq(contacts.tenantId, tenantId)),
      this.db
        .select({
          eventType: usageEvents.eventType,
          total: sql<number>`count(*)::int`,
          credits: sql<number>`coalesce(sum(${usageEvents.credits}), 0)::int`,
        })
        .from(usageEvents)
        .where(eq(usageEvents.tenantId, tenantId))
        .groupBy(usageEvents.eventType),
      this.db
        .select({
          status: messageDeliveries.status,
          total: sql<number>`count(*)::int`,
        })
        .from(messageDeliveries)
        .where(eq(messageDeliveries.tenantId, tenantId))
        .groupBy(messageDeliveries.status),
      // Per-channel message volume, split by direction.
      this.db
        .select({
          channel: messages.channel,
          direction: messages.direction,
          total: sql<number>`count(*)::int`,
        })
        .from(messages)
        .where(eq(messages.tenantId, tenantId))
        .groupBy(messages.channel, messages.direction),
      // Telephone voice metrics.
      this.db
        .select({
          calls: sql<number>`count(*)::int`,
          completed: sql<number>`count(*) filter (where ${calls.status} = 'completed' or ${calls.endedAt} is not null)::int`,
          avgDurationSeconds: sql<
            number | null
          >`avg(extract(epoch from (${calls.endedAt} - ${calls.startedAt})))::float`,
          lastCallAt: sql<string | null>`max(${calls.startedAt})`,
        })
        .from(calls)
        .where(eq(calls.tenantId, tenantId)),
      // Recent-window activity: conversations, messages, and handoffs created
      // within the rolling window.
      this.db
        .select({ total: sql<number>`count(*)::int` })
        .from(conversations)
        .where(
          and(
            eq(conversations.tenantId, tenantId),
            gte(conversations.createdAt, windowStart),
          ),
        ),
      this.db
        .select({ total: sql<number>`count(*)::int` })
        .from(messages)
        .where(
          and(
            eq(messages.tenantId, tenantId),
            gte(messages.createdAt, windowStart),
          ),
        ),
      this.db
        .select({ total: sql<number>`count(*)::int` })
        .from(handoffRequests)
        .where(
          and(
            eq(handoffRequests.tenantId, tenantId),
            gte(handoffRequests.createdAt, windowStart),
          ),
        ),
    ]);

    const deliveryByStatus = deliveryStatusRows.reduce(
      (acc, row) => {
        acc[row.status] = (acc[row.status] ?? 0) + row.total;
        return acc;
      },
      {} as Record<string, number>,
    );
    const deliveriesTotal = Object.values(deliveryByStatus).reduce(
      (sum, value) => sum + value,
      0,
    );
    const deliveriesSent =
      (deliveryByStatus.sent ?? 0) +
      (deliveryByStatus.queued ?? 0) +
      // A provider status callback advances a sent delivery to delivered/read;
      // both are successful outcomes, not failures.
      (deliveryByStatus.delivered ?? 0) +
      (deliveryByStatus.read ?? 0);
    const deliveriesFailed = deliveryByStatus.failed ?? 0;
    const deliveriesSkipped = deliveryByStatus.skipped ?? 0;

    const channelTotals = new Map<
      string,
      { inbound: number; outbound: number }
    >();
    for (const row of channelRows) {
      const entry = channelTotals.get(row.channel) ?? {
        inbound: 0,
        outbound: 0,
      };
      if (row.direction === "inbound") {
        entry.inbound += row.total;
      } else if (row.direction === "outbound") {
        entry.outbound += row.total;
      }
      channelTotals.set(row.channel, entry);
    }
    const byChannel = Array.from(channelTotals.entries())
      .map(([channel, counts]) => ({
        channel,
        inbound: counts.inbound,
        outbound: counts.outbound,
        total: counts.inbound + counts.outbound,
      }))
      .sort((a, b) => b.total - a.total);

    const quality = deriveQualityMetrics(usageByStatus);

    return {
      conversations: conversationStats?.total ?? 0,
      messages: messageStats?.total ?? 0,
      approvedKnowledge: knowledgeStats?.total ?? 0,
      openHandoffs: openHandoffStats?.total ?? 0,
      totalHandoffs: totalHandoffStats?.total ?? 0,
      leads: leadStats?.total ?? 0,
      contacts: contactStats?.total ?? 0,
      lastConversationAt: toAggregateDate(conversationStats?.lastAt),
      lastMessageAt: toAggregateDate(messageStats?.lastAt),
      usageByStatus,
      deliveries: {
        total: deliveriesTotal,
        sent: deliveriesSent,
        failed: deliveriesFailed,
        skipped: deliveriesSkipped,
        other:
          deliveriesTotal -
          deliveriesSent -
          deliveriesFailed -
          deliveriesSkipped,
        // Failure rate over deliveries we actually attempted (exclude
        // intentional skips) so a channel with only skips reads as 0%, not NaN.
        failureRate: (() => {
          const attempted = deliveriesSent + deliveriesFailed;
          return attempted === 0
            ? 0
            : Math.round((deliveriesFailed / attempted) * 1000) / 1000;
        })(),
      },
      quality,
      byChannel,
      voice: {
        calls: voiceStats?.calls ?? 0,
        completed: voiceStats?.completed ?? 0,
        avgDurationSeconds:
          voiceStats?.avgDurationSeconds != null
            ? Math.round(voiceStats.avgDurationSeconds)
            : null,
        lastCallAt: toAggregateDate(voiceStats?.lastCallAt),
      },
      window: {
        days: windowDays,
        conversations: windowConversationStats?.total ?? 0,
        messages: windowMessageStats?.total ?? 0,
        handoffs: windowHandoffStats?.total ?? 0,
      },
    };
  }

  /**
   * Platform-operator overview: cross-tenant aggregate counts and delivery
   * health with NO personal data. Intended for the platform admin console so an
   * operator can watch load and failures across all tenants without being able
   * to read any tenant's messages or contacts (the R4 boundary). Not
   * tenant-scoped — it is a system-level aggregate like {@link listTenants}.
   */
  async getPlatformOverview(): Promise<PlatformOverviewResult> {
    const [
      [tenantStats],
      [conversationStats],
      [messageStats],
      [contactStats],
      [callStats],
      [openHandoffStats],
      deliveryStatusRows,
    ] = await Promise.all([
      this.db
        .select({
          total: sql<number>`count(*)::int`,
          active: sql<number>`count(*) filter (where ${tenants.status} = 'active')::int`,
        })
        .from(tenants),
      this.db.select({ total: sql<number>`count(*)::int` }).from(conversations),
      this.db.select({ total: sql<number>`count(*)::int` }).from(messages),
      this.db.select({ total: sql<number>`count(*)::int` }).from(contacts),
      this.db.select({ total: sql<number>`count(*)::int` }).from(calls),
      this.db
        .select({ total: sql<number>`count(*)::int` })
        .from(handoffRequests)
        .where(eq(handoffRequests.status, "open")),
      this.db
        .select({
          status: messageDeliveries.status,
          total: sql<number>`count(*)::int`,
        })
        .from(messageDeliveries)
        .groupBy(messageDeliveries.status),
    ]);

    const deliveryByStatus = deliveryStatusRows.reduce(
      (acc, row) => {
        acc[row.status] = (acc[row.status] ?? 0) + row.total;
        return acc;
      },
      {} as Record<string, number>,
    );
    const deliveriesTotal = Object.values(deliveryByStatus).reduce(
      (sum, value) => sum + value,
      0,
    );
    const deliveriesFailed = deliveryByStatus.failed ?? 0;
    const deliveriesSent =
      (deliveryByStatus.sent ?? 0) +
      (deliveryByStatus.queued ?? 0) +
      // A provider status callback advances a sent delivery to delivered/read;
      // both are successful outcomes, not failures.
      (deliveryByStatus.delivered ?? 0) +
      (deliveryByStatus.read ?? 0);
    const attempted = deliveriesSent + deliveriesFailed;

    return {
      tenants: {
        total: tenantStats?.total ?? 0,
        active: tenantStats?.active ?? 0,
      },
      totals: {
        conversations: conversationStats?.total ?? 0,
        messages: messageStats?.total ?? 0,
        contacts: contactStats?.total ?? 0,
        calls: callStats?.total ?? 0,
      },
      deliveries: {
        total: deliveriesTotal,
        failed: deliveriesFailed,
        failureRate:
          attempted === 0
            ? 0
            : Math.round((deliveriesFailed / attempted) * 1000) / 1000,
      },
      openHandoffs: openHandoffStats?.total ?? 0,
    };
  }

  async listWhatsappTemplates(
    tenantId: string,
  ): Promise<WhatsappTemplateRecord[]> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope<WhatsappTemplateRecord[]>(tenantId, (repo) =>
        repo.listWhatsappTemplates(tenantId),
      );
    }
    return this.db
      .select()
      .from(whatsappTemplates)
      .where(eq(whatsappTemplates.tenantId, tenantId))
      .orderBy(desc(whatsappTemplates.updatedAt));
  }

  async upsertWhatsappTemplate(
    tenantId: string,
    input: WhatsappTemplateInput,
  ): Promise<WhatsappTemplateRecord> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope<WhatsappTemplateRecord>(tenantId, (repo) =>
        repo.upsertWhatsappTemplate(tenantId, input),
      );
    }
    const values = {
      tenantId,
      name: normalizeTemplateName(input.name),
      language: input.language ?? "de",
      category: input.category ?? "utility",
      status: input.status ?? "draft",
      body: input.body,
      variables: input.variables ?? extractTemplateVariables(input.body),
      providerTemplateId: input.providerTemplateId ?? null,
      metadata: input.metadata ?? {},
      updatedAt: sql`now()`,
    };

    const [template] = await this.db
      .insert(whatsappTemplates)
      .values(values)
      .onConflictDoUpdate({
        target: [
          whatsappTemplates.tenantId,
          whatsappTemplates.name,
          whatsappTemplates.language,
        ],
        set: {
          category: values.category,
          status: values.status,
          body: values.body,
          variables: values.variables,
          providerTemplateId: values.providerTemplateId,
          metadata: values.metadata,
          updatedAt: sql`now()`,
        },
      })
      .returning();

    if (!template) {
      throw new Error("Failed to save WhatsApp template.");
    }

    await this.audit(
      tenantId,
      "whatsapp_template.saved",
      "whatsapp_template",
      template.id,
      {
        name: template.name,
        language: template.language,
        status: template.status,
      },
    );

    return template;
  }

  async getWhatsappCompliance(
    tenantId: string,
  ): Promise<WhatsappComplianceResult> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope<WhatsappComplianceResult>(tenantId, (repo) =>
        repo.getWhatsappCompliance(tenantId),
      );
    }
    const [recentInbound, templates, deliveries] = await Promise.all([
      this.db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.tenantId, tenantId),
            eq(messages.channel, "whatsapp"),
            eq(messages.direction, "inbound"),
          ),
        )
        .orderBy(desc(messages.createdAt))
        .limit(20),
      this.listWhatsappTemplates(tenantId),
      this.db
        .select()
        .from(messageDeliveries)
        .where(
          and(
            eq(messageDeliveries.tenantId, tenantId),
            eq(messageDeliveries.channel, "whatsapp"),
          ),
        )
        .orderBy(desc(messageDeliveries.createdAt))
        .limit(20),
    ]);
    const lastInbound = recentInbound[0];
    const lastInboundAt = lastInbound?.createdAt ?? null;
    const windowClosesAt = lastInboundAt
      ? new Date(lastInboundAt.getTime() + 24 * 60 * 60 * 1000)
      : null;
    const now = Date.now();

    return {
      lastInboundAt,
      windowClosesAt,
      canUseFreeformReply: Boolean(
        windowClosesAt && windowClosesAt.getTime() > now,
      ),
      templates: {
        total: templates.length,
        approved: templates.filter((template) => template.status === "approved")
          .length,
        draft: templates.filter((template) => template.status === "draft")
          .length,
        needsAttention: templates.filter((template) =>
          ["rejected", "paused"].includes(template.status),
        ).length,
      },
      recentDeliveries: deliveries.map((delivery) => ({
        id: delivery.id,
        providerMessageId: delivery.providerMessageId,
        status: delivery.status,
        detail: delivery.detail,
        createdAt: delivery.createdAt,
      })),
    };
  }

  /**
   * GDPR data-subject export: every tenant-owned record we hold, scoped to the
   * tenant. The shape is additive — existing keys are preserved so callers that
   * only read `conversations`/`contacts` keep working — but it now also includes
   * conversation messages (the obvious previous omission) plus the other
   * tenant-scoped personal-data tables (deliveries, contacts already present,
   * WhatsApp templates) so the export is actually complete.
   */
  async exportTenantData(tenantId: string): Promise<TenantExportData> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope<TenantExportData>(tenantId, (repo) =>
        repo.exportTenantData(tenantId),
      );
    }
    const [
      tenant,
      knowledge,
      tenantConversations,
      tenantMessages,
      handoffs,
      tenantContacts,
      deliveries,
      templates,
      onboardingAnswers,
      suggestions,
      ingestionJobs,
      tenantCalls,
      tenantCallTranscripts,
      webhookEvents,
      usage,
      audit,
    ] = await Promise.all([
      this.getTenant(tenantId),
      this.listKnowledge(tenantId),
      this.db
        .select()
        .from(conversations)
        .where(eq(conversations.tenantId, tenantId)),
      // Messages were previously omitted entirely — the bulk of the personal
      // data in a conversation. Exported tenant-scoped and ordered.
      this.db
        .select()
        .from(messages)
        .where(eq(messages.tenantId, tenantId))
        .orderBy(messages.createdAt),
      this.db
        .select()
        .from(handoffRequests)
        .where(eq(handoffRequests.tenantId, tenantId)),
      this.listContacts(tenantId),
      this.db
        .select()
        .from(messageDeliveries)
        .where(eq(messageDeliveries.tenantId, tenantId)),
      this.listWhatsappTemplates(tenantId),
      this.listBrainOnboardingAnswers(tenantId),
      this.listKnowledgeSuggestions(tenantId, { status: "all" }),
      this.db
        .select()
        .from(documentIngestionJobs)
        .where(eq(documentIngestionJobs.tenantId, tenantId)),
      // Voice call metadata + transcripts, the raw inbound webhook ledger, usage
      // events, and the tenant's audit trail (which also captures consent
      // events) were all previously omitted — a data-subject-access gap.
      this.db.select().from(calls).where(eq(calls.tenantId, tenantId)),
      this.db
        .select()
        .from(callTranscripts)
        .where(eq(callTranscripts.tenantId, tenantId)),
      this.db
        .select()
        .from(channelWebhookEvents)
        .where(eq(channelWebhookEvents.tenantId, tenantId)),
      this.db
        .select()
        .from(usageEvents)
        .where(eq(usageEvents.tenantId, tenantId)),
      this.db.select().from(auditLogs).where(eq(auditLogs.tenantId, tenantId)),
    ]);

    return {
      tenant,
      knowledge,
      conversations: tenantConversations,
      messages: tenantMessages,
      handoffRequests: handoffs,
      contacts: tenantContacts,
      messageDeliveries: deliveries,
      whatsappTemplates: templates,
      brainOnboardingAnswers: onboardingAnswers,
      knowledgeSuggestions: suggestions,
      documentIngestionJobs: ingestionJobs,
      calls: tenantCalls,
      callTranscripts: tenantCallTranscripts,
      channelWebhookEvents: webhookEvents,
      usageEvents: usage,
      auditLogs: audit,
    };
  }

  async isTenantOnLegalHold(tenantId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ legalHoldAt: tenants.legalHoldAt })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    return Boolean(row?.legalHoldAt);
  }

  async setTenantLegalHold(tenantId: string, reason: string): Promise<void> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope<void>(tenantId, (repo) =>
        repo.setTenantLegalHold(tenantId, reason),
      );
    }
    await this.db
      .update(tenants)
      .set({ legalHoldAt: new Date(), legalHoldReason: reason })
      .where(eq(tenants.id, tenantId));
  }

  async releaseTenantLegalHold(tenantId: string): Promise<void> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope<void>(tenantId, (repo) =>
        repo.releaseTenantLegalHold(tenantId),
      );
    }
    await this.db
      .update(tenants)
      .set({ legalHoldAt: null, legalHoldReason: null })
      .where(eq(tenants.id, tenantId));
  }

  async deleteTenantData(tenantId: string): Promise<void> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope<void>(tenantId, (repo) =>
        repo.deleteTenantData(tenantId),
      );
    }
    // Legal hold beats erasure: refuse rather than delete held data.
    if (await this.isTenantOnLegalHold(tenantId)) {
      throw new TenantLegalHoldError();
    }
    // this.db is the tenant-scoped transaction opened by withTenantScope. Capture
    // the OneBrain records this tenant synced BEFORE deleting it — otherwise the
    // cascade wipes onebrain_sync_records and with it the refs needed to erase the
    // remote copies. The outbox has no tenant FK, so its rows survive the delete.
    await captureOneBrainDeletesForTenantRow(this.db, tenantId);
    await this.db.delete(tenants).where(eq(tenants.id, tenantId));
  }

  async listPendingOneBrainDeletes(
    limit = 100,
  ): Promise<OneBrainDeleteOutboxRow[]> {
    // The outbox is not tenant-scoped (its rows outlive their tenant), so the
    // drain worker reads it on the root executor.
    return listPendingOneBrainDeleteRows(this.db, limit);
  }

  async markOneBrainDeleteDone(id: string): Promise<void> {
    return markOneBrainDeleteDoneRow(this.db, id);
  }

  async markOneBrainDeleteFailed(
    id: string,
    error: string,
    exhausted: boolean,
  ): Promise<void> {
    return markOneBrainDeleteFailedRow(this.db, id, error, exhausted);
  }

  async getTombstoneCursor(provider = "onebrain"): Promise<number> {
    const [row] = await this.db
      .select({ cursor: onebrainTombstoneCursor.cursor })
      .from(onebrainTombstoneCursor)
      .where(eq(onebrainTombstoneCursor.provider, provider))
      .limit(1);
    return row?.cursor ?? 0;
  }

  async setTombstoneCursor(
    cursor: number,
    provider = "onebrain",
  ): Promise<void> {
    await this.db
      .insert(onebrainTombstoneCursor)
      .values({ provider, cursor })
      .onConflictDoUpdate({
        target: onebrainTombstoneCursor.provider,
        set: { cursor, updatedAt: sql`now()` },
      });
  }

  /**
   * GDPR Art. 17 erasure of a single data subject (contact). Deletes the contact
   * row (its conversation links cascade away) and, unless
   * `deleteConversations` is false, the conversations that contact took part in
   * — including their messages/feedback (ON DELETE CASCADE) and any linked calls
   * and transcripts (calls only SET NULL their conversation ref, so they are
   * deleted explicitly). Tenant-scoped and transactional so a partial erasure
   * rolls back. Returns what was removed and writes an audit entry.
   */
  async deleteContact(
    tenantId: string,
    contactId: string,
    options: { deleteConversations?: boolean } = {},
  ): Promise<{
    deletedContact: boolean;
    deletedConversations: number;
    deletedCalls: number;
    deletedDeliveries: number;
    deletedHandoffs: number;
    deletedSuggestions: number;
  }> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope(tenantId, (repo) =>
        repo.deleteContact(tenantId, contactId, options),
      );
    }
    // Legal hold beats subject erasure too: a held tenant's contacts are preserved.
    if (await this.isTenantOnLegalHold(tenantId)) {
      throw new TenantLegalHoldError();
    }
    return this.withTransaction(async (repo) => {
      // Capture linked conversations BEFORE deleting the contact — the link
      // rows cascade away together with the contact.
      const links = await repo.db
        .select({ conversationId: conversationContacts.conversationId })
        .from(conversationContacts)
        .where(
          and(
            eq(conversationContacts.tenantId, tenantId),
            eq(conversationContacts.contactId, contactId),
          ),
        );
      const conversationIds = Array.from(
        new Set(links.map((link) => link.conversationId)),
      );

      const deletedContactRows = await repo.db
        .delete(contacts)
        .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, contactId)))
        .returning({ id: contacts.id });
      const deletedContact = deletedContactRows.length > 0;

      let deletedConversations = 0;
      let deletedCalls = 0;
      let deletedDeliveries = 0;
      let deletedHandoffs = 0;
      let deletedSuggestions = 0;
      const eraseConversations = options.deleteConversations ?? true;
      if (deletedContact && eraseConversations && conversationIds.length > 0) {
        const removedCalls = await repo.db
          .delete(calls)
          .where(
            and(
              eq(calls.tenantId, tenantId),
              inArray(calls.conversationId, conversationIds),
            ),
          )
          .returning({ id: calls.id });
        deletedCalls = removedCalls.length;

        // Rows that only SET NULL their conversation ref (deliveries, handoffs)
        // — or reference it without a FK at all (suggestions) — would otherwise
        // survive erasure carrying the data subject's recipient id, message, or
        // question. Delete them before the conversations, while the ref matches.
        const removedDeliveries = await repo.db
          .delete(messageDeliveries)
          .where(
            and(
              eq(messageDeliveries.tenantId, tenantId),
              inArray(messageDeliveries.conversationId, conversationIds),
            ),
          )
          .returning({ id: messageDeliveries.id });
        deletedDeliveries = removedDeliveries.length;

        const removedHandoffs = await repo.db
          .delete(handoffRequests)
          .where(
            and(
              eq(handoffRequests.tenantId, tenantId),
              inArray(handoffRequests.conversationId, conversationIds),
            ),
          )
          .returning({ id: handoffRequests.id });
        deletedHandoffs = removedHandoffs.length;

        const removedSuggestions = await repo.db
          .delete(knowledgeSuggestions)
          .where(
            and(
              eq(knowledgeSuggestions.tenantId, tenantId),
              inArray(
                knowledgeSuggestions.sourceConversationId,
                conversationIds,
              ),
            ),
          )
          .returning({ id: knowledgeSuggestions.id });
        deletedSuggestions = removedSuggestions.length;

        const removedConversations = await repo.db
          .delete(conversations)
          .where(
            and(
              eq(conversations.tenantId, tenantId),
              inArray(conversations.id, conversationIds),
            ),
          )
          .returning({ id: conversations.id });
        deletedConversations = removedConversations.length;
      }

      if (deletedContact) {
        await repo.audit(tenantId, "contact.erased", "contact", contactId, {
          deletedConversations,
          deletedCalls,
          deletedDeliveries,
          deletedHandoffs,
          deletedSuggestions,
          erasedConversations: eraseConversations,
        });
      }
      return {
        deletedContact,
        deletedConversations,
        deletedCalls,
        deletedDeliveries,
        deletedHandoffs,
        deletedSuggestions,
      };
    });
  }

  /**
   * Retention enforcement: delete conversation history for a single tenant that
   * is older than the tenant's retention window. DESTRUCTIVE — handled with
   * deliberate caution:
   *
   *  - Tenant-scoped: every delete is filtered by `tenantId`, so one tenant can
   *    never touch another's rows.
   *  - Conservative eligibility: only conversations whose `createdAt` is
   *    strictly before the cutoff (`now - retentionDays`) are removed. The
   *    cutoff is computed by {@link retentionCutoff}, which returns `null` for a
   *    missing/zero/negative `retentionDays` — in that case we delete NOTHING
   *    and return 0, so a misconfigured tenant cannot lose data.
   *  - Scoped to conversation data only: messages, conversation_contacts and
   *    answer_feedback are removed automatically by the existing ON DELETE
   *    CASCADE foreign keys when their parent conversation is deleted. Records
   *    that merely reference a conversation with ON DELETE SET NULL (handoff
   *    requests, message deliveries, calls) are intentionally NOT deleted here —
   *    they may carry independent lifecycle/audit meaning. Knowledge, contacts,
   *    tenant settings, audit logs and users are all left untouched.
   *
   * `retentionDays` defaults to the tenant's configured value but can be passed
   * explicitly for testing. Returns the number of conversations deleted.
   */
  async deleteTenantDataOlderThanRetention(
    tenantId: string,
    options: { now?: Date; retentionDays?: number } = {},
  ): Promise<{
    cutoff: Date | null;
    deletedConversations: number;
    deletedCalls: number;
    deletedWebhookEvents: number;
  }> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope(tenantId, (repo) =>
        repo.deleteTenantDataOlderThanRetention(tenantId, options),
      );
    }
    const tenant = await this.getTenant(tenantId);
    if (!tenant) {
      throw new Error("Tenant not found.");
    }

    // Legal hold beats retention: a held tenant is never pruned.
    const retentionDays = options.retentionDays ?? tenant.retentionDays;
    const cutoff = tenant.legalHoldAt
      ? null
      : retentionCutoff(retentionDays, options.now ?? new Date());
    // No valid retention window configured, or the tenant is held: delete nothing.
    if (!cutoff) {
      return {
        cutoff: null,
        deletedConversations: 0,
        deletedCalls: 0,
        deletedWebhookEvents: 0,
      };
    }

    const removed = await this.db
      .delete(conversations)
      .where(
        and(
          eq(conversations.tenantId, tenantId),
          lt(conversations.createdAt, cutoff),
        ),
      )
      .returning({ id: conversations.id });

    // Calls only SET NULL their conversation reference, so they (and their
    // transcripts, via ON DELETE CASCADE) survive conversation pruning. Prune
    // them independently by their own start time so voice recordings/transcripts
    // — which contain personal data — are also subject to retention.
    const removedCalls = await this.db
      .delete(calls)
      .where(and(eq(calls.tenantId, tenantId), lt(calls.startedAt, cutoff)))
      .returning({ id: calls.id });

    // channel_webhook_events store the RAW inbound provider payload (personal
    // data) and are otherwise never pruned. They are only used to dedupe
    // near-term provider retries, so anything older than the retention window is
    // safe to delete — closing a standing GDPR gap.
    const removedWebhookEvents = await this.db
      .delete(channelWebhookEvents)
      .where(
        and(
          eq(channelWebhookEvents.tenantId, tenantId),
          lt(channelWebhookEvents.createdAt, cutoff),
        ),
      )
      .returning({ id: channelWebhookEvents.id });

    if (
      removed.length > 0 ||
      removedCalls.length > 0 ||
      removedWebhookEvents.length > 0
    ) {
      await this.audit(
        tenantId,
        "retention.conversations.pruned",
        "tenant",
        tenantId,
        {
          retentionDays,
          cutoff: cutoff.toISOString(),
          deletedConversations: removed.length,
          deletedCalls: removedCalls.length,
          deletedWebhookEvents: removedWebhookEvents.length,
        },
      );
    }

    return {
      cutoff,
      deletedConversations: removed.length,
      deletedCalls: removedCalls.length,
      deletedWebhookEvents: removedWebhookEvents.length,
    };
  }

  private async resolveContactForConversation(input: {
    tenantId: string;
    channel: Channel;
    externalUserId?: string | undefined;
    contact?: ContactProfileInput | undefined;
    preferredContactId?: string | undefined;
  }): Promise<ContactRecord | null> {
    const normalizedContact = normalizeContactInput(input.contact);
    const identifierKey = channelIdentifierKey(input.channel);
    const identifiers = mergeIdentifierValues(
      normalizedContact.identifiers,
      identifierKey,
      input.externalUserId,
    );
    const phone =
      normalizedContact.phone ??
      (isPhoneIdentityChannel(input.channel)
        ? normalizePhone(input.externalUserId)
        : undefined);

    if (
      !input.preferredContactId &&
      !input.externalUserId &&
      !normalizedContact.email &&
      !phone &&
      !normalizedContact.displayName &&
      !normalizedContact.company
    ) {
      return null;
    }

    const existing = await this.findMatchingContact(input.tenantId, {
      preferredContactId: input.preferredContactId,
      email: normalizedContact.email,
      phone,
      identifiers,
    });

    if (existing) {
      const [updated] = await this.db
        .update(contacts)
        .set({
          displayName:
            normalizedContact.displayName ?? existing.displayName ?? phone,
          email: normalizedContact.email ?? existing.email,
          phone: phone ?? existing.phone,
          company: normalizedContact.company ?? existing.company,
          confidence: Math.max(
            existing.confidence,
            normalizedContact.confidence,
          ),
          identifiers: mergeIdentifierMaps(existing.identifiers, identifiers),
          metadata: {
            ...(existing.metadata ?? {}),
            ...(normalizedContact.metadata ?? {}),
            lastSeenChannel: input.channel,
            lastSeenAt: new Date().toISOString(),
          },
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(contacts.tenantId, input.tenantId),
            eq(contacts.id, existing.id),
          ),
        )
        .returning();

      return updated ?? existing;
    }

    const [created] = await this.db
      .insert(contacts)
      .values({
        tenantId: input.tenantId,
        displayName:
          normalizedContact.displayName ??
          normalizedContact.company ??
          normalizedContact.email ??
          phone ??
          (input.externalUserId
            ? `${titleCase(input.channel)} contact`
            : "New contact"),
        email: normalizedContact.email ?? null,
        phone: phone ?? null,
        company: normalizedContact.company ?? null,
        confidence: normalizedContact.confidence,
        identifiers,
        metadata: {
          ...(normalizedContact.metadata ?? {}),
          firstSeenChannel: input.channel,
          lastSeenChannel: input.channel,
          lastSeenAt: new Date().toISOString(),
        },
      })
      .returning();

    return created ?? null;
  }

  private async getConversationContactId(
    tenantId: string,
    conversationId: string,
  ) {
    const [link] = await this.db
      .select({
        contactId: conversationContacts.contactId,
      })
      .from(conversationContacts)
      .where(
        and(
          eq(conversationContacts.tenantId, tenantId),
          eq(conversationContacts.conversationId, conversationId),
        ),
      )
      .limit(1);

    return link?.contactId ?? null;
  }

  private async linkConversationContact(
    tenantId: string,
    conversationId: string,
    contactId: string,
  ) {
    await this.db
      .insert(conversationContacts)
      .values({
        tenantId,
        conversationId,
        contactId,
        updatedAt: sql`now()`,
      })
      .onConflictDoUpdate({
        target: [
          conversationContacts.tenantId,
          conversationContacts.conversationId,
        ],
        set: {
          contactId,
          updatedAt: sql`now()`,
        },
      });
  }

  private async findMatchingContact(
    tenantId: string,
    input: {
      preferredContactId?: string | undefined;
      email?: string | undefined;
      phone?: string | undefined;
      identifiers: Record<string, string[]>;
    },
  ) {
    if (input.preferredContactId) {
      const [preferred] = await this.db
        .select()
        .from(contacts)
        .where(
          and(
            eq(contacts.tenantId, tenantId),
            eq(contacts.id, input.preferredContactId),
          ),
        )
        .limit(1);
      if (preferred) {
        return preferred;
      }
    }

    if (input.email || input.phone) {
      const [matched] = await this.db
        .select()
        .from(contacts)
        .where(
          and(
            eq(contacts.tenantId, tenantId),
            input.email && input.phone
              ? or(
                  eq(contacts.email, input.email),
                  eq(contacts.phone, input.phone),
                )
              : input.email
                ? eq(contacts.email, input.email)
                : eq(contacts.phone, input.phone ?? ""),
          ),
        )
        .limit(1);
      if (matched) {
        return matched;
      }
    }

    const identifierPredicates = contactIdentifierContainmentValues(
      input.identifiers,
    ).map((value) => sql`${contacts.identifiers} @> ${value}::jsonb`);

    if (identifierPredicates.length) {
      const [matched] = await this.db
        .select()
        .from(contacts)
        .where(
          and(
            eq(contacts.tenantId, tenantId),
            identifierPredicates.length === 1
              ? identifierPredicates[0]
              : or(...identifierPredicates),
          ),
        )
        .orderBy(desc(contacts.updatedAt))
        .limit(1);

      if (matched) {
        return matched;
      }
    }

    const candidates = await this.db
      .select()
      .from(contacts)
      .where(eq(contacts.tenantId, tenantId))
      .orderBy(desc(contacts.updatedAt))
      .limit(300);

    return (
      candidates.find((candidate) =>
        hasSharedIdentifier(candidate.identifiers, input.identifiers),
      ) ?? null
    );
  }

  private async createDefaultEscalationRule(tenantId: string) {
    await this.db.insert(escalationRules).values({
      tenantId,
      name: "Default handoff",
      channel: "all",
      contactLabel: "team",
      enabled: true,
      createHandoffRequest: true,
    });
  }

  private async getOrCreateRole(name: RoleName) {
    const [role] = await this.db
      .insert(roles)
      .values({
        name,
        description: roleDescription(name),
      })
      .onConflictDoUpdate({
        target: roles.name,
        set: {
          description: roleDescription(name),
          updatedAt: sql`now()`,
        },
      })
      .returning();

    if (!role) {
      throw new Error("Failed to load role.");
    }

    return role.id;
  }

  private encryptChannelCredential(
    tenantId: string,
    input: ChannelConnectionCredentialInput,
    credential: "access_token" | "refresh_token",
  ) {
    if (!this.credentialCipher) {
      throw new Error(
        "Channel credential encryption is not configured. Set CHANNEL_CREDENTIAL_MASTER_KEY.",
      );
    }
    const plaintext =
      credential === "access_token" ? input.accessToken : input.refreshToken;
    if (!plaintext) {
      throw new Error("Channel credential value is empty.");
    }
    return this.credentialCipher.encrypt(plaintext, {
      tenantId,
      channel: input.channel,
      provider: input.provider,
      credential,
    });
  }

  private decryptChannelCredential(
    tenantId: string,
    input: Pick<ChannelConnectionCredentialInput, "channel" | "provider">,
    credential: "access_token" | "refresh_token",
    ciphertext: string,
  ) {
    if (!this.credentialCipher) {
      throw new Error(
        "Channel credential encryption is not configured. Set CHANNEL_CREDENTIAL_MASTER_KEY.",
      );
    }
    return this.credentialCipher.decrypt(ciphertext, {
      tenantId,
      channel: input.channel,
      provider: input.provider,
      credential,
    });
  }

  private async audit(
    tenantId: string,
    action: string,
    targetType: string,
    targetId: string,
    metadata: Record<string, unknown>,
    actor: { actorType?: string; actorId?: string | null } = {},
  ) {
    await this.db.insert(auditLogs).values({
      tenantId,
      actorType: actor.actorType ?? "system",
      actorId: actor.actorId ?? null,
      action,
      targetType,
      targetId,
      metadata,
    });
  }

  /**
   * Public, actor-attributed audit writer. Used by the API layer to record who
   * accessed or exported tenant personal data (GDPR Art. 5(2)/30
   * accountability). Unlike the internal {@link audit} helper — whose callers
   * are system/state-change paths — this records the authenticated principal
   * (a real user id, or the platform admin token) so PII access is traceable.
   */
  async recordAuditEvent(
    tenantId: string,
    entry: {
      action: string;
      targetType: string;
      targetId: string;
      actorType: string;
      actorId?: string | null;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope<void>(tenantId, (repo) =>
        repo.recordAuditEvent(tenantId, entry),
      );
    }
    await this.audit(
      tenantId,
      entry.action,
      entry.targetType,
      entry.targetId,
      entry.metadata ?? {},
      { actorType: entry.actorType, actorId: entry.actorId ?? null },
    );
  }
}
