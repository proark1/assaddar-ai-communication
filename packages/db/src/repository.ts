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
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { Database, DbExecutor, Transaction } from "./client";
import {
  allowedIntents,
  auditLogs,
  blockedTopics,
  channelConnections,
  conversationContacts,
  contacts,
  conversations,
  escalationRules,
  handoffRequests,
  knowledgeChunks,
  knowledgeDocuments,
  knowledgeSources,
  messageDeliveries,
  messages,
  memberships,
  roles,
  tenantInvites,
  tenants,
  usageEvents,
  users,
  userSessions,
  whatsappTemplates,
  type WidgetTheme,
} from "./schema";
import { assertTenantId } from "./tenant-scope";
import {
  channelIdentifierKey,
  createPublicAssistantId,
  createPublicConversationId,
  deriveConversationNextAction,
  extractTemplateVariables,
  hasSharedIdentifier,
  isPhoneIdentityChannel,
  mergeIdentifierMaps,
  mergeIdentifierValues,
  normalizeContactInput,
  normalizeEmail,
  normalizePhone,
  normalizeRoleName,
  normalizeTemplateName,
  retentionCutoff,
  roleDescription,
  setTenantSession,
  titleCase,
} from "./repository-helpers";

export {
  createPublicAssistantId,
  createPublicConversationId,
  retentionCutoff,
  setTenantSession,
} from "./repository-helpers";

export type TenantSummary = typeof tenants.$inferSelect;

export type RoleName =
  | "platform_owner"
  | "tenant_owner"
  | "tenant_admin"
  | "operator"
  | "viewer";

export type AuthUserRecord = Pick<
  typeof users.$inferSelect,
  "id" | "email" | "name" | "status" | "passwordHash"
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
  passwordHash?: string | null | undefined;
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

const DEFAULT_LIST_LIMIT = 100;
const MAX_LIST_LIMIT = 100;

/**
 * Clamp pagination options to safe bounds. `limit` is clamped to
 * [1, MAX_LIST_LIMIT] and defaults to DEFAULT_LIST_LIMIT; `offset` is clamped
 * to >= 0 and defaults to 0. This guards against negative/huge values from
 * untrusted query params while keeping the default page identical to before.
 */
function resolvePagination(options?: PaginationOptions): {
  limit: number;
  offset: number;
} {
  const rawLimit = options?.limit;
  const limit =
    typeof rawLimit === "number" && Number.isFinite(rawLimit)
      ? Math.min(Math.max(Math.trunc(rawLimit), 1), MAX_LIST_LIMIT)
      : DEFAULT_LIST_LIMIT;
  const rawOffset = options?.offset;
  const offset =
    typeof rawOffset === "number" && Number.isFinite(rawOffset)
      ? Math.max(Math.trunc(rawOffset), 0)
      : 0;
  return { limit, offset };
}

function normalizeListQuery(options?: PaginationOptions): string | undefined {
  const value = options?.q?.trim().toLowerCase();
  return value ? `%${value}%` : undefined;
}

function normalizeListStatus(options?: PaginationOptions): string | undefined {
  const value = options?.status?.trim();
  return value && value !== "all" ? value : undefined;
}

export type ConversationRecord = typeof conversations.$inferSelect;

export type MessageRecord = typeof messages.$inferSelect;

export type ContactRecord = typeof contacts.$inferSelect;

export type ChannelConnectionRecord = typeof channelConnections.$inferSelect;

export type TenantInviteRecord = typeof tenantInvites.$inferSelect;

export type KnowledgeSourceRecord = typeof knowledgeSources.$inferSelect;

export type KnowledgeDocumentRecord = typeof knowledgeDocuments.$inferSelect;

export type KnowledgeChunkRecord = typeof knowledgeChunks.$inferSelect;

export type MessageDeliveryRecord = typeof messageDeliveries.$inferSelect;

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
  contacts: number;
  lastConversationAt: Date | null;
  lastMessageAt: Date | null;
  usageByStatus: Array<{
    eventType: string;
    total: number;
    credits: number;
  }>;
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
};

export type ChannelConnectionInput = {
  channel: Channel;
  provider: string;
  externalAccountId?: string | null | undefined;
  status?: "pending" | "connected" | "disabled" | undefined;
  settings?: Record<string, unknown> | undefined;
};

const secretLikeSettingsKeyPattern =
  /token|secret|password|api[_-]?key|apikey|authorization|credential|private[_-]?key/i;

function rejectSecretSettings<T extends Record<string, unknown>>(
  settings: T,
): T {
  assertNoSecretSettings(settings);
  return settings;
}

function assertNoSecretSettings(value: unknown, path: string[] = []) {
  if (!value || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoSecretSettings(item, [...path, String(index)]),
    );
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (secretLikeSettingsKeyPattern.test(key)) {
      throw new Error(
        `Channel connection settings must not contain secret-like key "${[
          ...path,
          key,
        ].join(".")}". Store provider credentials in a secret manager.`,
      );
    }
    assertNoSecretSettings(entry, [...path, key]);
  }
}

export type ContactProfileInput = {
  displayName?: string | null | undefined;
  email?: string | null | undefined;
  phone?: string | null | undefined;
  company?: string | null | undefined;
  identifiers?:
    | Record<string, string[] | string | null | undefined>
    | undefined;
  metadata?: Record<string, unknown> | undefined;
};

export type WhatsappTemplateInput = {
  name: string;
  language?: string | undefined;
  category?: "marketing" | "utility" | "authentication" | undefined;
  status?:
    | "draft"
    | "submitted"
    | "approved"
    | "rejected"
    | "paused"
    | undefined;
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

  constructor(db: Database, executor: DbExecutor = db, tenantScope?: string) {
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
      fn(new TenantRepository(this.rootDb, tx, this.tenantScope)),
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
      return fn(new TenantRepository(this.rootDb, this.db, tenantId));
    }
    return this.rootDb.transaction(async (tx: Transaction) => {
      await setTenantSession(tx, tenantId);
      return fn(new TenantRepository(this.rootDb, tx, tenantId));
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

    const [connection] = await this.db
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
    const existing = await this.findUserByEmailForAuth(email);

    const [user] = existing
      ? await this.db
          .update(users)
          .set({
            name: input.name.trim() || existing.name,
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
            email,
            name: input.name.trim() || email,
            passwordHash: input.passwordHash ?? null,
            emailVerifiedAt: input.passwordHash ? sql`now()` : null,
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
    const query = normalizeListQuery(options);
    const status = normalizeListStatus(options);
    const filters: SQL[] = [eq(knowledgeChunks.tenantId, tenantId)];
    if (status) {
      filters.push(eq(knowledgeChunks.status, status));
    }
    if (query) {
      filters.push(
        sql`lower(concat_ws(' ', ${knowledgeChunks.title}, ${knowledgeChunks.content}, ${knowledgeChunks.tags}::text)) like ${query}`,
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
    role: "user" | "assistant" | "system";
    content: string;
    trace?: Record<string, unknown>;
  }): Promise<MessageRecord> {
    assertTenantId(input.tenantId);
    if (this.needsTenantScope(input.tenantId)) {
      return this.withTenantScope(input.tenantId, (repo) =>
        repo.addMessage(input),
      );
    }
    const [message] = await this.db
      .insert(messages)
      .values({
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        channel: input.channel,
        direction: input.direction,
        role: input.role,
        content: input.content,
        trace: input.trace ?? {},
      })
      .returning();

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
    const query = normalizeListQuery(options);
    const status = normalizeListStatus(options);
    const filters: SQL[] = [eq(conversations.tenantId, tenantId)];
    if (status) {
      filters.push(eq(conversations.status, status));
    }
    if (query) {
      filters.push(
        sql`lower(concat_ws(' ', ${conversations.publicId}, ${conversations.channel}, ${conversations.externalUserId}, ${conversations.locale})) like ${query}`,
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
    const query = normalizeListQuery(options);
    const status = normalizeListStatus(options);
    const filters: SQL[] = [eq(conversations.tenantId, tenantId)];
    if (status) {
      filters.push(eq(conversations.status, status));
    }
    if (query) {
      filters.push(
        sql`lower(concat_ws(' ', ${conversations.publicId}, ${conversations.channel}, ${conversations.externalUserId}, ${contacts.displayName}, ${contacts.email}, ${contacts.phone}, ${contacts.company})) like ${query}`,
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

    const messageFetchLimit = conversationIds.length * 4;
    const [recentMessages, openHandoffs] = await Promise.all([
      this.db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.tenantId, tenantId),
            inArray(messages.conversationId, conversationIds),
          ),
        )
        .orderBy(desc(messages.createdAt))
        .limit(messageFetchLimit),
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

    const lastMessageByConversation = new Map<string, MessageRecord>();
    const messageCountByConversation = new Map<string, number>();
    for (const message of recentMessages) {
      messageCountByConversation.set(
        message.conversationId,
        (messageCountByConversation.get(message.conversationId) ?? 0) + 1,
      );
      if (!lastMessageByConversation.has(message.conversationId)) {
        lastMessageByConversation.set(message.conversationId, message);
      }
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
    const query = normalizeListQuery(options);
    const filters: SQL[] = [eq(contacts.tenantId, tenantId)];
    if (query) {
      filters.push(
        sql`lower(concat_ws(' ', ${contacts.displayName}, ${contacts.email}, ${contacts.phone}, ${contacts.company}, ${contacts.identifiers}::text)) like ${query}`,
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
    const query = normalizeListQuery(options);
    const status = normalizeListStatus(options);
    const filters: SQL[] = [eq(handoffRequests.tenantId, tenantId)];
    if (status) {
      filters.push(eq(handoffRequests.status, status));
    }
    if (query) {
      filters.push(
        sql`lower(concat_ws(' ', ${handoffRequests.reason}, ${handoffRequests.requesterMessage}, ${handoffRequests.channel}, ${handoffRequests.assignedTo}, ${handoffRequests.metadata}::text)) like ${query}`,
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

    return handoff;
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

  async getTenantAnalytics(tenantId: string): Promise<TenantAnalyticsResult> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope<TenantAnalyticsResult>(tenantId, (repo) =>
        repo.getTenantAnalytics(tenantId),
      );
    }
    const [
      [conversationStats],
      [messageStats],
      [knowledgeStats],
      [openHandoffStats],
      [totalHandoffStats],
      [contactStats],
      usageByStatus,
    ] = await Promise.all([
      this.db
        .select({
          total: sql<number>`count(*)::int`,
          lastAt: sql<Date | null>`max(${conversations.createdAt})`,
        })
        .from(conversations)
        .where(eq(conversations.tenantId, tenantId)),
      this.db
        .select({
          total: sql<number>`count(*)::int`,
          lastAt: sql<Date | null>`max(${messages.createdAt})`,
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
    ]);

    return {
      conversations: conversationStats?.total ?? 0,
      messages: messageStats?.total ?? 0,
      approvedKnowledge: knowledgeStats?.total ?? 0,
      openHandoffs: openHandoffStats?.total ?? 0,
      totalHandoffs: totalHandoffStats?.total ?? 0,
      contacts: contactStats?.total ?? 0,
      lastConversationAt: conversationStats?.lastAt ?? null,
      lastMessageAt: messageStats?.lastAt ?? null,
      usageByStatus,
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
    };
  }

  async deleteTenantData(tenantId: string): Promise<void> {
    assertTenantId(tenantId);
    if (this.needsTenantScope(tenantId)) {
      return this.withTenantScope<void>(tenantId, (repo) =>
        repo.deleteTenantData(tenantId),
      );
    }
    await this.db.delete(tenants).where(eq(tenants.id, tenantId));
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
  ): Promise<{ cutoff: Date | null; deletedConversations: number }> {
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

    const retentionDays = options.retentionDays ?? tenant.retentionDays;
    const cutoff = retentionCutoff(retentionDays, options.now ?? new Date());
    // No valid retention window configured: do not delete anything.
    if (!cutoff) {
      return { cutoff: null, deletedConversations: 0 };
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

    if (removed.length > 0) {
      await this.audit(
        tenantId,
        "retention.conversations.pruned",
        "tenant",
        tenantId,
        {
          retentionDays,
          cutoff: cutoff.toISOString(),
          deletedConversations: removed.length,
        },
      );
    }

    return { cutoff, deletedConversations: removed.length };
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

  private async audit(
    tenantId: string,
    action: string,
    targetType: string,
    targetId: string,
    metadata: Record<string, unknown>,
  ) {
    await this.db.insert(auditLogs).values({
      tenantId,
      actorType: "system",
      action,
      targetType,
      targetId,
      metadata,
    });
  }
}
