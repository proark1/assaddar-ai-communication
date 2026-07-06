import {
  MetaMessengerAdapter,
  type NormalizedInboundEvent,
  type DeliveryResult,
  verifyMetaSignature,
  WhatsAppCloudAdapter,
  WebsiteAdapter,
  type ChannelAdapter,
} from "@assaddar/channels";
import {
  createAnswerEngine,
  InboundMessageSchema,
  type AnswerDataStore,
  type AnswerResult,
  type Channel,
  type GroundedAnswerGenerator,
  type HandoffStore,
} from "@assaddar/core";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import { Buffer } from "node:buffer";
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import net from "node:net";
import { Readable } from "node:stream";
import tls from "node:tls";
import { promisify } from "node:util";
import { z } from "zod";
import type { BillingProvider, StripeWebhookEvent } from "./billing";
import { openApiDocument } from "./openapi";
import { AppError } from "./errors";
import { MetricsRegistry, METRICS_CONTENT_TYPE } from "./metrics";
import { captureException } from "./observability";
import type { SupabaseAuthProvider } from "./supabase-auth";
import {
  ParamsTenantSchema,
  ParamsKnowledgeSchema,
  ParamsKnowledgeSuggestionSchema,
  ParamsContactSchema,
  ParamsConversationSchema,
  ParamsHandoffSchema,
  ParamsAssistantSchema,
  ParamsMetaChannelSchema,
  ParamsChannelSchema,
  PaginationQuerySchema,
  CreateTenantSchema,
  OnboardingProjectSchema,
  UpdateTenantSchema,
  AddFaqSchema,
  UpsertBrainOnboardingSchema,
  CreateKnowledgeSuggestionSchema,
  ReviewKnowledgeSuggestionSchema,
  KnowledgeDocumentUploadSchema,
  ScanKnowledgeSuggestionsSchema,
  UpdateHandoffSchema,
  TestAssistantSchema,
  WidgetChatSchema,
  WidgetLeadSchema,
  WidgetReadinessSchema,
  WidgetEventSchema,
  MetaWebhookQuerySchema,
  ChannelConnectionSchema,
  TelephoneProviderSchema,
  TelephoneNumberTypeSchema,
  TwilioNumberTypeSchema,
  TwilioNumberSearchQuerySchema,
  OnboardingPhoneNumberQuerySchema,
  ReservePhoneNumberSchema,
  BillingCheckoutSessionSchema,
  TelephoneNumberInventorySchema,
  TelephoneNumberInventoryUpdateSchema,
  BillableAcceptedCallSchema,
  PurchaseTwilioNumberSchema,
  ConnectExistingTwilioNumberSchema,
  NewTelephoneNumberSetupSchema,
  CarrierForwardingSchema,
  SipByocSetupSchema,
  TelephoneSettingsSchema,
  WhatsappTemplateSchema,
  WebsiteImportSchema,
  InstallCheckSchema,
  LoginSchema,
  CreateTenantUserSchema,
  CreateTenantInviteSchema,
  AcceptTenantInviteSchema,
  type CreateTenantInput,
  type UpdateTenantInput,
  type AddFaqInput,
  type UpsertBrainOnboardingInput,
  type CreateKnowledgeSuggestionInput,
  type ReviewKnowledgeSuggestionInput,
  type KnowledgeDocumentUploadInput,
  type ScanKnowledgeSuggestionsInput,
  type UpdateHandoffInput,
  type ChannelConnectionInput,
  type WhatsappTemplateInput,
  type WidgetThemeInput,
  type RoleName,
  type TenantRoleName,
} from "./schemas";

const scryptAsync = promisify(scrypt);

const DOCUMENT_UPLOAD_BODY_LIMIT_BYTES = 7 * 1024 * 1024;

type ContactProfileInput = {
  displayName?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  identifiers?: Record<string, string | string[]>;
  metadata?: Record<string, unknown>;
};
type AutomationSettings = {
  ownerLeadEmailEnabled: boolean;
  visitorConfirmationEmailEnabled: boolean;
  autoQualifyReadinessEnabled: boolean;
  autoQualifyLeadDetailsEnabled: boolean;
  weeklySummaryEmailEnabled: boolean;
  staleLeadReminderDays: number;
  readinessQualificationScore: number;
};

type StoreTenant = {
  id: string;
  publicId: string;
  name: string;
  slug?: string;
  status?: string;
  defaultLocale: string;
  theme?: WidgetThemeInput | null;
  retentionDays?: number | null;
  confidenceThreshold?: number | string | null;
  maxMessageLength?: number | null;
};

type StoreAuthUser = {
  id: string;
  email: string;
  name: string;
  status: string;
  passwordHash?: string | null;
};

type StoreTenantMembership = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  role: RoleName;
  status: string;
};

type StoreAuthSession = {
  sessionId: string;
  expiresAt: Date;
  user: {
    id: string;
    email: string;
    name: string;
    status: string;
  };
  memberships: StoreTenantMembership[];
};

/** Optional pagination for list endpoints; omit for the default page. */
export type PaginationOptions = {
  limit?: number | undefined;
  offset?: number | undefined;
  q?: string | undefined;
  status?: string | undefined;
};

type ResolvedBilling = {
  provider: BillingProvider;
  numberPriceId: string;
  acceptedCallPriceId?: string | undefined;
  acceptedCallMeterEventName?: string | undefined;
  customerPortalReturnUrl?: string | undefined;
};

export type PlatformStore = AnswerDataStore &
  HandoffStore & {
    createTenant(input: CreateTenantInput): Promise<unknown>;
    createSelfServiceTenant(input: {
      name: string;
      slug: string;
      owner: {
        email: string;
        name: string;
        authUserId?: string | null | undefined;
      };
      defaultLocale?: string | undefined;
      theme?: WidgetThemeInput | undefined;
    }): Promise<unknown>;
    updateTenant(tenantId: string, input: UpdateTenantInput): Promise<unknown>;
    listTenants(): Promise<unknown[]>;
    listTenantsForUser(userId: string): Promise<unknown[]>;
    getPlatformOverview(): Promise<unknown>;
    getTenant(tenantId: string): Promise<StoreTenant | null>;
    getTenantByPublicId(publicId: string): Promise<StoreTenant | null>;
    getWidgetConfig(publicId: string): Promise<unknown | null>;
    findUserByEmailForAuth(email: string): Promise<StoreAuthUser | null>;
    createUserSession(input: {
      userId: string;
      tokenHash: string;
      expiresAt: Date;
      userAgent?: string | null;
      ipAddress?: string | null;
    }): Promise<unknown>;
    getAuthSession(tokenHash: string): Promise<StoreAuthSession | null>;
    getAuthSessionBySupabaseUser(input: {
      authUserId: string;
      email: string;
      name?: string | null;
      expiresAt: Date;
    }): Promise<StoreAuthSession | null>;
    deleteUserSession(tokenHash: string): Promise<void>;
    deleteExpiredSessions(now?: Date): Promise<number>;
    ping(): Promise<boolean>;
    getTenantMembership(
      userId: string,
      tenantId: string,
    ): Promise<StoreTenantMembership | null>;
    listTenantUsers(
      tenantId: string,
      options?: PaginationOptions,
    ): Promise<unknown[]>;
    upsertTenantUser(
      tenantId: string,
      input: {
        email: string;
        name: string;
        role: RoleName;
        authUserId?: string | null;
        passwordHash?: string | null;
      },
    ): Promise<unknown>;
    createTenantInvite(
      tenantId: string,
      input: {
        email: string;
        role: RoleName;
        tokenHash: string;
        expiresAt: Date;
        invitedByUserId?: string | null;
      },
    ): Promise<unknown>;
    listTenantInvites(tenantId: string): Promise<unknown[]>;
    acceptTenantInvite(input: {
      tokenHash: string;
      name: string;
      passwordHash: string;
    }): Promise<unknown | null>;
    addFaq(tenantId: string, input: AddFaqInput): Promise<unknown>;
    updateFaq(
      tenantId: string,
      knowledgeId: string,
      input: AddFaqInput,
    ): Promise<unknown>;
    deleteKnowledge(tenantId: string, knowledgeId: string): Promise<void>;
    listKnowledge(
      tenantId: string,
      options?: PaginationOptions,
    ): Promise<unknown[]>;
    getTenantBrainSummary(tenantId: string): Promise<unknown>;
    listBrainOnboardingAnswers(tenantId: string): Promise<unknown[]>;
    upsertBrainOnboardingAnswers(
      tenantId: string,
      input: UpsertBrainOnboardingInput,
    ): Promise<unknown[]>;
    listKnowledgeSuggestions(
      tenantId: string,
      options?: PaginationOptions,
    ): Promise<unknown[]>;
    listDocumentIngestionJobs(
      tenantId: string,
      options?: PaginationOptions,
    ): Promise<unknown[]>;
    recordDocumentIngestionFailure(
      tenantId: string,
      input: {
        fileName: string;
        contentType: string;
        checksum?: string | null;
        objectKey?: string | null;
        error: string;
        metadata?: Record<string, unknown>;
      },
    ): Promise<unknown>;
    createKnowledgeSuggestion(
      tenantId: string,
      input: CreateKnowledgeSuggestionInput,
    ): Promise<unknown>;
    ingestKnowledgeDocument(
      tenantId: string,
      input: {
        fileName: string;
        contentType: string;
        extractedText: string;
        checksum?: string | null;
        objectKey?: string | null;
        sourceName?: string;
        suggestedTags?: string[];
        metadata?: Record<string, unknown>;
        maxSuggestions?: number;
      },
    ): Promise<unknown>;
    scanKnowledgeSuggestions(
      tenantId: string,
      input?: ScanKnowledgeSuggestionsInput,
    ): Promise<unknown>;
    approveKnowledgeSuggestion(
      tenantId: string,
      suggestionId: string,
      input?: ReviewKnowledgeSuggestionInput & {
        reviewedByUserId?: string | null;
      },
    ): Promise<unknown>;
    rejectKnowledgeSuggestion(
      tenantId: string,
      suggestionId: string,
      input?: ReviewKnowledgeSuggestionInput & {
        reviewedByUserId?: string | null;
      },
    ): Promise<unknown>;
    listConversations(
      tenantId: string,
      options?: PaginationOptions,
    ): Promise<unknown[]>;
    listUnifiedInbox(
      tenantId: string,
      options?: PaginationOptions,
    ): Promise<unknown[]>;
    listContacts(
      tenantId: string,
      options?: PaginationOptions,
    ): Promise<unknown[]>;
    deleteContact(
      tenantId: string,
      contactId: string,
      options?: { deleteConversations?: boolean },
    ): Promise<{
      deletedContact: boolean;
      deletedConversations: number;
      deletedCalls: number;
    }>;
    listChannelConnections(tenantId: string): Promise<unknown[]>;
    upsertChannelConnection(
      tenantId: string,
      input: ChannelConnectionInput,
    ): Promise<unknown>;
    listAvailableTelephoneNumbers(options?: {
      country?: string | undefined;
      locality?: string | undefined;
      numberType?: string | undefined;
      limit?: number | undefined;
    }): Promise<unknown[]>;
    listTelephoneNumberInventory(): Promise<unknown[]>;
    createTelephoneNumberInventory(input: {
      provider?: z.infer<typeof TelephoneProviderSchema> | undefined;
      phoneNumber: string;
      country?: string | undefined;
      locality?: string | null | undefined;
      numberType?: z.infer<typeof TelephoneNumberTypeSchema> | undefined;
      sipTarget?: string | null | undefined;
      assistantId?: string | null | undefined;
      status?:
        | "available"
        | "reserved"
        | "assigned"
        | "suspended"
        | "retired"
        | undefined;
      assignedTenantId?: string | null | undefined;
      metadata?: Record<string, unknown> | undefined;
    }): Promise<unknown>;
    updateTelephoneNumberInventory(
      numberId: string,
      input: {
        provider?: z.infer<typeof TelephoneProviderSchema> | undefined;
        phoneNumber?: string | undefined;
        country?: string | undefined;
        locality?: string | null | undefined;
        numberType?: z.infer<typeof TelephoneNumberTypeSchema> | undefined;
        sipTarget?: string | null | undefined;
        assistantId?: string | null | undefined;
        status?:
          | "available"
          | "reserved"
          | "assigned"
          | "suspended"
          | "retired"
          | undefined;
        assignedTenantId?: string | null | undefined;
        metadata?: Record<string, unknown> | undefined;
      },
    ): Promise<unknown>;
    createTelephoneNumberReservation(
      tenantId: string,
      input: {
        numberId: string;
        userId?: string | null;
        expiresAt?: Date;
      },
    ): Promise<unknown>;
    getActiveTelephoneNumberReservation(tenantId: string): Promise<unknown>;
    getBillingAccount(tenantId: string): Promise<{
      id: string;
      stripeCustomerId?: string | null;
      status: string;
    } | null>;
    getOrCreateBillingAccount(
      tenantId: string,
      input?: {
        stripeCustomerId?: string | null;
        status?: string;
        defaultCurrency?: string;
        metadata?: Record<string, unknown>;
      },
    ): Promise<{
      id: string;
      stripeCustomerId?: string | null;
      status: string;
    }>;
    upsertBillingSubscription(
      tenantId: string,
      input: {
        billingAccountId: string;
        stripeSubscriptionId?: string | null;
        stripePriceId?: string | null;
        status: string;
        currentPeriodStart?: Date | null;
        currentPeriodEnd?: Date | null;
        metadata?: Record<string, unknown>;
      },
    ): Promise<unknown>;
    activateReservedTelephoneNumber(input: {
      tenantId: string;
      reservationId: string;
      stripeCustomerId: string;
      stripeSubscriptionId?: string | null;
      stripePriceId?: string | null;
      subscriptionStatus: string;
      currentPeriodStart?: Date | null;
      currentPeriodEnd?: Date | null;
      metadata?: Record<string, unknown>;
    }): Promise<unknown>;
    getOnboardingState(tenantId: string): Promise<unknown>;
    getPlatformBillingOverview(): Promise<unknown>;
    recordStripeWebhookEvent(input: {
      stripeEventId: string;
      eventType: string;
      tenantId?: string | null;
      payload: Record<string, unknown>;
    }): Promise<{ event: { id: string; status: string }; duplicate: boolean }>;
    markStripeWebhookEventProcessed(eventId: string): Promise<void>;
    markStripeWebhookEventFailed(eventId: string, error: string): Promise<void>;
    recordBillableAcceptedCall(input: {
      tenantId: string;
      providerCallId: string;
      quantity?: number | undefined;
      unitAmountCents?: number | undefined;
      metadata?: Record<string, unknown> | undefined;
    }): Promise<{
      event: {
        id: string;
        providerCallId: string;
        quantity: number;
        status: string;
      };
      duplicate: boolean;
    }>;
    markBillableUsageReported(
      tenantId: string,
      eventId: string,
      stripeMeterEventId: string,
    ): Promise<void>;
    markBillableUsageFailed(
      tenantId: string,
      eventId: string,
      detail: string,
    ): Promise<void>;
    getTenantByChannelConnection(
      channel: Channel,
      provider: string,
      externalAccountId: string,
    ): Promise<StoreTenant | null>;
    recordChannelWebhookEvent(input: {
      tenantId?: string | null;
      channel: Channel;
      providerEventId?: string | null;
      eventType: string;
      payload: Record<string, unknown>;
      status?: string;
    }): Promise<{
      event: { id: string; status: string; processedAt?: Date | null };
      duplicate: boolean;
    }>;
    markChannelWebhookEventProcessed(
      eventId: string,
      status?: string,
    ): Promise<void>;
    markChannelWebhookEventFailed(
      eventId: string,
      error: string,
    ): Promise<void>;
    listConversationMessages(
      tenantId: string,
      conversationId: string,
    ): Promise<unknown[]>;
    enrichConversationContact(input: {
      tenantId: string;
      conversationId: string;
      channel?: Channel;
      externalUserId?: string | null;
      contact: ContactProfileInput;
    }): Promise<unknown>;
    listHandoffs(
      tenantId: string,
      options?: PaginationOptions,
    ): Promise<unknown[]>;
    updateHandoff(
      tenantId: string,
      handoffId: string,
      input: UpdateHandoffInput,
    ): Promise<unknown>;
    getTenantAnalytics(tenantId: string): Promise<unknown>;
    findOrCreateConversation(input: {
      tenantId: string;
      publicConversationId?: string;
      channel: Channel;
      externalUserId?: string;
      locale?: string;
      contact?: ContactProfileInput;
    }): Promise<{ id: string; publicId: string }>;
    captureWebsiteLead(input: {
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
      conversation: { id: string; publicId: string };
      handoff: unknown;
    }>;
    addMessage(input: {
      tenantId: string;
      conversationId: string;
      channel: Channel;
      direction: "inbound" | "outbound";
      role: "user" | "assistant" | "system";
      content: string;
      trace?: Record<string, unknown>;
    }): Promise<unknown>;
    logUsage(input: {
      tenantId: string;
      channel: Channel;
      eventType: string;
      credits: number;
      estimatedCostCents?: number;
      metadata?: Record<string, unknown>;
    }): Promise<void>;
    recordMessageDelivery(input: {
      tenantId: string;
      messageId?: string | null;
      conversationId?: string | null;
      channel: Channel;
      provider: string;
      providerMessageId?: string | null;
      status: string;
      detail?: string | null;
      metadata?: Record<string, unknown>;
    }): Promise<unknown>;
    listWhatsappTemplates(tenantId: string): Promise<unknown[]>;
    upsertWhatsappTemplate(
      tenantId: string,
      input: WhatsappTemplateInput,
    ): Promise<unknown>;
    getWhatsappCompliance(tenantId: string): Promise<unknown>;
    exportTenantData(tenantId: string): Promise<unknown>;
    deleteTenantData(tenantId: string): Promise<void>;
    recordAuditEvent(
      tenantId: string,
      entry: {
        action: string;
        targetType: string;
        targetId: string;
        actorType: string;
        actorId?: string | null;
        metadata?: Record<string, unknown>;
      },
    ): Promise<void>;
  };

export type BuildServerOptions = {
  store: PlatformStore;
  adminToken: string;
  allowedOrigins?: string[];
  voicePublicUrl?: string;
  adminUser?: {
    email: string;
    name: string;
    role: "owner" | "admin" | "operator" | "viewer";
  };
  leadNotificationWebhookUrl?: string;
  leadNotificationEmailTo?: string;
  leadNotificationSmtp?: {
    host: string;
    port: number;
    secure: boolean;
    from: string;
    username?: string;
    password?: string;
  };
  leadNotificationEmailSender?: (email: LeadNotificationEmail) => Promise<void>;
  adminPublicUrl?: string;
  metaVerifyToken?: string;
  /**
   * Meta app secret used to verify the `X-Hub-Signature-256` header on inbound
   * webhooks. When omitted, signature verification is skipped (a warning is
   * logged) so existing/dev setups keep working.
   */
  metaAppSecret?: string;
  metaGraphApiVersion?: string;
  whatsappAccessToken?: string;
  messengerPageAccessToken?: string;
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  billingProvider?: BillingProvider;
  billing?: {
    selfServiceEnabled?: boolean;
    numberPriceId?: string;
    acceptedCallPriceId?: string;
    acceptedCallMeterEventName?: string;
    customerPortalReturnUrl?: string;
  };
  /**
   * Optional query embedder. When supplied, the answer engine runs hybrid
   * keyword + semantic retrieval. Omitted in keyword-only mode.
   */
  embedder?: (text: string) => Promise<number[] | null>;
  /**
   * Optional grounded answer writer. It only receives approved retrieved
   * knowledge; omitted keeps the deterministic extractive answer path.
   */
  groundedGenerator?: GroundedAnswerGenerator;
  supabaseAuth?: SupabaseAuthProvider;
};

type LeadNotificationPayload = {
  tenantId: string;
  tenantName: string;
  type: "lead_capture" | "readiness_assessment";
  conversationId: string;
  handoffId?: string;
  message: string;
  fields: Record<string, string>;
  pageUrl?: string;
  score?: number;
  adminUrl?: string;
};

type LeadNotificationEmail = {
  to: string;
  from: string;
  subject: string;
  text: string;
};

type ProductionReadinessStatus = "pass" | "warn" | "fail";

type ProductionReadinessCheck = {
  id: string;
  title: string;
  detail: string;
  status: ProductionReadinessStatus;
  actionLabel: string;
  weight: number;
  score: number;
};

type ProductionReadinessSection = {
  id: string;
  title: string;
  score: number;
  checks: ProductionReadinessCheck[];
};

type ProductionReadinessResult = {
  generatedAt: string;
  score: number;
  status: "ready_for_beta" | "needs_work" | "not_ready";
  summary: {
    passed: number;
    warnings: number;
    failed: number;
    blockers: ProductionReadinessCheck[];
    nextActions: ProductionReadinessCheck[];
  };
  sections: ProductionReadinessSection[];
};

const defaultAutomationSettings: AutomationSettings = {
  ownerLeadEmailEnabled: true,
  visitorConfirmationEmailEnabled: true,
  autoQualifyReadinessEnabled: true,
  autoQualifyLeadDetailsEnabled: true,
  weeklySummaryEmailEnabled: true,
  staleLeadReminderDays: 3,
  readinessQualificationScore: 70,
};
const defaultAdminPublicUrl =
  "https://assaddar-admin-production.up.railway.app";

// Inbound webhook routes stash the raw (pre-parse) body on the request so the
// signature can be verified over the exact bytes Meta signed.
type RequestWithRawBody = FastifyRequest & { rawBody?: Buffer };

/**
 * Interpret the TRUST_PROXY env var into a Fastify `trustProxy` value.
 *
 * - unset / "" / "false" → `false` (trust nobody; use the socket peer IP)
 * - "true"               → trust every hop (only safe if all hops are trusted)
 * - an integer "n"       → trust `n` proxy hops closest to the server
 * - anything else        → treated as a comma-separated IP/CIDR allowlist
 */
export function parseTrustProxy(
  value: string | undefined,
): boolean | number | string {
  if (value === undefined || value.trim() === "" || value === "false") {
    return false;
  }
  if (value === "true") {
    return true;
  }
  const hops = Number(value);
  if (Number.isInteger(hops) && hops >= 0) {
    return hops;
  }
  return value;
}

export async function buildServer(
  options: BuildServerOptions,
): Promise<FastifyInstance> {
  const app = Fastify({
    // Honour an inbound correlation id (e.g. from a gateway/load balancer) so
    // logs can be traced across services; otherwise Fastify generates one.
    requestIdHeader: "x-request-id",
    // Behind Railway's (or any) reverse proxy, the socket peer is the proxy, so
    // `request.ip` would be the proxy address for everyone — collapsing per-IP
    // rate limiting and mis-logging session IPs. TRUST_PROXY tells Fastify how
    // many forwarded hops to trust so it derives the real client IP. Default is
    // OFF (dev-safe): trusting X-Forwarded-For when there is no proxy would let
    // any client spoof its IP. In production set TRUST_PROXY=1 (one known proxy)
    // or a CIDR allowlist — never `true` unless every hop is trusted.
    trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
    bodyLimit: DOCUMENT_UPLOAD_BODY_LIMIT_BYTES,
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      // Never write credentials into logs.
      redact: [
        'req.headers["x-admin-token"]',
        "req.headers.authorization",
        "req.headers.cookie",
        'res.headers["set-cookie"]',
      ],
    },
  });

  // Process-wide metrics registry. Dependency-free Prometheus exposition; see
  // ./metrics and the GET /metrics route below.
  const metrics = new MetricsRegistry();

  // Record request count and latency on every response. We label by the route
  // *template* (e.g. `/admin/tenants/:tenantId`) rather than the raw URL, so a
  // tenant id or other path param can never explode label cardinality or leak
  // tenant data into the metrics. Unmatched routes (404s) collapse to a single
  // `<unmatched>` series for the same reason.
  app.addHook("onResponse", async (request, reply) => {
    // Fastify 5 exposes the matched route template on `routeOptions.url`
    // (the older `routerPath` was removed). Unmatched routes have none.
    const route = request.routeOptions?.url ?? "<unmatched>";
    const method = request.method;
    const status = String(reply.statusCode);
    metrics.httpRequestsTotal.inc({ method, route, status });
    // reply.elapsedTime is milliseconds; the histogram is in seconds.
    metrics.httpRequestDuration.observe(
      { method, route },
      reply.elapsedTime / 1000,
    );
  });

  // Surface the correlation id on responses so clients/operators can quote it,
  // and apply conservative security headers to every response. These are safe
  // for a JSON API and do not interfere with CORS (which sets its own
  // Access-Control-* headers) or with the existing response bodies.
  app.addHook("onSend", async (request, reply) => {
    reply.header("x-request-id", request.id);
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    // The API serves JSON/plain-text only and never renders HTML, so a locked
    // down CSP that forbids any embedded/active content is appropriate.
    reply.header(
      "Content-Security-Policy",
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );
  });

  const allowedOrigins = options.allowedOrigins ?? [];
  if (allowedOrigins.includes("*") && process.env.NODE_ENV === "production") {
    throw new Error(
      "WIDGET_ALLOWED_ORIGINS must not contain '*' when credentialed CORS is enabled in production.",
    );
  }
  await app.register(cors, {
    credentials: true,
    origin(origin, callback) {
      if (
        !origin ||
        allowedOrigins.includes("*") ||
        allowedOrigins.includes(origin)
      ) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin not allowed"), false);
    },
  });

  const globalRateLimitMax = Number(process.env.RATE_LIMIT_MAX ?? 120);
  await app.register(rateLimit, {
    max: Number.isFinite(globalRateLimitMax) ? globalRateLimitMax : 120,
    timeWindow: process.env.RATE_LIMIT_WINDOW ?? "1 minute",
  });

  // Periodically drop expired sessions so the table does not grow unbounded.
  // Unref'd so it never keeps the process alive on its own.
  const sessionCleanupMs = 60 * 60 * 1000;
  const sessionCleanupTimer = setInterval(() => {
    void options.store
      .deleteExpiredSessions()
      .then((removed) => {
        if (removed > 0) {
          app.log.info({ removed }, "Pruned expired sessions");
        }
      })
      .catch((error) => app.log.error(error, "Session cleanup failed"));
  }, sessionCleanupMs);
  sessionCleanupTimer.unref?.();
  app.addHook("onClose", async () => {
    clearInterval(sessionCleanupTimer);
  });

  const engine = createAnswerEngine({
    dataStore: options.store,
    handoffStore: options.store,
    ...(options.embedder ? { embedder: options.embedder } : {}),
    ...(options.groundedGenerator
      ? { groundedGenerator: options.groundedGenerator }
      : {}),
  });
  const websiteAdapter = new WebsiteAdapter();
  const metaAdapters: Record<
    "whatsapp" | "messenger" | "instagram",
    ChannelAdapter
  > = {
    whatsapp: new WhatsAppCloudAdapter(
      options.metaVerifyToken ?? "change-me-meta-verify-token",
      options.whatsappAccessToken,
      options.metaGraphApiVersion,
    ),
    messenger: new MetaMessengerAdapter(
      "messenger",
      options.metaVerifyToken ?? "change-me-meta-verify-token",
      options.messengerPageAccessToken,
      options.metaGraphApiVersion,
    ),
    instagram: new MetaMessengerAdapter(
      "instagram",
      options.metaVerifyToken ?? "change-me-meta-verify-token",
      options.messengerPageAccessToken,
      options.metaGraphApiVersion,
    ),
  };

  // Liveness probe: cheap, never touches dependencies.
  app.get("/health", async () => ({
    ok: true,
    service: "assaddar-ai-communication-api",
  }));

  // Readiness probe: verifies the database is reachable. Returns 503 when not,
  // so orchestrators can hold traffic until the dependency recovers.
  app.get("/ready", async (_request, reply) => {
    const dbUp = await options.store.ping();
    if (!dbUp) {
      return reply.code(503).send({
        ok: false,
        service: "assaddar-ai-communication-api",
        db: "down",
      });
    }
    return { ok: true, service: "assaddar-ai-communication-api", db: "up" };
  });

  // Prometheus scrape endpoint. Left UNAUTHENTICATED on purpose: this is the
  // conventional setup for a metrics endpoint scraped over a private network
  // (cluster network policy / firewall), and many scrape agents do not send an
  // admin token. It exposes only aggregate, low-cardinality counters/gauges —
  // no tenant data, request bodies, or secrets — so it is safe to expose this
  // way. If this API is ever scraped over an untrusted network, put it behind
  // the gateway/network policy rather than guarding it with the admin token.
  app.get("/metrics", async (_request, reply) => {
    reply.header("Content-Type", METRICS_CONTENT_TYPE);
    return metrics.render();
  });

  app.get("/openapi.json", async () => openApiDocument);

  app.post(
    "/auth/login",
    {
      config: {
        // Throttle credential stuffing / brute-force attempts per source IP.
        rateLimit: { max: 10, timeWindow: "5 minutes" },
      },
    },
    async (request, reply) => {
      if (!isTrustedStateChangeOrigin(request, options)) {
        return reply.code(403).send({ error: "Untrusted request origin." });
      }
      const body = LoginSchema.parse(request.body);
      const user = await options.store.findUserByEmailForAuth(body.email);
      if (
        !user ||
        user.status !== "active" ||
        !user.passwordHash ||
        !(await verifyPassword(body.password, user.passwordHash))
      ) {
        return reply.code(401).send({ error: "Invalid email or password." });
      }

      const token = createSessionToken();
      const expiresAt = new Date(Date.now() + sessionDurationMs());
      await options.store.createUserSession({
        userId: user.id,
        tokenHash: hashSecret(token),
        expiresAt,
        userAgent: request.headers["user-agent"] ?? null,
        ipAddress: request.ip,
      });
      setSessionCookie(reply, token, expiresAt);

      const session = await options.store.getAuthSession(hashSecret(token));
      if (!session) {
        return reply.code(500).send({ error: "Failed to create session." });
      }
      return buildUserSessionPayload(session);
    },
  );

  app.post("/auth/logout", async (request, reply) => {
    if (
      getSessionToken(request) &&
      !isTrustedStateChangeOrigin(request, options)
    ) {
      return reply.code(403).send({ error: "Untrusted request origin." });
    }
    const token = getSessionToken(request);
    if (token) {
      await options.store.deleteUserSession(hashSecret(token));
    }
    clearSessionCookie(reply);
    return { authenticated: false };
  });

  app.get(
    "/auth/session",
    { preHandler: requireAuth(options) },
    async (request) => buildSessionPayload(request),
  );

  app.post("/auth/invites/accept", async (request, reply) => {
    if (!isTrustedStateChangeOrigin(request, options)) {
      return reply.code(403).send({ error: "Untrusted request origin." });
    }
    const body = AcceptTenantInviteSchema.parse(request.body);
    const user = await options.store.acceptTenantInvite({
      tokenHash: hashSecret(body.token),
      name: body.name,
      passwordHash: await hashPassword(body.password),
    });
    const savedUser = isRecord(user)
      ? await options.store.findUserByEmailForAuth(String(user.email ?? ""))
      : null;
    if (!savedUser) {
      return reply.code(404).send({ error: "Invite is invalid or expired." });
    }

    const token = createSessionToken();
    const expiresAt = new Date(Date.now() + sessionDurationMs());
    await options.store.createUserSession({
      userId: savedUser.id,
      tokenHash: hashSecret(token),
      expiresAt,
      userAgent: request.headers["user-agent"] ?? null,
      ipAddress: request.ip,
    });
    setSessionCookie(reply, token, expiresAt);

    const session = await options.store.getAuthSession(hashSecret(token));
    if (!session) {
      return reply.code(500).send({ error: "Failed to create session." });
    }
    return buildUserSessionPayload(session);
  });

  app.post(
    "/onboarding/projects",
    { preHandler: requireAuth(options) },
    async (request, reply) => {
      const auth = getRequestAuth(request);
      if (auth.kind !== "user") {
        return reply.code(403).send({ error: "User login required." });
      }
      const body = OnboardingProjectSchema.parse(request.body);
      const tenant = await options.store.createSelfServiceTenant({
        name: body.name,
        slug: body.slug,
        owner: {
          email: auth.user.email,
          name: auth.user.name,
          authUserId: auth.sessionId.startsWith("supabase:")
            ? auth.sessionId.slice("supabase:".length)
            : null,
        },
        defaultLocale: body.defaultLocale,
        ...(body.theme ? { theme: body.theme } : {}),
      });
      return reply.code(201).send(tenant);
    },
  );

  app.get(
    "/onboarding/tenants/:tenantId/phone-numbers",
    { preHandler: requireTenantAccess(options, "tenant_admin") },
    async (request) => {
      const query = OnboardingPhoneNumberQuerySchema.parse(request.query);
      const numbers = await options.store.listAvailableTelephoneNumbers(query);
      return {
        currency: "eur",
        numberMonthlyPriceCents: 300,
        acceptedCallPriceCents: 10,
        numbers,
      };
    },
  );

  app.post(
    "/onboarding/tenants/:tenantId/phone-number-reservations",
    { preHandler: requireTenantAccess(options, "tenant_admin") },
    async (request, reply) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const body = ReservePhoneNumberSchema.parse(request.body);
      const auth = getRequestAuth(request);
      const reservation = await options.store.createTelephoneNumberReservation(
        tenantId,
        {
          numberId: body.numberId,
          userId: auth.kind === "user" ? auth.user.id : null,
        },
      );
      return reply.code(201).send(reservation);
    },
  );

  app.get(
    "/onboarding/tenants/:tenantId/state",
    { preHandler: requireTenantAccess(options, "viewer") },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      return options.store.getOnboardingState(tenantId);
    },
  );

  app.post(
    "/billing/tenants/:tenantId/checkout-sessions",
    { preHandler: requireTenantAccess(options, "tenant_owner") },
    async (request, reply) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const body = BillingCheckoutSessionSchema.parse(request.body);
      const auth = getRequestAuth(request);
      if (auth.kind !== "user") {
        return reply.code(403).send({ error: "User login required." });
      }
      const billing = requireBilling(options, reply);
      if (!billing) {
        return reply;
      }
      const reservation =
        await options.store.getActiveTelephoneNumberReservation(tenantId);
      const reservationRecord = asRecord(reservation);
      if (!reservationRecord?.id) {
        return reply
          .code(400)
          .send({ error: "Reserve a telephone number before checkout." });
      }
      const account = await ensureStripeCustomerForTenant({
        options,
        tenantId,
        auth,
      });
      const session = await billing.provider.createCheckoutSession({
        customerId: account.stripeCustomerId,
        successUrl:
          body.successUrl ??
          buildAdminReturnUrl(options, `/?tenant=${tenantId}&billing=success`),
        cancelUrl:
          body.cancelUrl ??
          buildAdminReturnUrl(options, `/?tenant=${tenantId}&billing=cancel`),
        numberPriceId: billing.numberPriceId,
        acceptedCallPriceId: billing.acceptedCallPriceId,
        metadata: {
          tenant_id: tenantId,
          reservation_id: String(reservationRecord.id),
          number_id: String(reservationRecord.numberId ?? ""),
          billing_mode: "phone_ai_v1",
        },
      });
      return { checkoutSessionId: session.id, url: session.url };
    },
  );

  app.post(
    "/billing/tenants/:tenantId/customer-portal",
    { preHandler: requireTenantAccess(options, "tenant_owner") },
    async (request, reply) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const billing = requireBilling(options, reply);
      if (!billing) {
        return reply;
      }
      const account = await options.store.getBillingAccount(tenantId);
      if (!account?.stripeCustomerId) {
        return reply
          .code(400)
          .send({ error: "Stripe customer is not configured." });
      }
      const session = await billing.provider.createCustomerPortalSession({
        customerId: account.stripeCustomerId,
        returnUrl:
          billing.customerPortalReturnUrl ??
          buildAdminReturnUrl(options, `/?tenant=${tenantId}&billing=portal`),
      });
      return { url: session.url };
    },
  );

  app.post(
    "/webhooks/stripe",
    {
      preParsing: async (request, _reply, payload) => {
        const chunks: Buffer[] = [];
        for await (const chunk of payload) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const raw = Buffer.concat(chunks);
        (request as RequestWithRawBody).rawBody = raw;
        return Readable.from([raw]);
      },
    },
    async (request, reply) => {
      const billing = requireBilling(options, reply);
      if (!billing) {
        return reply;
      }
      let event: StripeWebhookEvent;
      try {
        event = billing.provider.verifyWebhook({
          rawBody: (request as RequestWithRawBody).rawBody ?? Buffer.alloc(0),
          signatureHeader: firstHeader(request.headers["stripe-signature"]),
        });
      } catch (error) {
        return reply.code(400).send({
          error:
            error instanceof Error ? error.message : "Invalid Stripe webhook.",
        });
      }

      const tenantId = stripeObjectMetadata(event).tenant_id;
      const recorded = await options.store.recordStripeWebhookEvent({
        stripeEventId: event.id,
        eventType: event.type,
        tenantId: typeof tenantId === "string" ? tenantId : null,
        payload: event as unknown as Record<string, unknown>,
      });
      if (recorded.duplicate) {
        return { received: true, duplicate: true };
      }

      try {
        await processStripeWebhookEvent(options, billing, event);
        await options.store.markStripeWebhookEventProcessed(recorded.event.id);
        return { received: true };
      } catch (error) {
        await options.store.markStripeWebhookEventFailed(
          recorded.event.id,
          error instanceof Error ? error.message : "Stripe webhook failed.",
        );
        throw error;
      }
    },
  );

  app.get(
    "/admin/billing/overview",
    { preHandler: requirePlatformOwner(options) },
    async () => options.store.getPlatformBillingOverview(),
  );

  app.get(
    "/admin/telephone/numbers",
    { preHandler: requirePlatformOwner(options) },
    async () => options.store.listTelephoneNumberInventory(),
  );

  app.post(
    "/admin/telephone/numbers",
    { preHandler: requirePlatformOwner(options) },
    async (request, reply) => {
      const body = TelephoneNumberInventorySchema.parse(request.body);
      const number = await options.store.createTelephoneNumberInventory(body);
      return reply.code(201).send(number);
    },
  );

  app.patch(
    "/admin/telephone/numbers/:numberId",
    { preHandler: requirePlatformOwner(options) },
    async (request) => {
      const { numberId } = z
        .object({ numberId: z.string().uuid() })
        .parse(request.params);
      const body = TelephoneNumberInventoryUpdateSchema.parse(request.body);
      return options.store.updateTelephoneNumberInventory(numberId, body);
    },
  );

  app.post(
    "/admin/tenants/:tenantId/billing/accepted-calls",
    { preHandler: requireTenantAccess(options, "tenant_admin") },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const body = BillableAcceptedCallSchema.parse(request.body);
      const recorded = await options.store.recordBillableAcceptedCall({
        tenantId,
        providerCallId: body.providerCallId,
        quantity: body.quantity,
        unitAmountCents: body.unitAmountCents,
        ...(body.metadata ? { metadata: body.metadata } : {}),
      });
      await reportBillableUsageToStripe(options, tenantId, recorded.event);
      return recorded;
    },
  );

  app.get(
    "/admin/session",
    { preHandler: requireAuth(options) },
    async (request) => buildSessionPayload(request),
  );

  app.get(
    "/admin/tenants",
    { preHandler: requireAuth(options) },
    async (request) => {
      const auth = getRequestAuth(request);
      if (auth.kind === "admin" || isPlatformOwner(auth)) {
        return options.store.listTenants();
      }
      return options.store.listTenantsForUser(auth.user.id);
    },
  );

  app.post(
    "/admin/tenants",
    { preHandler: requirePlatformOwner(options) },
    async (request, reply) => {
      const body = CreateTenantSchema.parse(request.body);
      const tenant = await options.store.createTenant(body);
      return reply.code(201).send(tenant);
    },
  );

  // Platform-operator console: cross-tenant aggregate counts and delivery
  // health only — NO personal data — so the platform admin can watch load and
  // faults without seeing any tenant's messages or contacts (R4 boundary).
  app.get(
    "/admin/platform/overview",
    { preHandler: requirePlatformOwner(options) },
    async () => options.store.getPlatformOverview(),
  );

  app.patch(
    "/admin/tenants/:tenantId",
    { preHandler: requireTenantAccess(options, "tenant_admin") },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const body = UpdateTenantSchema.parse(request.body);
      return options.store.updateTenant(tenantId, body);
    },
  );

  app.get(
    "/admin/tenants/:tenantId/users",
    { preHandler: requireTenantAccess(options, "tenant_admin") },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const pagination = PaginationQuerySchema.parse(request.query);
      return options.store.listTenantUsers(tenantId, pagination);
    },
  );

  app.post(
    "/admin/tenants/:tenantId/users",
    { preHandler: requireTenantAccess(options, "tenant_admin") },
    async (request, reply) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const body = CreateTenantUserSchema.parse(request.body);
      if (!canGrantTenantRole(getRequestAuth(request), tenantId, body.role)) {
        return reply.code(403).send({
          error: "Cannot grant a role above your current tenant role.",
        });
      }
      const provisionedUser =
        options.supabaseAuth && body.password
          ? await options.supabaseAuth.createUser({
              email: body.email,
              name: body.name,
              password: body.password,
            })
          : null;
      const user = await options.store.upsertTenantUser(tenantId, {
        email: body.email,
        name: body.name,
        role: body.role,
        ...(provisionedUser?.authUserId
          ? { authUserId: provisionedUser.authUserId }
          : {}),
        ...(!options.supabaseAuth && body.password
          ? { passwordHash: await hashPassword(body.password) }
          : {}),
      });
      return reply.code(201).send(user);
    },
  );

  app.get(
    "/admin/tenants/:tenantId/invites",
    { preHandler: requireTenantAccess(options, "tenant_admin") },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      return options.store.listTenantInvites(tenantId);
    },
  );

  app.post(
    "/admin/tenants/:tenantId/invites",
    { preHandler: requireTenantAccess(options, "tenant_admin") },
    async (request, reply) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const body = CreateTenantInviteSchema.parse(request.body);
      if (!canGrantTenantRole(getRequestAuth(request), tenantId, body.role)) {
        return reply.code(403).send({
          error: "Cannot invite a role above your current tenant role.",
        });
      }
      if (options.supabaseAuth) {
        const inviteLink = await options.supabaseAuth.createInviteLink({
          email: body.email,
          name: body.email,
          redirectTo: options.adminPublicUrl ?? defaultAdminPublicUrl,
        });
        const invite = await options.store.createTenantInvite(tenantId, {
          email: body.email,
          role: body.role,
          tokenHash: hashSecret(createSessionToken()),
          expiresAt: new Date(Date.now() + inviteDurationMs()),
          invitedByUserId:
            getRequestAuth(request).kind === "user"
              ? getRequestAuth(request).user.id
              : null,
        });
        await options.store.upsertTenantUser(tenantId, {
          email: inviteLink.email,
          name: inviteLink.name ?? inviteLink.email,
          role: body.role,
          authUserId: inviteLink.authUserId,
        });
        return reply.code(201).send({
          invite,
          acceptUrl: inviteLink.acceptUrl,
        });
      }
      const token = createSessionToken();
      const invite = await options.store.createTenantInvite(tenantId, {
        email: body.email,
        role: body.role,
        tokenHash: hashSecret(token),
        expiresAt: new Date(Date.now() + inviteDurationMs()),
        invitedByUserId:
          getRequestAuth(request).kind === "user"
            ? getRequestAuth(request).user.id
            : null,
      });
      return reply.code(201).send({
        invite,
        token,
        acceptUrl: buildInviteAcceptUrl(options, token),
      });
    },
  );

  app.get(
    "/admin/tenants/:tenantId/channel-connections",
    { preHandler: requireTenantAccess(options, "viewer") },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const tenant = await options.store.getTenant(tenantId);
      const connections = await options.store.listChannelConnections(tenantId);
      return buildChannelConnectionDashboard({
        tenant,
        connections,
        options,
      });
    },
  );

  app.put(
    "/admin/tenants/:tenantId/channel-connections/:channel",
    { preHandler: requireTenantAccess(options, "tenant_admin") },
    async (request) => {
      const { tenantId, channel } = ParamsChannelSchema.parse(request.params);
      const body = ChannelConnectionSchema.parse({
        ...(isRecord(request.body) ? request.body : {}),
        channel,
      });
      return options.store.upsertChannelConnection(tenantId, body);
    },
  );

  app.get(
    "/admin/tenants/:tenantId/telephone/twilio/search",
    { preHandler: requireTenantAccess(options, "tenant_admin") },
    async (request, reply) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const tenant = await options.store.getTenant(tenantId);
      if (!tenant) {
        return reply.code(404).send({ error: "Tenant not found." });
      }
      const credentials = getTwilioCredentials(options);
      if (!credentials) {
        return reply
          .code(503)
          .send({ error: "Twilio credentials are not configured." });
      }

      const query = TwilioNumberSearchQuerySchema.parse(request.query);
      try {
        const pricing = await fetchTwilioNumberPricing(credentials, query);
        const numbers = await searchTwilioAvailableNumbers(
          credentials,
          query,
          pricing,
        );
        return {
          country: query.country,
          numberType: query.numberType,
          credentialConfigured: true,
          webhookUrl: buildTelephoneVoiceWebhookUrl(options, tenant),
          pricing,
          compliance: buildTelephoneComplianceNotice(
            query.country,
            query.numberType,
          ),
          numbers,
        };
      } catch (error) {
        return sendTwilioError(reply, error);
      }
    },
  );

  app.get(
    "/admin/tenants/:tenantId/telephone/twilio/numbers",
    { preHandler: requireTenantAccess(options, "tenant_admin") },
    async (request, reply) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const tenant = await options.store.getTenant(tenantId);
      if (!tenant) {
        return reply.code(404).send({ error: "Tenant not found." });
      }
      const credentials = getTwilioCredentials(options);
      if (!credentials) {
        return reply
          .code(503)
          .send({ error: "Twilio credentials are not configured." });
      }

      try {
        const result = await twilioApiRequest<TwilioIncomingPhoneNumbersResult>(
          credentials,
          "/2010-04-01/Accounts/{AccountSid}/IncomingPhoneNumbers.json",
          {
            method: "GET",
            query: { PageSize: "50" },
          },
        );
        return {
          credentialConfigured: true,
          webhookUrl: buildTelephoneVoiceWebhookUrl(options, tenant),
          numbers: (result.incoming_phone_numbers ?? []).map(
            mapTwilioIncomingPhoneNumber,
          ),
        };
      } catch (error) {
        return sendTwilioError(reply, error);
      }
    },
  );

  app.post(
    "/admin/tenants/:tenantId/telephone/twilio/purchase",
    { preHandler: requireTenantAccess(options, "tenant_admin") },
    async (request, reply) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const tenant = await options.store.getTenant(tenantId);
      if (!tenant) {
        return reply.code(404).send({ error: "Tenant not found." });
      }
      const credentials = getTwilioCredentials(options);
      if (!credentials) {
        return reply
          .code(503)
          .send({ error: "Twilio credentials are not configured." });
      }

      const body = PurchaseTwilioNumberSchema.parse(request.body);
      const webhookUrl = buildTelephoneVoiceWebhookUrl(options, tenant);
      try {
        const purchased = await twilioApiRequest<TwilioIncomingPhoneNumber>(
          credentials,
          "/2010-04-01/Accounts/{AccountSid}/IncomingPhoneNumbers.json",
          {
            method: "POST",
            form: {
              PhoneNumber: body.phoneNumber,
              VoiceUrl: webhookUrl,
              VoiceMethod: "POST",
              ...(body.friendlyName ? { FriendlyName: body.friendlyName } : {}),
              ...(body.bundleSid ? { BundleSid: body.bundleSid } : {}),
              ...(body.addressSid ? { AddressSid: body.addressSid } : {}),
            },
          },
        );
        const mappedNumber = mapTwilioIncomingPhoneNumber(purchased);
        const connection = await options.store.upsertChannelConnection(
          tenantId,
          {
            channel: "telephone",
            provider: "twilio",
            externalAccountId: mappedNumber.phoneNumber ?? body.phoneNumber,
            status: "connected",
            settings: {
              mode: "purchased_twilio",
              providerNumberSid: mappedNumber.sid,
              phoneNumber: mappedNumber.phoneNumber ?? body.phoneNumber,
              numberType: body.numberType,
              voiceUrl: webhookUrl,
              bundleSid: body.bundleSid ?? null,
              addressSid: body.addressSid ?? null,
              purchasedAt: new Date().toISOString(),
            },
          },
        );
        return reply.code(201).send({
          connection,
          number: mappedNumber,
          webhookUrl,
          compliance: buildTelephoneComplianceNotice(
            countryFromE164Number(body.phoneNumber),
            body.numberType,
          ),
        });
      } catch (error) {
        return sendTwilioError(reply, error);
      }
    },
  );

  app.post(
    "/admin/tenants/:tenantId/telephone/twilio/connect-existing",
    { preHandler: requireTenantAccess(options, "tenant_admin") },
    async (request, reply) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const tenant = await options.store.getTenant(tenantId);
      if (!tenant) {
        return reply.code(404).send({ error: "Tenant not found." });
      }
      const credentials = getTwilioCredentials(options);
      if (!credentials) {
        return reply
          .code(503)
          .send({ error: "Twilio credentials are not configured." });
      }

      const body = ConnectExistingTwilioNumberSchema.parse(request.body);
      const webhookUrl = buildTelephoneVoiceWebhookUrl(options, tenant);
      try {
        const numberSid =
          body.phoneNumberSid ??
          (await findTwilioIncomingNumberSid(credentials, body.phoneNumber));
        if (!numberSid) {
          return reply.code(404).send({
            error: "Twilio number not found in this account.",
          });
        }
        const updated = await twilioApiRequest<TwilioIncomingPhoneNumber>(
          credentials,
          `/2010-04-01/Accounts/{AccountSid}/IncomingPhoneNumbers/${numberSid}.json`,
          {
            method: "POST",
            form: {
              VoiceUrl: webhookUrl,
              VoiceMethod: "POST",
            },
          },
        );
        const mappedNumber = mapTwilioIncomingPhoneNumber(updated);
        const connection = await options.store.upsertChannelConnection(
          tenantId,
          {
            channel: "telephone",
            provider: "twilio",
            externalAccountId:
              mappedNumber.phoneNumber ?? body.phoneNumber ?? numberSid,
            status: "connected",
            settings: {
              mode: "existing_twilio",
              providerNumberSid: mappedNumber.sid ?? numberSid,
              phoneNumber: mappedNumber.phoneNumber ?? body.phoneNumber ?? null,
              numberType: body.numberType,
              voiceUrl: webhookUrl,
              connectedAt: new Date().toISOString(),
            },
          },
        );
        return {
          connection,
          number: mappedNumber,
          webhookUrl,
        };
      } catch (error) {
        return sendTwilioError(reply, error);
      }
    },
  );

  app.post(
    "/admin/tenants/:tenantId/telephone/new-number",
    { preHandler: requireTenantAccess(options, "tenant_admin") },
    async (request, reply) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const tenant = await options.store.getTenant(tenantId);
      if (!tenant) {
        return reply.code(404).send({ error: "Tenant not found." });
      }
      const body = NewTelephoneNumberSetupSchema.parse(request.body);
      const voiceBridgeUrl = buildTelephoneVoiceBridgeUrl(options, tenant);
      const sipTarget = buildTelephoneSipTarget(tenant);
      const currentSettings = await getTelephoneConnectionSettings(
        options,
        tenantId,
        body.provider,
      );
      const instructions = buildNewTelephoneNumberInstructions({
        provider: body.provider,
        requestedCountry: body.requestedCountry,
        numberType: body.numberType,
        areaCode: body.areaCode,
        locality: body.locality,
        orderedNumber: body.orderedNumber,
        sipTarget,
      });
      const status =
        body.orderedNumber && body.sipConfigured ? "connected" : "pending";
      const externalAccountId =
        body.orderedNumber ??
        [body.provider, body.requestedCountry, body.areaCode, body.locality]
          .filter(Boolean)
          .join(":");
      const connection = await options.store.upsertChannelConnection(tenantId, {
        channel: "telephone",
        provider: body.provider,
        externalAccountId,
        status,
        settings: {
          ...currentSettings,
          mode: "new_number_provider",
          setupType: "new_number",
          provider: body.provider,
          requestedCountry: body.requestedCountry,
          numberType: body.numberType,
          areaCode: body.areaCode ?? null,
          locality: body.locality ?? null,
          orderedNumber: body.orderedNumber ?? null,
          sipRegistrar: body.sipRegistrar ?? null,
          sipUsername: body.sipUsername ?? null,
          sipConfigured: body.sipConfigured,
          fallbackNumber: body.fallbackNumber ?? null,
          voiceBridgeUrl,
          sipTarget,
          instructions,
          setupChecklist: {
            ...asRecord(currentSettings.setupChecklist),
            numberOrdered: Boolean(body.orderedNumber),
            sipConfigured: body.sipConfigured,
          },
          notes: body.notes ?? null,
          updatedAt: new Date().toISOString(),
        },
      });
      return reply.code(201).send({
        connection,
        webhookUrl: voiceBridgeUrl,
        sipTarget,
        instructions,
      });
    },
  );

  app.post(
    "/admin/tenants/:tenantId/telephone/carrier-forwarding",
    { preHandler: requireTenantAccess(options, "tenant_admin") },
    async (request, reply) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const tenant = await options.store.getTenant(tenantId);
      if (!tenant) {
        return reply.code(404).send({ error: "Tenant not found." });
      }
      const body = CarrierForwardingSchema.parse(request.body);
      const voiceBridgeUrl = buildTelephoneVoiceBridgeUrl(options, tenant);
      const sipTarget = buildTelephoneSipTarget(tenant);
      const currentSettings = await getTelephoneConnectionSettings(
        options,
        tenantId,
        body.provider,
      );
      const instructions = buildCarrierForwardingInstructions({
        aiNumber: body.aiNumber,
        provider: body.provider,
        sipTarget,
      });
      const connection = await options.store.upsertChannelConnection(tenantId, {
        channel: "telephone",
        provider: body.provider,
        externalAccountId: body.existingNumber,
        status: body.forwardingConfirmed ? "connected" : "pending",
        settings: {
          ...currentSettings,
          mode: "carrier_forwarding",
          setupType: "existing_forwarding",
          provider: body.provider,
          existingNumber: body.existingNumber,
          aiNumber: body.aiNumber,
          carrierName: body.carrierName ?? null,
          forwardingConfirmed: body.forwardingConfirmed,
          fallbackNumber: body.fallbackNumber ?? null,
          voiceBridgeUrl,
          sipTarget,
          instructions,
          setupChecklist: {
            ...asRecord(currentSettings.setupChecklist),
            numberOrdered: Boolean(body.existingNumber && body.aiNumber),
            sipConfigured: body.forwardingConfirmed,
          },
          notes: body.notes ?? null,
          updatedAt: new Date().toISOString(),
        },
      });
      return {
        connection,
        webhookUrl: voiceBridgeUrl,
        sipTarget,
        instructions,
      };
    },
  );

  app.post(
    "/admin/tenants/:tenantId/telephone/sip-byoc",
    { preHandler: requireTenantAccess(options, "tenant_admin") },
    async (request, reply) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const tenant = await options.store.getTenant(tenantId);
      if (!tenant) {
        return reply.code(404).send({ error: "Tenant not found." });
      }
      const body = SipByocSetupSchema.parse(request.body);
      const voiceBridgeUrl = buildTelephoneVoiceBridgeUrl(options, tenant);
      const sipTarget = buildTelephoneSipTarget(tenant);
      const currentSettings = await getTelephoneConnectionSettings(
        options,
        tenantId,
        body.provider,
      );
      const instructions = buildSipByocInstructions({
        provider: body.provider,
        voiceBridgeUrl,
        sipTarget,
      });
      const connection = await options.store.upsertChannelConnection(tenantId, {
        channel: "telephone",
        provider: body.provider,
        externalAccountId:
          body.publicNumber ??
          body.inboundSipUri ??
          body.trunkSid ??
          body.sipRegistrar ??
          body.sipDomain ??
          "SIP/BYOC",
        status: body.sipConfigured ? "connected" : "pending",
        settings: {
          ...currentSettings,
          mode: "sip_byoc",
          setupType: "sip_trunk",
          provider: body.provider,
          carrierName: body.carrierName ?? null,
          sipDomain: body.sipDomain ?? null,
          sipRegistrar: body.sipRegistrar ?? null,
          sipUsername: body.sipUsername ?? null,
          trunkSid: body.trunkSid ?? null,
          inboundSipUri: body.inboundSipUri ?? null,
          publicNumber: body.publicNumber ?? null,
          fallbackNumber: body.fallbackNumber ?? null,
          sipConfigured: body.sipConfigured,
          voiceBridgeUrl,
          sipTarget,
          instructions,
          setupChecklist: {
            ...asRecord(currentSettings.setupChecklist),
            numberOrdered: Boolean(
              body.publicNumber || body.inboundSipUri || body.trunkSid,
            ),
            sipConfigured: body.sipConfigured,
          },
          notes: body.notes ?? null,
          updatedAt: new Date().toISOString(),
        },
      });
      return {
        connection,
        webhookUrl: voiceBridgeUrl,
        sipTarget,
        instructions,
      };
    },
  );

  app.put(
    "/admin/tenants/:tenantId/telephone/settings",
    { preHandler: requireTenantAccess(options, "tenant_admin") },
    async (request, reply) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const tenant = await options.store.getTenant(tenantId);
      if (!tenant) {
        return reply.code(404).send({ error: "Tenant not found." });
      }
      const body = TelephoneSettingsSchema.parse(request.body);
      const connections = await options.store.listChannelConnections(tenantId);
      const current = connections
        .map((connection) => asRecord(connection))
        .find((connection) => connection.channel === "telephone");
      const provider =
        body.provider ?? normalizeTelephoneProvider(current?.provider);
      const currentSettings = asRecord(current?.settings);
      const voiceBridgeUrl = buildTelephoneVoiceBridgeUrl(options, tenant);
      const sipTarget = buildTelephoneSipTarget(tenant);
      const settings = buildTelephoneRuntimeSettings({
        currentSettings,
        update: body,
        provider,
        voiceBridgeUrl,
        sipTarget,
      });
      const externalAccountId =
        typeof current?.externalAccountId === "string" &&
        current.externalAccountId.trim()
          ? current.externalAccountId
          : telephoneExternalAccountIdFromSettings(settings);
      const connection = await options.store.upsertChannelConnection(tenantId, {
        channel: "telephone",
        provider,
        externalAccountId,
        status:
          current?.status === "connected" ||
          current?.status === "disabled" ||
          current?.status === "pending"
            ? current.status
            : "pending",
        settings,
      });
      return {
        connection,
        webhookUrl: voiceBridgeUrl,
        sipTarget,
        warnings: buildTelephoneSetupWarnings(settings),
      };
    },
  );

  app.get(
    "/admin/tenants/:tenantId/telephone/voice-edge-status",
    { preHandler: requireTenantAccess(options, "tenant_admin") },
    async (request, reply) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const tenant = await options.store.getTenant(tenantId);
      if (!tenant) {
        return reply.code(404).send({ error: "Tenant not found." });
      }
      return checkTelephoneVoiceEdge(options);
    },
  );

  app.post(
    "/admin/tenants/:tenantId/knowledge/faqs",
    { preHandler: requireTenantAccess(options, "tenant_admin") },
    async (request, reply) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const body = AddFaqSchema.parse(request.body);
      const result = await options.store.addFaq(tenantId, body);
      return reply.code(201).send(result);
    },
  );

  app.get(
    "/admin/tenants/:tenantId/knowledge",
    { preHandler: requireTenantAccess(options, "viewer") },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const pagination = PaginationQuerySchema.parse(request.query);
      return options.store.listKnowledge(tenantId, pagination);
    },
  );

  app.get(
    "/admin/tenants/:tenantId/brain",
    { preHandler: requireTenantAccess(options, "viewer") },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      return options.store.getTenantBrainSummary(tenantId);
    },
  );

  app.get(
    "/admin/tenants/:tenantId/brain/onboarding",
    { preHandler: requireTenantAccess(options, "viewer") },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      return options.store.listBrainOnboardingAnswers(tenantId);
    },
  );

  app.put(
    "/admin/tenants/:tenantId/brain/onboarding",
    { preHandler: requireTenantAccess(options, "tenant_admin") },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const body = UpsertBrainOnboardingSchema.parse(request.body);
      return options.store.upsertBrainOnboardingAnswers(tenantId, body);
    },
  );

  app.get(
    "/admin/tenants/:tenantId/knowledge/suggestions",
    { preHandler: requireTenantAccess(options, "viewer") },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const pagination = PaginationQuerySchema.parse(request.query);
      return options.store.listKnowledgeSuggestions(tenantId, pagination);
    },
  );

  app.get(
    "/admin/tenants/:tenantId/knowledge/ingestion-jobs",
    { preHandler: requireTenantAccess(options, "viewer") },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const pagination = PaginationQuerySchema.parse(request.query);
      return options.store.listDocumentIngestionJobs(tenantId, pagination);
    },
  );

  app.post(
    "/admin/tenants/:tenantId/knowledge/uploads",
    { preHandler: requireTenantAccess(options, "tenant_admin") },
    async (request, reply) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const body = KnowledgeDocumentUploadSchema.parse(request.body);
      const decoded = decodeKnowledgeUpload(body);
      let extracted: ExtractedKnowledgeUploadText;
      try {
        extracted = extractUploadedKnowledgeText(body, decoded);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Document extraction failed.";
        const job = await options.store.recordDocumentIngestionFailure(
          tenantId,
          {
            fileName: body.fileName,
            contentType: body.contentType,
            checksum: decoded.checksum,
            error: message,
            metadata: {
              ...(body.metadata ?? {}),
              originalBytes: decoded.bytes,
            },
          },
        );
        return reply.code(400).send({
          error: message,
          code: "document_parse_failed",
          job,
        });
      }
      const uploadInput: Parameters<
        PlatformStore["ingestKnowledgeDocument"]
      >[1] = {
        fileName: body.fileName,
        contentType: body.contentType,
        extractedText: extracted.text,
        checksum: extracted.checksum,
        metadata: {
          ...(body.metadata ?? {}),
          parser: extracted.parser,
          originalBytes: extracted.bytes,
        },
      };
      if (body.suggestedTags) {
        uploadInput.suggestedTags = body.suggestedTags;
      }
      if (body.maxSuggestions) {
        uploadInput.maxSuggestions = body.maxSuggestions;
      }
      const result = await options.store.ingestKnowledgeDocument(
        tenantId,
        uploadInput,
      );
      return reply.code(201).send(result);
    },
  );

  app.post(
    "/admin/tenants/:tenantId/knowledge/suggestions",
    { preHandler: requireTenantAccess(options, "tenant_admin") },
    async (request, reply) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const body = CreateKnowledgeSuggestionSchema.parse(request.body);
      const result = await options.store.createKnowledgeSuggestion(
        tenantId,
        body,
      );
      return reply.code(201).send(result);
    },
  );

  app.post(
    "/admin/tenants/:tenantId/knowledge/suggestions/scan",
    { preHandler: requireTenantAccess(options, "tenant_admin") },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const body = ScanKnowledgeSuggestionsSchema.parse(request.body ?? {});
      return options.store.scanKnowledgeSuggestions(tenantId, body);
    },
  );

  app.post(
    "/admin/tenants/:tenantId/knowledge/suggestions/:suggestionId/approve",
    { preHandler: requireTenantAccess(options, "tenant_admin") },
    async (request) => {
      const { tenantId, suggestionId } = ParamsKnowledgeSuggestionSchema.parse(
        request.params,
      );
      const body = ReviewKnowledgeSuggestionSchema.parse(request.body ?? {});
      const auth = getRequestAuth(request);
      const reviewedByUserId = auth.kind === "user" ? auth.user.id : null;
      return options.store.approveKnowledgeSuggestion(tenantId, suggestionId, {
        ...body,
        reviewedByUserId,
      });
    },
  );

  app.post(
    "/admin/tenants/:tenantId/knowledge/suggestions/:suggestionId/reject",
    { preHandler: requireTenantAccess(options, "tenant_admin") },
    async (request) => {
      const { tenantId, suggestionId } = ParamsKnowledgeSuggestionSchema.parse(
        request.params,
      );
      const body = ReviewKnowledgeSuggestionSchema.parse(request.body ?? {});
      const auth = getRequestAuth(request);
      const reviewedByUserId = auth.kind === "user" ? auth.user.id : null;
      return options.store.rejectKnowledgeSuggestion(tenantId, suggestionId, {
        ...body,
        reviewedByUserId,
      });
    },
  );

  app.post(
    "/admin/tenants/:tenantId/knowledge/import-website",
    { preHandler: requireTenantAccess(options, "tenant_admin") },
    async (request, reply) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const body = WebsiteImportSchema.parse(request.body);
      const tenant = await options.store.getTenant(tenantId);
      if (!tenant) {
        return reply.code(404).send({ error: "Tenant not found." });
      }

      const documents = await crawlTextDocuments(body.url, body.maxPages);
      const primary = documents[0];
      return {
        sourceUrl: primary?.finalUrl ?? body.url,
        statusCode: primary?.status ?? 0,
        pagesScanned: documents.map((document) => ({
          url: document.finalUrl,
          statusCode: document.status,
          title:
            extractTitle(document.html) || new URL(document.finalUrl).hostname,
        })),
        ...buildWebsiteImport(
          documents.map((document) => document.html).join("\n"),
          primary?.finalUrl ?? body.url,
          body.maxFaqs,
        ),
      };
    },
  );

  app.put(
    "/admin/tenants/:tenantId/knowledge/:knowledgeId",
    { preHandler: requireTenantAccess(options, "tenant_admin") },
    async (request) => {
      const { tenantId, knowledgeId } = ParamsKnowledgeSchema.parse(
        request.params,
      );
      const body = AddFaqSchema.parse(request.body);
      return options.store.updateFaq(tenantId, knowledgeId, body);
    },
  );

  app.delete(
    "/admin/tenants/:tenantId/knowledge/:knowledgeId",
    { preHandler: requireTenantAccess(options, "tenant_admin") },
    async (request, reply) => {
      const { tenantId, knowledgeId } = ParamsKnowledgeSchema.parse(
        request.params,
      );
      await options.store.deleteKnowledge(tenantId, knowledgeId);
      return reply.code(204).send();
    },
  );

  app.get(
    "/admin/tenants/:tenantId/analytics",
    { preHandler: requireTenantAccess(options, "viewer") },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      return options.store.getTenantAnalytics(tenantId);
    },
  );

  app.get(
    "/admin/tenants/:tenantId/dashboard",
    {
      preHandler: requireTenantAccess(options, "viewer", {
        allowPlatformBypass: false,
      }),
    },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const startedAtMs = Date.now();
      try {
        const result = await buildDashboardBootstrap(
          options,
          request,
          tenantId,
        );
        metrics.observeOperation(
          "admin_dashboard_bootstrap",
          "success",
          startedAtMs,
        );
        return result;
      } catch (error) {
        metrics.observeOperation(
          "admin_dashboard_bootstrap",
          "error",
          startedAtMs,
        );
        throw error;
      }
    },
  );

  app.get(
    "/admin/tenants/:tenantId/production-readiness",
    { preHandler: requireTenantAccess(options, "viewer") },
    async (request, reply) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const startedAtMs = Date.now();
      try {
        const readiness = await buildProductionReadinessForTenant(
          options,
          request,
          tenantId,
        );
        metrics.observeOperation(
          "production_readiness",
          "success",
          startedAtMs,
        );
        if (!readiness) {
          return reply.code(404).send({ error: "Tenant not found." });
        }
        return readiness;
      } catch (error) {
        metrics.observeOperation("production_readiness", "error", startedAtMs);
        throw error;
      }
    },
  );

  app.get(
    "/admin/tenants/:tenantId/workspace-summary",
    {
      preHandler: requireTenantAccess(options, "viewer", {
        allowPlatformBypass: false,
      }),
    },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      return buildWorkspaceSummary(options.store, tenantId);
    },
  );

  app.get(
    "/admin/tenants/:tenantId/conversations",
    {
      preHandler: requireTenantAccess(options, "viewer", {
        allowPlatformBypass: false,
      }),
    },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const pagination = PaginationQuerySchema.parse(request.query);
      return options.store.listConversations(tenantId, pagination);
    },
  );

  app.get(
    "/admin/tenants/:tenantId/inbox",
    {
      preHandler: requireTenantAccess(options, "viewer", {
        allowPlatformBypass: false,
      }),
    },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const pagination = PaginationQuerySchema.parse(request.query);
      return options.store.listUnifiedInbox(tenantId, pagination);
    },
  );

  app.get(
    "/admin/tenants/:tenantId/contacts",
    {
      preHandler: requireTenantAccess(options, "viewer", {
        allowPlatformBypass: false,
      }),
    },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const pagination = PaginationQuerySchema.parse(request.query);
      return options.store.listContacts(tenantId, pagination);
    },
  );

  // GDPR Art. 17 erasure of a single data subject. Destructive and
  // personal-data scoped: requires a real tenant_admin membership (no platform
  // bypass — the admin token cannot erase a tenant's contact), and the erasure
  // is written to the audit log with the acting principal.
  app.delete(
    "/admin/tenants/:tenantId/contacts/:contactId",
    {
      preHandler: requireTenantAccess(options, "tenant_admin", {
        allowPlatformBypass: false,
      }),
    },
    async (request, reply) => {
      const { tenantId, contactId } = ParamsContactSchema.parse(request.params);
      const result = await options.store.deleteContact(tenantId, contactId);
      if (!result.deletedContact) {
        return reply.code(404).send({ error: "Contact not found." });
      }
      await recordPiiAccess(
        options,
        request,
        tenantId,
        "contact.erased",
        "contact",
        contactId,
        {
          deletedConversations: result.deletedConversations,
          deletedCalls: result.deletedCalls,
        },
      );
      return reply.code(200).send({ erased: true, ...result });
    },
  );

  app.get(
    "/admin/tenants/:tenantId/conversations/:conversationId/messages",
    {
      preHandler: requireTenantAccess(options, "viewer", {
        allowPlatformBypass: false,
      }),
    },
    async (request) => {
      const { tenantId, conversationId } = ParamsConversationSchema.parse(
        request.params,
      );
      const messages = await options.store.listConversationMessages(
        tenantId,
        conversationId,
      );
      await recordPiiAccess(
        options,
        request,
        tenantId,
        "conversation.messages.viewed",
        "conversation",
        conversationId,
        { messageCount: messages.length },
      );
      return messages;
    },
  );

  app.get(
    "/admin/tenants/:tenantId/handoffs",
    {
      preHandler: requireTenantAccess(options, "viewer", {
        allowPlatformBypass: false,
      }),
    },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const pagination = PaginationQuerySchema.parse(request.query);
      return options.store.listHandoffs(tenantId, pagination);
    },
  );

  app.get(
    "/admin/tenants/:tenantId/unanswered",
    {
      preHandler: requireTenantAccess(options, "viewer", {
        allowPlatformBypass: false,
      }),
    },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const handoffs = await options.store.listHandoffs(tenantId);
      return buildUnansweredQueue(handoffs);
    },
  );

  app.get(
    "/admin/tenants/:tenantId/workflows/suggestions",
    {
      preHandler: requireTenantAccess(options, "viewer", {
        allowPlatformBypass: false,
      }),
    },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const [analytics, handoffs, contacts, templates, compliance] =
        await Promise.all([
          options.store.getTenantAnalytics(tenantId),
          options.store.listHandoffs(tenantId),
          options.store.listContacts(tenantId),
          options.store.listWhatsappTemplates(tenantId),
          options.store.getWhatsappCompliance(tenantId),
        ]);
      return buildWorkflowSuggestions({
        analytics,
        handoffs,
        contacts,
        templates,
        compliance,
      });
    },
  );

  app.get(
    "/admin/tenants/:tenantId/whatsapp/templates",
    { preHandler: requireTenantAccess(options, "viewer") },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      return options.store.listWhatsappTemplates(tenantId);
    },
  );

  app.post(
    "/admin/tenants/:tenantId/whatsapp/templates",
    { preHandler: requireTenantAccess(options, "tenant_admin") },
    async (request, reply) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const body = WhatsappTemplateSchema.parse(request.body);
      const template = await options.store.upsertWhatsappTemplate(
        tenantId,
        body,
      );
      return reply.code(201).send(template);
    },
  );

  app.get(
    "/admin/tenants/:tenantId/whatsapp/compliance",
    { preHandler: requireTenantAccess(options, "viewer") },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      return options.store.getWhatsappCompliance(tenantId);
    },
  );

  app.post(
    "/admin/tenants/:tenantId/weekly-report",
    { preHandler: requireTenantAccess(options, "tenant_admin") },
    async (request, reply) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const tenant = await options.store.getTenant(tenantId);
      if (!tenant) {
        return reply.code(404).send({ error: "Tenant not found." });
      }
      const theme = tenant.theme ?? {};
      const automation = getAutomationSettings(theme);
      if (!automation.weeklySummaryEmailEnabled) {
        return {
          sent: false,
          reason: "weekly_summary_disabled",
        };
      }
      if (!options.leadNotificationEmailTo) {
        return {
          sent: false,
          reason: "owner_email_not_configured",
        };
      }

      const [analytics, handoffs] = await Promise.all([
        options.store.getTenantAnalytics(tenantId),
        options.store.listHandoffs(tenantId),
      ]);
      const from =
        options.leadNotificationSmtp?.from ??
        options.adminUser?.email ??
        "owner@assad-dar.de";
      const email = buildWeeklyReportEmail(
        tenant,
        analytics,
        handoffs,
        options.leadNotificationEmailTo,
        from,
        automation,
      );
      const result = await sendNotificationEmail(options, email);
      return {
        ...result,
        sentAt: new Date().toISOString(),
      };
    },
  );

  app.patch(
    "/admin/tenants/:tenantId/handoffs/:handoffId",
    {
      preHandler: requireTenantAccess(options, "operator", {
        allowPlatformBypass: false,
      }),
    },
    async (request) => {
      const { tenantId, handoffId } = ParamsHandoffSchema.parse(request.params);
      const body = UpdateHandoffSchema.parse(request.body);
      return options.store.updateHandoff(tenantId, handoffId, body);
    },
  );

  app.post(
    "/admin/tenants/:tenantId/test-assistant",
    {
      preHandler: requireTenantAccess(options, "operator", {
        allowPlatformBypass: false,
      }),
    },
    async (request, reply) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const body = TestAssistantSchema.parse(request.body);
      const tenant = await options.store.getTenant(tenantId);
      if (!tenant) {
        return reply.code(404).send({ error: "Tenant not found." });
      }

      const conversation = await options.store.findOrCreateConversation({
        tenantId,
        channel: "admin_test",
        locale: body.locale ?? tenant.defaultLocale,
      });

      await options.store.addMessage({
        tenantId,
        conversationId: conversation.id,
        channel: "admin_test",
        direction: "inbound",
        role: "user",
        content: body.message,
      });

      const answer = await engine.answer(
        InboundMessageSchema.parse({
          tenantId,
          conversationId: conversation.id,
          channel: "admin_test",
          text: body.message,
          locale: body.locale ?? tenant.defaultLocale,
          metadata: {},
        }),
      );

      await options.store.addMessage({
        tenantId,
        conversationId: conversation.id,
        channel: "admin_test",
        direction: "outbound",
        role: "assistant",
        content: answer.text,
        trace: { answer },
      });

      await options.store.logUsage({
        tenantId,
        channel: "admin_test",
        eventType: answer.status,
        credits: answer.usage.estimatedCredits,
        metadata: { intent: answer.intent, confidence: answer.confidence },
      });

      return {
        conversationId: conversation.publicId,
        answer,
      };
    },
  );

  app.get(
    "/admin/tenants/:tenantId/export",
    {
      preHandler: requireTenantAccess(options, "tenant_owner", {
        allowPlatformBypass: false,
      }),
    },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      await recordPiiAccess(
        options,
        request,
        tenantId,
        "tenant.data.exported",
        "tenant",
        tenantId,
      );
      return options.store.exportTenantData(tenantId);
    },
  );

  app.delete(
    "/admin/tenants/:tenantId",
    { preHandler: requireTenantAccess(options, "tenant_owner") },
    async (request, reply) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      // Record the erasure before the cascade removes the tenant's own
      // audit_logs rows; this entry is written to the deleted tenant's scope
      // only as an intent marker — production should also mirror destructive
      // platform actions to an append-only platform audit sink.
      await recordPiiAccess(
        options,
        request,
        tenantId,
        "tenant.data.deleted",
        "tenant",
        tenantId,
      );
      await options.store.deleteTenantData(tenantId);
      return reply.code(204).send();
    },
  );

  app.post(
    "/admin/tenants/:tenantId/install-check",
    { preHandler: requireTenantAccess(options, "tenant_admin") },
    async (request, reply) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const body = InstallCheckSchema.parse(request.body);
      const tenant = await options.store.getTenant(tenantId);
      if (!tenant) {
        return reply.code(404).send({ error: "Tenant not found." });
      }

      const document = await fetchTextDocument(body.url);
      return {
        checkedUrl: document.finalUrl,
        statusCode: document.status,
        ...inspectWidgetInstall(
          document.html,
          body.assistantId,
          body.widgetUrl,
        ),
      };
    },
  );

  app.get("/widget/config/:assistantId", async (request, reply) => {
    const { assistantId } = ParamsAssistantSchema.parse(request.params);
    const config = await options.store.getWidgetConfig(assistantId);
    if (!config) {
      return reply.code(404).send({ error: "Assistant not found." });
    }

    const payload = JSON.stringify(config);
    const etag = `"${createHash("sha256").update(payload).digest("base64url")}"`;
    const ifNoneMatch = request.headers["if-none-match"];
    const etagMatches = Array.isArray(ifNoneMatch)
      ? ifNoneMatch.includes(etag)
      : ifNoneMatch === etag;

    reply.header(
      "Cache-Control",
      "public, max-age=60, stale-while-revalidate=300",
    );
    reply.header("ETag", etag);

    if (etagMatches) {
      return reply.code(304).send();
    }

    return reply.type("application/json").send(payload);
  });

  app.post(
    "/widget/events",
    {
      config: {
        rateLimit: { max: 60, timeWindow: "1 minute" },
      },
    },
    async (request, reply) => {
      const body = WidgetEventSchema.parse(request.body);
      const tenant = await options.store.getTenantByPublicId(body.assistantId);
      if (!tenant) {
        return reply.code(404).send({ error: "Assistant not found." });
      }

      await options.store.logUsage({
        tenantId: tenant.id,
        channel: "website",
        eventType: body.eventType,
        credits: 0,
        metadata: {
          conversationId: body.conversationId,
          visitorId: body.visitorId,
          pageUrl: body.pageUrl,
          ...(body.metadata ?? {}),
        },
      });

      return reply.code(202).send({ received: true });
    },
  );

  app.post(
    "/widget/chat",
    {
      config: {
        // Stricter than the global limit so one visitor cannot drain a
        // tenant's answer budget.
        rateLimit: { max: 30, timeWindow: "1 minute" },
      },
    },
    async (request, reply) => {
      const body = WidgetChatSchema.parse(request.body);
      const tenant = await options.store.getTenantByPublicId(body.assistantId);
      if (!tenant) {
        return reply.code(404).send({ error: "Assistant not found." });
      }

      const [event] = websiteAdapter.normalizeInbound(
        {
          message: body.message,
          conversationId: body.conversationId,
          visitorId: body.visitorId,
        },
        tenant.id,
      );
      if (!event) {
        return reply.code(400).send({ error: "No message event found." });
      }

      const conversationInput: Parameters<
        PlatformStore["findOrCreateConversation"]
      >[0] = {
        tenantId: tenant.id,
        channel: "website",
        locale: body.locale ?? tenant.defaultLocale,
      };
      if (body.conversationId) {
        conversationInput.publicConversationId = body.conversationId;
      }
      if (body.visitorId) {
        conversationInput.externalUserId = body.visitorId;
      }

      const conversation =
        await options.store.findOrCreateConversation(conversationInput);

      await options.store.addMessage({
        tenantId: tenant.id,
        conversationId: conversation.id,
        channel: "website",
        direction: "inbound",
        role: "user",
        content: event.text,
      });

      const answerStartedAtMs = Date.now();
      let answer: AnswerResult;
      try {
        answer = await engine.answer(
          InboundMessageSchema.parse({
            tenantId: tenant.id,
            conversationId: conversation.id,
            channel: "website",
            externalUserId: body.visitorId,
            text: event.text,
            locale: body.locale ?? tenant.defaultLocale,
            metadata: {},
          }),
        );
        metrics.observeOperation("widget_answer", "success", answerStartedAtMs);
      } catch (error) {
        metrics.observeOperation("widget_answer", "error", answerStartedAtMs);
        throw error;
      }

      await options.store.addMessage({
        tenantId: tenant.id,
        conversationId: conversation.id,
        channel: "website",
        direction: "outbound",
        role: "assistant",
        content: answer.text,
        trace: { answer },
      });

      await options.store.logUsage({
        tenantId: tenant.id,
        channel: "website",
        eventType: answer.status,
        credits: answer.usage.estimatedCredits,
        metadata: {
          intent: answer.intent,
          confidence: answer.confidence,
        },
      });

      return {
        conversationId: conversation.publicId,
        status: answer.status,
        reply: answer.text,
        citations: answer.citations,
        handoffRecommended: answer.handoffRecommended,
      };
    },
  );

  app.post(
    "/widget/leads",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" },
      },
    },
    async (request, reply) => {
      const body = WidgetLeadSchema.parse(request.body);
      const tenant = await options.store.getTenantByPublicId(body.assistantId);
      if (!tenant) {
        return reply.code(404).send({ error: "Assistant not found." });
      }
      const theme = tenant.theme ?? {};
      const automation = getAutomationSettings(theme);
      const autoQualified = shouldAutoQualifyLeadDetails(
        body.fields,
        automation,
      );
      const pipelineStage = autoQualified ? "qualified" : "new";

      const message = formatLeadCaptureMessage(body.fields, body.pageUrl);
      const captureInput: Parameters<PlatformStore["captureWebsiteLead"]>[0] = {
        tenantId: tenant.id,
        channel: "website",
        locale: tenant.defaultLocale,
        contact: contactProfileFromFields(body.fields, {
          pageUrl: body.pageUrl,
          source: "lead_capture",
        }),
        message,
        trace: {
          type: "lead_capture",
          fields: body.fields,
          pageUrl: body.pageUrl,
        },
        reason: "lead_capture",
        handoffMetadata: {
          pipelineStage,
          ...(autoQualified
            ? {
                automationReason: "lead_details",
                pipelineUpdatedAt: new Date().toISOString(),
              }
            : {}),
        },
      };
      if (body.conversationId) {
        captureInput.publicConversationId = body.conversationId;
      }
      if (body.visitorId) {
        captureInput.externalUserId = body.visitorId;
      }
      const idempotencyKey = getIdempotencyKey(request.headers);
      if (idempotencyKey) {
        captureInput.idempotencyKey = idempotencyKey;
      }

      const { conversation, handoff } =
        await options.store.captureWebsiteLead(captureInput);
      const handoffId = getStringProperty(handoff, "id");

      if (automation.ownerLeadEmailEnabled) {
        await notifyLead(options, {
          tenantId: tenant.id,
          tenantName: tenant.name,
          type: "lead_capture",
          conversationId: conversation.publicId,
          message,
          fields: body.fields,
          ...(handoffId ? { handoffId } : {}),
          ...(body.pageUrl ? { pageUrl: body.pageUrl } : {}),
        });
      }

      if (automation.visitorConfirmationEmailEnabled) {
        const bookingUrl = getBookingUrl(theme);
        await notifyVisitorConfirmation(options, {
          tenantName: tenant.name,
          type: "lead_capture",
          fields: body.fields,
          ...(body.pageUrl ? { pageUrl: body.pageUrl } : {}),
          ...(bookingUrl ? { bookingUrl } : {}),
        });
      }

      await options.store.logUsage({
        tenantId: tenant.id,
        channel: "website",
        eventType: "lead_capture",
        credits: 1,
        metadata: {
          fields: Object.keys(body.fields),
          pageUrl: body.pageUrl,
          pipelineStage,
          autoQualified,
        },
      });

      return reply.code(201).send({
        conversationId: conversation.publicId,
        status: "captured",
      });
    },
  );

  app.post(
    "/widget/readiness",
    {
      config: {
        rateLimit: { max: 20, timeWindow: "1 minute" },
      },
    },
    async (request, reply) => {
      const body = WidgetReadinessSchema.parse(request.body);
      const tenant = await options.store.getTenantByPublicId(body.assistantId);
      if (!tenant) {
        return reply.code(404).send({ error: "Assistant not found." });
      }
      const theme = tenant.theme ?? {};
      const automation = getAutomationSettings(theme);

      const score = scoreReadiness(body.answers);
      const message = formatReadinessMessage(body.answers, score, body.pageUrl);
      const autoQualified =
        automation.autoQualifyReadinessEnabled &&
        score >= automation.readinessQualificationScore;
      const pipelineStage = autoQualified ? "qualified" : "new";

      const captureInput: Parameters<PlatformStore["captureWebsiteLead"]>[0] = {
        tenantId: tenant.id,
        channel: "website",
        locale: tenant.defaultLocale,
        contact: contactProfileFromFields(body.answers, {
          pageUrl: body.pageUrl,
          source: "readiness_assessment",
          score,
        }),
        message,
        trace: {
          type: "readiness_assessment",
          answers: body.answers,
          score,
          pageUrl: body.pageUrl,
        },
        reason: "readiness_assessment",
        handoffMetadata: {
          pipelineStage,
          score,
          ...(autoQualified
            ? {
                automationReason: "readiness_score",
                pipelineUpdatedAt: new Date().toISOString(),
              }
            : {}),
        },
      };
      if (body.conversationId) {
        captureInput.publicConversationId = body.conversationId;
      }
      if (body.visitorId) {
        captureInput.externalUserId = body.visitorId;
      }
      const idempotencyKey = getIdempotencyKey(request.headers);
      if (idempotencyKey) {
        captureInput.idempotencyKey = idempotencyKey;
      }

      const { conversation, handoff } =
        await options.store.captureWebsiteLead(captureInput);
      const handoffId = getStringProperty(handoff, "id");

      await options.store.logUsage({
        tenantId: tenant.id,
        channel: "website",
        eventType: "readiness_assessment",
        credits: 1,
        metadata: {
          score,
          fields: Object.keys(body.answers),
          pageUrl: body.pageUrl,
          pipelineStage,
          autoQualified,
        },
      });

      if (automation.ownerLeadEmailEnabled) {
        await notifyLead(options, {
          tenantId: tenant.id,
          tenantName: tenant.name,
          type: "readiness_assessment",
          conversationId: conversation.publicId,
          message,
          fields: body.answers,
          ...(handoffId ? { handoffId } : {}),
          score,
          ...(body.pageUrl ? { pageUrl: body.pageUrl } : {}),
        });
      }

      if (automation.visitorConfirmationEmailEnabled) {
        const bookingUrl = getBookingUrl(theme);
        await notifyVisitorConfirmation(options, {
          tenantName: tenant.name,
          type: "readiness_assessment",
          fields: body.answers,
          score,
          ...(body.pageUrl ? { pageUrl: body.pageUrl } : {}),
          ...(bookingUrl ? { bookingUrl } : {}),
        });
      }

      return reply.code(201).send({
        conversationId: conversation.publicId,
        status: "captured",
        score,
        recommendation: readinessRecommendation(score),
        qualified: autoQualified,
        bookingUrl: getBookingUrl(theme),
      });
    },
  );

  app.get("/webhooks/meta/:channel", async (request, reply) => {
    const { channel } = ParamsMetaChannelSchema.parse(request.params);
    const query = z
      .object({
        "hub.mode": z.string().optional(),
        "hub.verify_token": z.string().optional(),
        "hub.challenge": z.string().optional(),
      })
      .parse(request.query);

    const verificationRequest = {};
    if (query["hub.mode"]) {
      Object.assign(verificationRequest, { mode: query["hub.mode"] });
    }
    if (query["hub.verify_token"]) {
      Object.assign(verificationRequest, {
        verifyToken: query["hub.verify_token"],
      });
    }
    if (query["hub.challenge"]) {
      Object.assign(verificationRequest, { challenge: query["hub.challenge"] });
    }

    const challenge =
      metaAdapters[channel].verifyWebhook?.(verificationRequest);

    if (!challenge) {
      return reply.code(403).send({ error: "Webhook verification failed." });
    }

    return reply.type("text/plain").send(challenge);
  });

  app.post(
    "/webhooks/meta/:channel",
    {
      // Capture the RAW request body for THIS route only so we can verify
      // Meta's `X-Hub-Signature-256` (HMAC over the exact bytes). The buffered
      // bytes are re-streamed so the default JSON body parser still runs; global
      // JSON parsing for all other routes is untouched.
      preParsing: async (request, _reply, payload) => {
        const chunks: Buffer[] = [];
        for await (const chunk of payload) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const raw = Buffer.concat(chunks);
        (request as RequestWithRawBody).rawBody = raw;
        return Readable.from(raw);
      },
    },
    async (request, reply) => {
      const { channel } = ParamsMetaChannelSchema.parse(request.params);
      const query = MetaWebhookQuerySchema.parse(request.query);
      const adapter = metaAdapters[channel];

      // Production must never accept unsigned Meta webhooks. Local/dev setups
      // may omit the app secret while provider credentials are being prepared.
      if (options.metaAppSecret) {
        const rawBody =
          (request as RequestWithRawBody).rawBody ?? Buffer.alloc(0);
        const signature = request.headers["x-hub-signature-256"];
        const signatureValue = Array.isArray(signature)
          ? signature[0]
          : signature;
        if (
          !verifyMetaSignature(rawBody, signatureValue, options.metaAppSecret)
        ) {
          request.log.warn(
            { channel },
            "Rejected Meta webhook with missing/invalid X-Hub-Signature-256",
          );
          return reply.code(401).send({ error: "Invalid webhook signature." });
        }
      } else if (process.env.NODE_ENV === "production") {
        request.log.error(
          { channel },
          "Rejected Meta webhook because META_APP_SECRET is not configured",
        );
        return reply.code(503).send({
          error: "Meta webhook signature verification is not configured.",
        });
      } else {
        request.log.warn(
          "META_APP_SECRET is not configured; skipping Meta webhook signature verification",
        );
      }

      const providerAccountId = extractMetaProviderAccountId(
        channel,
        request.body,
      );
      const tenant = query.assistantId
        ? await options.store.getTenantByPublicId(query.assistantId)
        : providerAccountId
          ? await options.store.getTenantByChannelConnection(
              channel,
              adapter.provider,
              providerAccountId,
            )
          : null;

      if (!tenant) {
        return reply.code(202).send({
          received: true,
          routed: false,
          channel,
          provider: adapter.provider,
          reason: "tenant_not_mapped",
          ...(providerAccountId ? { providerAccountId } : {}),
        });
      }

      const events = adapter.normalizeInbound(request.body, tenant.id);
      const results = [];
      for (const event of events) {
        const webhookEvent = await options.store.recordChannelWebhookEvent({
          tenantId: tenant.id,
          channel: event.channel,
          providerEventId: event.providerEventId ?? null,
          eventType: "message.inbound",
          payload: {
            provider: event.provider,
            providerAccountId: event.providerAccountId,
            externalConversationId: event.externalConversationId,
            externalUserId: event.externalUserId,
            raw: event.raw,
          },
        });

        // Idempotency must distinguish a genuine replay from a provider retry.
        // A duplicate we already processed successfully is a true replay:
        // acknowledge it without re-answering. But a duplicate still in
        // "received"/"failed" state means the prior delivery never completed
        // (we returned 5xx and the provider is retrying), so it MUST be
        // reprocessed rather than silently dropped — otherwise a transient
        // downstream error permanently loses the customer's message.
        if (
          webhookEvent.duplicate &&
          webhookEvent.event.status === "processed"
        ) {
          results.push({
            status: "duplicate",
            webhookEventId: webhookEvent.event.id,
            providerEventId: event.providerEventId,
          });
          continue;
        }

        try {
          const result = await processChannelInboundEvent({
            options,
            engine,
            adapter,
            tenant,
            event,
          });
          await options.store.markChannelWebhookEventProcessed(
            webhookEvent.event.id,
          );
          results.push({
            ...result,
            // Surface that this was a retried delivery so callers/telemetry can
            // tell a first-time processing from a recovered one.
            ...(webhookEvent.duplicate ? { retried: true } : {}),
            webhookEventId: webhookEvent.event.id,
            providerEventId: event.providerEventId,
          });
        } catch (error) {
          await options.store.markChannelWebhookEventFailed(
            webhookEvent.event.id,
            error instanceof Error ? error.message : String(error),
          );
          throw error;
        }
      }

      return {
        received: true,
        channel,
        provider: adapter.provider,
        routed: results.length,
        results,
      };
    },
  );

  app.setErrorHandler(async (error, _request, reply) => {
    if (error instanceof z.ZodError) {
      return reply.code(400).send({
        error: "Validation failed.",
        issues: error.issues,
      });
    }

    if (error instanceof AppError) {
      return reply.code(error.statusCode).send(error.toResponse());
    }

    // Unexpected 500: funnel through the error-capture seam so it is logged
    // structurally, counted in `errors_total`, and ready to forward to a real
    // reporter (e.g. Sentry) later. See ./observability.
    captureException(_request.log, metrics, error, {
      route: _request.routeOptions?.url,
      method: _request.method,
    });
    return reply.code(500).send({
      error: "Internal server error.",
    });
  });

  return app;
}

type LegacyAdminRole = "owner" | "admin" | "operator" | "viewer";

type RequestAuth =
  | {
      kind: "admin";
      user: {
        id: "admin-token";
        email: string;
        name: string;
        role: LegacyAdminRole;
      };
    }
  | {
      kind: "user";
      sessionId: string;
      expiresAt: Date;
      user: {
        id: string;
        email: string;
        name: string;
        status: string;
      };
      memberships: StoreTenantMembership[];
    };

const requestAuthContext = new WeakMap<FastifyRequest, RequestAuth>();
const sessionCookieName = "assaddar_session";

function requireAuth(options: BuildServerOptions) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = await authenticateRequest(request, options);
    if (!auth) {
      return reply.code(401).send({ error: "Unauthorized." });
    }
    if (!authorizeCredentialedStateChange(request, reply, options, auth)) {
      return;
    }
    requestAuthContext.set(request, auth);
  };
}

function requirePlatformOwner(options: BuildServerOptions) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = await authenticateRequest(request, options);
    if (!auth || !isPlatformOwner(auth)) {
      return reply.code(403).send({ error: "Forbidden." });
    }
    if (!authorizeCredentialedStateChange(request, reply, options, auth)) {
      return;
    }
    requestAuthContext.set(request, auth);
  };
}

type TenantAccessOptions = {
  /**
   * When `false`, platform-wide principals (the ADMIN_API_TOKEN and any
   * `platform_owner`) do NOT receive an automatic bypass — they must hold a
   * real membership in the target tenant to pass, exactly like a normal user.
   *
   * Use this on every route that returns tenant end-user PERSONAL DATA (message
   * content, contacts, transcripts, per-tenant exports, the workspace bootstrap)
   * so the platform admin cannot read a tenant's end-user data without being an
   * actual member of that tenant. The admin token holds no membership, so it is
   * denied here by design; it may only reach non-personal ops/health/aggregate
   * routes. See docs/security-gdpr.md — "Admin privacy boundary".
   */
  allowPlatformBypass?: boolean;
};

function requireTenantAccess(
  options: BuildServerOptions,
  minimumRole: RoleName,
  accessOptions: TenantAccessOptions = {},
) {
  const allowPlatformBypass = accessOptions.allowPlatformBypass ?? true;
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = await authenticateRequest(request, options);
    if (!auth) {
      return reply.code(401).send({ error: "Unauthorized." });
    }
    if (!authorizeCredentialedStateChange(request, reply, options, auth)) {
      return;
    }
    if (
      allowPlatformBypass &&
      (auth.kind === "admin" || isPlatformOwner(auth))
    ) {
      requestAuthContext.set(request, auth);
      return;
    }

    // Personal-data routes require a real tenant membership even for a
    // platform_owner or the admin token. The admin token has no membership, so
    // it cannot reach these routes at all — that is the intended privacy
    // boundary (it may only operate non-personal routes).
    const { tenantId } = ParamsTenantSchema.parse(request.params);
    if (auth.kind !== "user") {
      // The admin token / platform_owner has no tenant membership and therefore
      // cannot reach personal-data routes — this is the R4 privacy boundary.
      return reply.code(403).send({ error: "Forbidden." });
    }
    const membership =
      auth.memberships.find((item) => item.tenantId === tenantId) ??
      (await options.store.getTenantMembership(auth.user.id, tenantId));
    if (!membership || !roleAtLeast(membership.role, minimumRole)) {
      return reply.code(403).send({ error: "Forbidden." });
    }

    requestAuthContext.set(request, {
      ...auth,
      memberships: upsertAuthMembership(auth.memberships, membership),
    });
  };
}

async function authenticateRequest(
  request: FastifyRequest,
  options: BuildServerOptions,
): Promise<RequestAuth | null> {
  const adminToken = request.headers["x-admin-token"];
  if (
    typeof adminToken === "string" &&
    safeCompareSecret(adminToken, options.adminToken)
  ) {
    return {
      kind: "admin",
      user: {
        id: "admin-token",
        email: options.adminUser?.email ?? "owner@assad-dar.de",
        name: options.adminUser?.name ?? "Assad Dar",
        role: options.adminUser?.role ?? "owner",
      },
    };
  }

  const bearerToken = getBearerToken(request);
  if (bearerToken && options.supabaseAuth) {
    const supabaseUser =
      await options.supabaseAuth.verifyAccessToken(bearerToken);
    if (!supabaseUser) {
      return null;
    }
    const session = await options.store.getAuthSessionBySupabaseUser({
      authUserId: supabaseUser.authUserId,
      email: supabaseUser.email,
      expiresAt: supabaseUser.expiresAt,
      ...(supabaseUser.name !== undefined ? { name: supabaseUser.name } : {}),
    });
    if (!session) {
      return null;
    }
    return {
      kind: "user",
      sessionId: session.sessionId,
      expiresAt: session.expiresAt,
      user: session.user,
      memberships: session.memberships,
    };
  }

  const sessionToken = getSessionToken(request);
  if (!sessionToken) {
    return null;
  }
  const session = await options.store.getAuthSession(hashSecret(sessionToken));
  if (!session) {
    return null;
  }
  return {
    kind: "user",
    sessionId: session.sessionId,
    expiresAt: session.expiresAt,
    user: session.user,
    memberships: session.memberships,
  };
}

const safeHttpMethods = new Set(["GET", "HEAD", "OPTIONS"]);

function authorizeCredentialedStateChange(
  request: FastifyRequest,
  reply: FastifyReply,
  options: BuildServerOptions,
  auth: RequestAuth,
) {
  if (auth.kind !== "user" || safeHttpMethods.has(request.method)) {
    return true;
  }
  if (isTrustedStateChangeOrigin(request, options)) {
    return true;
  }
  reply.code(403).send({ error: "Untrusted request origin." });
  return false;
}

function isTrustedStateChangeOrigin(
  request: FastifyRequest,
  options: BuildServerOptions,
) {
  const origin = firstHeader(request.headers.origin);
  if (!origin) {
    return process.env.NODE_ENV !== "production";
  }
  const allowedOrigins = options.allowedOrigins ?? [];
  if (
    allowedOrigins.includes(origin) ||
    (allowedOrigins.includes("*") && process.env.NODE_ENV !== "production")
  ) {
    return true;
  }
  const sameHostOrigin = requestOriginFromHost(request);
  return Boolean(sameHostOrigin && sameHostOrigin === origin);
}

function requestOriginFromHost(request: FastifyRequest) {
  const host = firstHeader(request.headers.host);
  if (!host) {
    return null;
  }
  const proto = firstHeader(request.headers["x-forwarded-proto"]) ?? "http";
  return `${proto.split(",")[0]?.trim() ?? "http"}://${host}`;
}

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function safeCompareSecret(provided: string, expected: string) {
  if (!expected) {
    return false;
  }
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

/**
 * Resolve the authenticated principal for an audit record. Distinguishes the
 * platform admin token and a platform_owner from an ordinary tenant user so
 * that PII access via a platform-wide identity is clearly attributable.
 */
function auditActorFromRequest(request: FastifyRequest): {
  actorType: string;
  actorId: string | null;
} {
  const auth = requestAuthContext.get(request);
  if (!auth) {
    return { actorType: "system", actorId: null };
  }
  if (auth.kind === "admin") {
    return { actorType: "platform_admin", actorId: auth.user.id };
  }
  return {
    actorType: isPlatformOwner(auth) ? "platform_owner" : "user",
    actorId: auth.user.id,
  };
}

/**
 * Write an accountability audit entry for access to (or export/erasure of)
 * tenant personal data. Logging failures must never block a legitimate read,
 * so this fails open with a warning rather than throwing.
 */
async function recordPiiAccess(
  options: BuildServerOptions,
  request: FastifyRequest,
  tenantId: string,
  action: string,
  targetType: string,
  targetId: string,
  metadata: Record<string, unknown> = {},
) {
  const actor = auditActorFromRequest(request);
  try {
    await options.store.recordAuditEvent(tenantId, {
      action,
      targetType,
      targetId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      metadata,
    });
  } catch (error) {
    request.log.warn(
      { err: error, tenantId, action },
      "Failed to write PII access audit log",
    );
  }
}

function getRequestAuth(request: FastifyRequest) {
  const auth = requestAuthContext.get(request);
  if (!auth) {
    throw new Error("Request auth context is missing.");
  }
  return auth;
}

function buildSessionPayload(request: FastifyRequest) {
  const auth = getRequestAuth(request);
  if (auth.kind === "admin") {
    return {
      authenticated: true,
      authType: "admin_token",
      user: {
        email: auth.user.email,
        name: auth.user.name,
        role: auth.user.role,
      },
      memberships: [],
      permissions: getPermissions(auth.user.role),
    };
  }

  return buildUserSessionPayload({
    sessionId: auth.sessionId,
    expiresAt: auth.expiresAt,
    user: auth.user,
    memberships: auth.memberships,
  });
}

function buildUserSessionPayload(session: StoreAuthSession) {
  const highestRole = highestUserRole(session.memberships);
  return {
    authenticated: true,
    authType: "user_session",
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: highestRole,
    },
    memberships: session.memberships,
    expiresAt: session.expiresAt.toISOString(),
    permissions: getPermissions(highestRole),
  };
}

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const hash = (await scryptAsync(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${hash.toString("base64url")}`;
}

async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, salt, expectedHash] = storedHash.split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHash) {
    return false;
  }
  const candidate = (await scryptAsync(password, salt, 64)) as Buffer;
  const expected = Buffer.from(expectedHash, "base64url");
  return (
    candidate.length === expected.length && timingSafeEqual(candidate, expected)
  );
}

function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function sessionDurationMs() {
  return 1000 * 60 * 60 * 24 * 30;
}

function inviteDurationMs() {
  return 1000 * 60 * 60 * 24 * 7;
}

function getSessionToken(request: FastifyRequest) {
  const cookies = parseCookieHeader(request.headers.cookie);
  return cookies[sessionCookieName];
}

function getBearerToken(request: FastifyRequest) {
  const authorization = firstHeader(request.headers.authorization);
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function parseCookieHeader(header: string | undefined) {
  const cookies: Record<string, string> = {};
  for (const item of header?.split(";") ?? []) {
    const [rawKey, ...rawValue] = item.trim().split("=");
    if (!rawKey || !rawValue.length) {
      continue;
    }
    cookies[rawKey] = decodeURIComponent(rawValue.join("="));
  }
  return cookies;
}

function setSessionCookie(reply: FastifyReply, token: string, expiresAt: Date) {
  reply.header(
    "set-cookie",
    buildCookieHeader(sessionCookieName, token, {
      expiresAt,
      maxAgeSeconds: Math.floor((expiresAt.getTime() - Date.now()) / 1000),
    }),
  );
}

function clearSessionCookie(reply: FastifyReply) {
  reply.header(
    "set-cookie",
    buildCookieHeader(sessionCookieName, "", {
      expiresAt: new Date(0),
      maxAgeSeconds: 0,
    }),
  );
}

function buildCookieHeader(
  name: string,
  value: string,
  options: { expiresAt: Date; maxAgeSeconds: number },
) {
  const secure = process.env.NODE_ENV === "production";
  return [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    `SameSite=${secure ? "None" : "Lax"}`,
    `Max-Age=${Math.max(0, options.maxAgeSeconds)}`,
    `Expires=${options.expiresAt.toUTCString()}`,
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

function buildInviteAcceptUrl(options: BuildServerOptions, token: string) {
  const adminBase = options.adminPublicUrl ?? defaultAdminPublicUrl;
  return `${adminBase}/?invite=${encodeURIComponent(token)}`;
}

function isPlatformOwner(auth: RequestAuth) {
  if (auth.kind === "admin") {
    return true;
  }
  return auth.memberships.some((item) => item.role === "platform_owner");
}

function upsertAuthMembership(
  memberships: StoreTenantMembership[],
  membership: StoreTenantMembership,
) {
  return [
    membership,
    ...memberships.filter((item) => item.tenantId !== membership.tenantId),
  ];
}

function roleAtLeast(role: RoleName, minimumRole: RoleName) {
  return roleRank(role) >= roleRank(minimumRole);
}

function canGrantTenantRole(
  auth: RequestAuth,
  tenantId: string,
  targetRole: TenantRoleName,
) {
  if (auth.kind === "admin" || isPlatformOwner(auth)) {
    return true;
  }
  const membership = auth.memberships.find(
    (item) => item.tenantId === tenantId,
  );
  return membership ? roleAtLeast(membership.role, targetRole) : false;
}

function canAccessTenantRole(
  auth: RequestAuth,
  tenantId: string,
  minimumRole: RoleName,
) {
  if (auth.kind === "admin" || isPlatformOwner(auth)) {
    return true;
  }
  const membership = auth.memberships.find(
    (item) => item.tenantId === tenantId,
  );
  return membership ? roleAtLeast(membership.role, minimumRole) : false;
}

function roleRank(role: RoleName) {
  const ranks: Record<RoleName, number> = {
    viewer: 10,
    operator: 20,
    tenant_admin: 30,
    tenant_owner: 40,
    platform_owner: 50,
  };
  return ranks[role];
}

function highestUserRole(memberships: StoreTenantMembership[]) {
  return memberships.reduce<RoleName>(
    (best, membership) =>
      roleAtLeast(membership.role, best) ? membership.role : best,
    "viewer",
  );
}

function requireBilling(
  options: BuildServerOptions,
  reply: FastifyReply,
): ResolvedBilling | null {
  if (options.billing?.selfServiceEnabled === false) {
    reply.code(503).send({ error: "Self-service onboarding is disabled." });
    return null;
  }
  if (!options.billingProvider || !options.billing?.numberPriceId) {
    reply.code(503).send({ error: "Stripe billing is not configured." });
    return null;
  }
  return {
    provider: options.billingProvider,
    numberPriceId: options.billing.numberPriceId,
    acceptedCallPriceId: options.billing.acceptedCallPriceId,
    acceptedCallMeterEventName: options.billing.acceptedCallMeterEventName,
    customerPortalReturnUrl: options.billing.customerPortalReturnUrl,
  };
}

async function ensureStripeCustomerForTenant(input: {
  options: BuildServerOptions;
  tenantId: string;
  auth: Extract<RequestAuth, { kind: "user" }>;
}) {
  const existing = await input.options.store.getBillingAccount(input.tenantId);
  if (existing?.stripeCustomerId) {
    return {
      ...existing,
      stripeCustomerId: existing.stripeCustomerId,
    };
  }
  if (!input.options.billingProvider) {
    throw new Error("Stripe billing is not configured.");
  }
  const customer = await input.options.billingProvider.createCustomer({
    email: input.auth.user.email,
    name: input.auth.user.name,
    metadata: {
      tenant_id: input.tenantId,
      user_id: input.auth.user.id,
    },
  });
  const account = await input.options.store.getOrCreateBillingAccount(
    input.tenantId,
    {
      stripeCustomerId: customer.id,
      status: "incomplete",
      metadata: {
        createdByUserId: input.auth.user.id,
      },
    },
  );
  if (!account.stripeCustomerId) {
    throw new Error("Failed to save Stripe customer.");
  }
  return {
    ...account,
    stripeCustomerId: account.stripeCustomerId,
  };
}

async function processStripeWebhookEvent(
  options: BuildServerOptions,
  billing: ResolvedBilling,
  event: StripeWebhookEvent,
) {
  const object = event.data.object;
  const metadata = stripeObjectMetadata(event);
  if (event.type === "checkout.session.completed") {
    const tenantId = metadata.tenant_id;
    const reservationId = metadata.reservation_id;
    const stripeCustomerId = stringValue(object.customer);
    if (!tenantId || !reservationId || !stripeCustomerId) {
      throw new Error(
        "Stripe checkout session is missing activation metadata.",
      );
    }
    await options.store.activateReservedTelephoneNumber({
      tenantId,
      reservationId,
      stripeCustomerId,
      stripeSubscriptionId: stringValue(object.subscription),
      stripePriceId: billing.numberPriceId,
      subscriptionStatus:
        stringValue(object.subscription_status) ??
        (stringValue(object.payment_status) === "paid"
          ? "active"
          : "incomplete"),
      metadata: {
        stripeCheckoutSessionId: stringValue(object.id) ?? event.id,
      },
    });
    return;
  }

  if (
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const tenantId = metadata.tenant_id;
    const stripeCustomerId = stringValue(object.customer);
    if (!tenantId || !stripeCustomerId) {
      return;
    }
    const subscriptionStatus =
      event.type === "customer.subscription.deleted"
        ? "canceled"
        : (stringValue(object.status) ?? "incomplete");
    const account = await options.store.getOrCreateBillingAccount(tenantId, {
      stripeCustomerId,
      status: billingAccountStatusFromStripe(subscriptionStatus),
      metadata: {
        lastStripeEventId: event.id,
      },
    });
    await options.store.upsertBillingSubscription(tenantId, {
      billingAccountId: account.id,
      stripeSubscriptionId: stringValue(object.id),
      stripePriceId: billing.numberPriceId,
      status: subscriptionStatus,
      currentPeriodStart: stripeUnixDate(object.current_period_start),
      currentPeriodEnd: stripeUnixDate(object.current_period_end),
      metadata: {
        lastStripeEventId: event.id,
      },
    });
  }
}

async function reportBillableUsageToStripe(
  options: BuildServerOptions,
  tenantId: string,
  event: {
    id: string;
    providerCallId: string;
    quantity: number;
    status: string;
  },
) {
  if (event.status === "reported") {
    return;
  }
  const eventName = options.billing?.acceptedCallMeterEventName;
  if (!options.billingProvider || !eventName) {
    return;
  }
  const account = await options.store.getBillingAccount(tenantId);
  if (!account?.stripeCustomerId) {
    return;
  }

  try {
    const meterEvent = await options.billingProvider.reportMeterEvent({
      eventName,
      customerId: account.stripeCustomerId,
      value: event.quantity,
      identifier: `call_${event.id}`,
      metadata: {
        tenant_id: tenantId,
        provider_call_id: event.providerCallId,
      },
    });
    await options.store.markBillableUsageReported(
      tenantId,
      event.id,
      meterEvent.id,
    );
  } catch (error) {
    await options.store.markBillableUsageFailed(
      tenantId,
      event.id,
      error instanceof Error ? error.message : "Stripe meter report failed.",
    );
    throw error;
  }
}

function stripeObjectMetadata(event: StripeWebhookEvent) {
  const metadata = event.data.object.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {} as Record<string, string>;
  }
  return Object.fromEntries(
    Object.entries(metadata).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function billingAccountStatusFromStripe(status: string) {
  if (status === "active" || status === "trialing") {
    return "active";
  }
  if (status === "past_due" || status === "unpaid" || status === "incomplete") {
    return "past_due";
  }
  if (status === "canceled" || status === "incomplete_expired") {
    return "canceled";
  }
  return "incomplete";
}

function stripeUnixDate(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? new Date(value * 1000)
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function buildAdminReturnUrl(options: BuildServerOptions, path: string) {
  return new URL(
    path,
    options.adminPublicUrl ?? defaultAdminPublicUrl,
  ).toString();
}

type TwilioCredentials = {
  accountSid: string;
  authToken: string;
};

type TwilioAvailableNumber = {
  phone_number?: string;
  friendly_name?: string;
  locality?: string | null;
  region?: string | null;
  iso_country?: string;
  capabilities?: {
    voice?: boolean;
    SMS?: boolean;
    sms?: boolean;
    MMS?: boolean;
    mms?: boolean;
  };
};

type TwilioAvailableNumbersResult = {
  available_phone_numbers?: TwilioAvailableNumber[];
};

type TwilioIncomingPhoneNumber = {
  sid?: string;
  phone_number?: string;
  friendly_name?: string | null;
  iso_country?: string | null;
  capabilities?: TwilioAvailableNumber["capabilities"];
  voice_url?: string | null;
  voice_method?: string | null;
};

type TwilioIncomingPhoneNumbersResult = {
  incoming_phone_numbers?: TwilioIncomingPhoneNumber[];
};

type TwilioPricingResult = {
  country?: string;
  iso_country?: string;
  price_unit?: string;
  phone_number_prices?: Array<{
    number_type?: string;
    base_price?: string;
    current_price?: string;
  }>;
};

type TwilioNumberSearchQuery = z.infer<typeof TwilioNumberSearchQuerySchema>;

type TelephoneNumberPricing = {
  currency: string | null;
  monthlyPrice: string | null;
  numberType: string;
};

class TwilioApiError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly detail?: unknown,
  ) {
    super(message);
  }
}

function getTwilioCredentials(
  options: BuildServerOptions,
): TwilioCredentials | null {
  if (!options.twilioAccountSid || !options.twilioAuthToken) {
    return null;
  }
  return {
    accountSid: options.twilioAccountSid,
    authToken: options.twilioAuthToken,
  };
}

async function twilioApiRequest<T>(
  credentials: TwilioCredentials,
  path: string,
  options: {
    method: "GET" | "POST";
    query?: Record<string, string | number | boolean | undefined>;
    form?: Record<string, string | number | boolean | null | undefined>;
  },
): Promise<T> {
  const normalizedPath = path.replace("{AccountSid}", credentials.accountSid);
  const url = new URL(
    normalizedPath,
    normalizedPath.startsWith("/v1/")
      ? "https://pricing.twilio.com"
      : "https://api.twilio.com",
  );
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const requestInit: RequestInit = {
    method: options.method,
    headers: {
      Authorization: `Basic ${Buffer.from(
        `${credentials.accountSid}:${credentials.authToken}`,
      ).toString("base64")}`,
      ...(options.form
        ? { "content-type": "application/x-www-form-urlencoded" }
        : {}),
    },
    // Bound the external call so a hung Twilio API never stalls a request.
    signal: AbortSignal.timeout(10_000),
  };
  if (options.form) {
    requestInit.body = new URLSearchParams(
      Object.fromEntries(
        Object.entries(options.form)
          .filter(([, value]) => value !== undefined && value !== null)
          .map(([key, value]) => [key, String(value)]),
      ),
    );
  }

  const response = await fetch(url, requestInit);

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const detail = isRecord(payload) ? payload : { message: String(payload) };
    const message =
      typeof detail.message === "string"
        ? detail.message
        : "Twilio request failed.";
    throw new TwilioApiError(message, response.status, detail);
  }

  return payload as T;
}

async function sendTwilioError(reply: FastifyReply, error: unknown) {
  if (error instanceof TwilioApiError) {
    return reply.code(error.statusCode).send({
      error: error.message,
      detail: error.detail,
    });
  }
  throw error;
}

async function searchTwilioAvailableNumbers(
  credentials: TwilioCredentials,
  query: TwilioNumberSearchQuery,
  pricing: TelephoneNumberPricing,
) {
  const result = await twilioApiRequest<TwilioAvailableNumbersResult>(
    credentials,
    `/2010-04-01/Accounts/{AccountSid}/AvailablePhoneNumbers/${query.country}/${twilioInventoryType(
      query.numberType,
    )}.json`,
    {
      method: "GET",
      query: {
        VoiceEnabled: "true",
        PageSize: query.limit,
        ...(query.contains ? { Contains: query.contains } : {}),
        ...(query.locality ? { InLocality: query.locality } : {}),
        ...(query.region ? { InRegion: query.region } : {}),
        ...(query.postalCode ? { InPostalCode: query.postalCode } : {}),
      },
    },
  );

  return (result.available_phone_numbers ?? []).map((number) => ({
    phoneNumber: number.phone_number ?? "",
    friendlyName: number.friendly_name ?? number.phone_number ?? "",
    locality: number.locality ?? null,
    region: number.region ?? null,
    isoCountry: number.iso_country ?? query.country,
    capabilities: normalizeTwilioCapabilities(number.capabilities),
    monthlyPrice: pricing.monthlyPrice,
    currency: pricing.currency,
  }));
}

async function fetchTwilioNumberPricing(
  credentials: TwilioCredentials,
  query: Pick<TwilioNumberSearchQuery, "country" | "numberType">,
): Promise<TelephoneNumberPricing> {
  try {
    const result = await twilioApiRequest<TwilioPricingResult>(
      credentials,
      `/v1/PhoneNumbers/Countries/${query.country}`,
      {
        method: "GET",
      },
    );
    const targetType = twilioPricingNumberType(query.numberType);
    const price = (result.phone_number_prices ?? []).find(
      (item) => item.number_type?.toLowerCase() === targetType,
    );
    return {
      currency: result.price_unit ?? null,
      monthlyPrice: price?.current_price ?? price?.base_price ?? null,
      numberType: query.numberType,
    };
  } catch {
    return {
      currency: null,
      monthlyPrice: null,
      numberType: query.numberType,
    };
  }
}

async function findTwilioIncomingNumberSid(
  credentials: TwilioCredentials,
  phoneNumber: string | undefined,
) {
  if (!phoneNumber) {
    return null;
  }
  const result = await twilioApiRequest<TwilioIncomingPhoneNumbersResult>(
    credentials,
    "/2010-04-01/Accounts/{AccountSid}/IncomingPhoneNumbers.json",
    {
      method: "GET",
      query: { PhoneNumber: phoneNumber, PageSize: "1" },
    },
  );
  return result.incoming_phone_numbers?.[0]?.sid ?? null;
}

function mapTwilioIncomingPhoneNumber(number: TwilioIncomingPhoneNumber) {
  return {
    sid: number.sid ?? null,
    phoneNumber: number.phone_number ?? null,
    friendlyName: number.friendly_name ?? null,
    isoCountry: number.iso_country ?? null,
    capabilities: normalizeTwilioCapabilities(number.capabilities),
    voiceUrl: number.voice_url ?? null,
    voiceMethod: number.voice_method ?? null,
  };
}

function normalizeTwilioCapabilities(
  capabilities: TwilioAvailableNumber["capabilities"] | undefined,
) {
  return {
    voice: Boolean(capabilities?.voice),
    sms: Boolean(capabilities?.sms ?? capabilities?.SMS),
    mms: Boolean(capabilities?.mms ?? capabilities?.MMS),
  };
}

function twilioInventoryType(
  numberType: z.infer<typeof TwilioNumberTypeSchema>,
) {
  if (numberType === "mobile") {
    return "Mobile";
  }
  if (numberType === "toll-free") {
    return "TollFree";
  }
  return "Local";
}

function twilioPricingNumberType(
  numberType: z.infer<typeof TwilioNumberTypeSchema>,
) {
  if (numberType === "toll-free") {
    return "toll free";
  }
  return numberType;
}

function buildTelephoneVoiceWebhookUrl(
  options: BuildServerOptions,
  tenant: StoreTenant,
) {
  const voiceBase =
    options.voicePublicUrl ??
    process.env.VOICE_PUBLIC_URL ??
    "https://assaddar-voice-production.up.railway.app";
  return `${voiceBase}/twilio/voice?assistantId=${encodeURIComponent(
    tenant.publicId,
  )}`;
}

function buildTelephoneVoiceBridgeUrl(
  options: BuildServerOptions,
  tenant: StoreTenant,
) {
  const voiceBase =
    options.voicePublicUrl ??
    process.env.VOICE_PUBLIC_URL ??
    "https://assaddar-voice-production.up.railway.app";
  return `${voiceBase}/voice/turn?assistantId=${encodeURIComponent(
    tenant.publicId,
  )}`;
}

function buildTelephoneSipTarget(tenant: StoreTenant) {
  const sipDomain =
    process.env.VOICE_SIP_DOMAIN ??
    process.env.VOICE_EDGE_SIP_DOMAIN ??
    "voice-edge.assaddar.de";
  return `sip:${tenant.publicId}@${sipDomain}`;
}

async function getTelephoneConnectionSettings(
  options: BuildServerOptions,
  tenantId: string,
  provider: z.infer<typeof TelephoneProviderSchema>,
) {
  const connections = await options.store.listChannelConnections(tenantId);
  const current =
    connections
      .map((connection) => asRecord(connection))
      .find(
        (connection) =>
          connection.channel === "telephone" &&
          connection.provider === provider,
      ) ??
    connections
      .map((connection) => asRecord(connection))
      .find((connection) => connection.channel === "telephone");
  return asRecord(current?.settings);
}

function buildTelephoneComplianceNotice(
  country: string,
  numberType: z.infer<typeof TwilioNumberTypeSchema>,
) {
  if (country === "DE" && numberType === "toll-free") {
    return {
      level: "manual_review",
      title: "German toll-free numbers need regulator allocation.",
      detail:
        "Apply for the number with BNetzA first, then activate it with Twilio using the allocation document.",
    };
  }
  if (country === "DE") {
    return {
      level: "review_possible",
      title: "German numbers can require business compliance.",
      detail:
        "If Twilio blocks purchase, create or attach an approved Regulatory Bundle with German business details.",
    };
  }
  return {
    level: "country_specific",
    title: "Check local number rules.",
    detail:
      "Number availability and required documentation depend on country, number type, and customer profile.",
  };
}

function countryFromE164Number(phoneNumber: string) {
  if (phoneNumber.startsWith("+49")) {
    return "DE";
  }
  return "UNKNOWN";
}

function buildNewTelephoneNumberInstructions(input: {
  provider: z.infer<typeof TelephoneProviderSchema>;
  requestedCountry: string;
  numberType: z.infer<typeof TelephoneNumberTypeSchema>;
  areaCode?: string | undefined;
  locality?: string | undefined;
  orderedNumber?: string | undefined;
  sipTarget: string;
}) {
  const providerName = telephoneProviderLabel(input.provider);
  const location = [input.areaCode, input.locality].filter(Boolean).join(" / ");
  return [
    input.orderedNumber
      ? `Use ${input.orderedNumber} as the public ${providerName} AI number.`
      : `Order a ${input.requestedCountry} ${input.numberType} number with ${providerName}${
          location ? ` for ${location}` : ""
        }.`,
    `Create or select the SIP trunk for that number in ${providerName}.`,
    `Route inbound calls from the provider/PBX to ${input.sipTarget}.`,
    "Place a test call from an external phone and confirm the Assaddar AI call appears in the inbox.",
    "Keep the provider contract in the customer's name unless Assaddar becomes a formal telecom reseller.",
  ];
}

function buildCarrierForwardingInstructions(input: {
  aiNumber: string;
  provider: z.infer<typeof TelephoneProviderSchema>;
  sipTarget: string;
}) {
  const providerName = telephoneProviderLabel(input.provider);
  return [
    `Open the current carrier or PBX settings for the existing business number.`,
    `Create unconditional call forwarding to ${input.aiNumber}.`,
    `Make sure ${input.aiNumber} is routed by ${providerName} into ${input.sipTarget}.`,
    "Place a test call from an external phone and confirm the AI answers.",
    "If caller ID or call recording rules matter, verify them with the carrier before publishing.",
  ];
}

function buildSipByocInstructions(input: {
  provider: z.infer<typeof TelephoneProviderSchema>;
  voiceBridgeUrl: string;
  sipTarget: string;
}) {
  const providerName = telephoneProviderLabel(input.provider);
  return [
    `Create or reuse the SIP trunk with ${providerName}.`,
    `Route inbound PSTN traffic from the provider or PBX to ${input.sipTarget}.`,
    `Configure the voice edge to call the Railway voice bridge at ${input.voiceBridgeUrl}.`,
    "Place a test call, confirm speech recognition, and verify fallback to a human transfer.",
  ];
}

function buildTelephoneRuntimeSettings(input: {
  currentSettings: Record<string, unknown>;
  update: z.infer<typeof TelephoneSettingsSchema>;
  provider: z.infer<typeof TelephoneProviderSchema>;
  voiceBridgeUrl: string;
  sipTarget: string;
}) {
  const current = input.currentSettings;
  const merged: Record<string, unknown> = {
    ...current,
    provider: input.provider,
    voiceBridgeUrl: input.voiceBridgeUrl,
    sipTarget: input.sipTarget,
    updatedAt: new Date().toISOString(),
  };

  if (input.update.setupChecklist) {
    merged.setupChecklist = {
      ...asRecord(current.setupChecklist),
      ...input.update.setupChecklist,
    };
  }
  if (input.update.businessHours) {
    merged.businessHours = {
      ...asRecord(current.businessHours),
      ...input.update.businessHours,
    };
  }
  if (input.update.handoffRules) {
    merged.handoffRules = {
      ...asRecord(current.handoffRules),
      ...input.update.handoffRules,
    };
  }
  if (input.update.gdpr) {
    merged.gdpr = {
      ...asRecord(current.gdpr),
      ...input.update.gdpr,
    };
  }
  if (input.update.voiceQuality) {
    merged.voiceQuality = {
      ...asRecord(current.voiceQuality),
      ...input.update.voiceQuality,
    };
  }
  if (input.update.testCall) {
    merged.testCall = {
      ...asRecord(current.testCall),
      ...input.update.testCall,
      testedAt:
        input.update.testCall.status === "not_started"
          ? null
          : new Date().toISOString(),
    };
    if (input.update.testCall.status === "passed") {
      merged.setupChecklist = {
        ...asRecord(merged.setupChecklist),
        testCallCompleted: true,
      };
    }
  }

  return merged;
}

function telephoneExternalAccountIdFromSettings(
  settings: Record<string, unknown>,
) {
  for (const key of [
    "orderedNumber",
    "publicNumber",
    "aiNumber",
    "existingNumber",
    "sipTarget",
  ]) {
    const value = settings[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return "telephone-settings";
}

function buildTelephoneSetupWarnings(settings: Record<string, unknown>) {
  const checklist = asRecord(settings.setupChecklist);
  const gdpr = asRecord(settings.gdpr);
  const testCall = asRecord(settings.testCall);
  const warnings: Array<{
    level: "info" | "warn";
    title: string;
    detail: string;
  }> = [];

  if (!checklist.numberOrdered) {
    warnings.push({
      level: "warn",
      title: "Number not confirmed",
      detail: "Add the provider number or mark the new number order complete.",
    });
  }
  if (!checklist.sipConfigured && !settings.sipConfigured) {
    warnings.push({
      level: "warn",
      title: "SIP routing pending",
      detail: "Route the provider trunk/PBX to the Assaddar voice edge.",
    });
  }
  if (!checklist.testCallCompleted && testCall.status !== "passed") {
    warnings.push({
      level: "warn",
      title: "Test call missing",
      detail: "Place a real test call before publishing the AI number.",
    });
  }
  if (!checklist.fallbackSet && !settings.fallbackNumber) {
    warnings.push({
      level: "info",
      title: "Fallback number missing",
      detail: "Add a human fallback number for urgent or low-confidence calls.",
    });
  }
  if (!checklist.disclosureConfirmed && !gdpr.disclosureText) {
    warnings.push({
      level: "warn",
      title: "AI disclosure missing",
      detail: "Add the phone disclosure text callers hear at the start.",
    });
  }
  return warnings;
}

function normalizeTelephoneProvider(
  provider: unknown,
): z.infer<typeof TelephoneProviderSchema> {
  const parsed = TelephoneProviderSchema.safeParse(provider);
  return parsed.success ? parsed.data : "easybell";
}

async function checkTelephoneVoiceEdge(options: BuildServerOptions) {
  const voiceBase =
    options.voicePublicUrl ??
    process.env.VOICE_PUBLIC_URL ??
    "https://assaddar-voice-production.up.railway.app";
  const healthUrl = `${voiceBase.replace(/\/$/, "")}/health`;
  const checkedAt = new Date().toISOString();
  try {
    const response = await fetch(healthUrl, {
      signal: AbortSignal.timeout(4_000),
    });
    return {
      status: response.ok ? "online" : "degraded",
      url: healthUrl,
      checkedAt,
      responseStatus: response.status,
    };
  } catch (error) {
    return {
      status: "offline",
      url: healthUrl,
      checkedAt,
      detail: error instanceof Error ? error.message : "health_check_failed",
    };
  }
}

function telephoneProviderLabel(
  provider: z.infer<typeof TelephoneProviderSchema>,
) {
  const labels: Record<z.infer<typeof TelephoneProviderSchema>, string> = {
    easybell: "easybell",
    sipgate: "sipgate",
    peoplefone: "peoplefone",
    custom_sip: "custom SIP provider",
  };
  return labels[provider];
}

type ChannelDashboardItem = {
  channel: Channel;
  provider: string;
  label: string;
  status: "pending" | "connected" | "disabled";
  externalAccountId?: string | null | undefined;
  webhookUrl?: string | undefined;
  assistantWebhookUrl?: string | undefined;
  credentialConfigured: boolean;
  settings: Record<string, unknown>;
  updatedAt?: unknown;
  liveTraffic?: {
    status: "active" | "idle";
    recentConversationCount: number;
    latestCallAt?: string | null;
    latestConversationId?: string | null;
    latestConversationPublicId?: string | null;
    latestCaller?: string | null;
  };
};

function dateLikeToIso(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  return null;
}

function withTelephoneLiveTraffic(
  channelConnections: ChannelDashboardItem[],
  unifiedInbox: unknown[],
) {
  const telephoneConversations = unifiedInbox
    .map((item) => asRecord(item))
    .filter((item) => item.channel === "telephone")
    .sort((left, right) => {
      const leftTime = Date.parse(
        dateLikeToIso(left.updatedAt) ?? dateLikeToIso(left.createdAt) ?? "",
      );
      const rightTime = Date.parse(
        dateLikeToIso(right.updatedAt) ?? dateLikeToIso(right.createdAt) ?? "",
      );
      return (
        (Number.isNaN(rightTime) ? 0 : rightTime) -
        (Number.isNaN(leftTime) ? 0 : leftTime)
      );
    });
  const latest = telephoneConversations[0];
  const latestCallAt = latest
    ? (dateLikeToIso(latest.updatedAt) ?? dateLikeToIso(latest.createdAt))
    : null;
  const liveTraffic = {
    status: latest ? ("active" as const) : ("idle" as const),
    recentConversationCount: telephoneConversations.length,
    latestCallAt,
    latestConversationId: typeof latest?.id === "string" ? latest.id : null,
    latestConversationPublicId:
      typeof latest?.publicId === "string" ? latest.publicId : null,
    latestCaller:
      typeof latest?.externalUserId === "string" ? latest.externalUserId : null,
  };

  return channelConnections.map((connection) =>
    connection.channel === "telephone"
      ? {
          ...connection,
          liveTraffic,
        }
      : connection,
  );
}

function buildChannelConnectionDashboard(input: {
  tenant: StoreTenant | null;
  connections: unknown[];
  options: BuildServerOptions;
}) {
  const apiBase =
    process.env.API_PUBLIC_URL ??
    "https://assaddar-api-production.up.railway.app";
  const voiceBase =
    input.options.voicePublicUrl ??
    process.env.VOICE_PUBLIC_URL ??
    "https://assaddar-voice-production.up.railway.app";
  const assistantId = input.tenant?.publicId;
  const telephoneConnection = input.connections
    .map((connection) => asRecord(connection))
    .find((connection) => connection.channel === "telephone");
  const telephoneProvider =
    typeof telephoneConnection?.provider === "string"
      ? telephoneConnection.provider
      : "easybell";
  const connectionMap = new Map(
    input.connections.map((connection) => {
      const record = asRecord(connection);
      return [
        `${record.channel ?? ""}:${record.provider ?? ""}`,
        record,
      ] as const;
    }),
  );

  const item = (
    channel: Channel,
    provider: string,
    label: string,
    extras: Omit<
      ChannelDashboardItem,
      | "channel"
      | "provider"
      | "label"
      | "status"
      | "settings"
      | "credentialConfigured"
    > & {
      credentialConfigured: boolean;
      defaultStatus?: ChannelDashboardItem["status"];
    },
  ): ChannelDashboardItem => {
    const connection = connectionMap.get(`${channel}:${provider}`);
    const { defaultStatus = "pending", ...dashboardExtras } = extras;
    const status =
      connection?.status === "connected" ||
      connection?.status === "disabled" ||
      connection?.status === "pending"
        ? connection.status
        : defaultStatus;
    return {
      channel,
      provider,
      label,
      status,
      externalAccountId:
        typeof connection?.externalAccountId === "string"
          ? connection.externalAccountId
          : null,
      settings: redactSecretSettings(asRecord(connection?.settings)),
      updatedAt: connection?.updatedAt,
      ...dashboardExtras,
    };
  };

  return [
    item("website", "assaddar-widget", "Website widget", {
      credentialConfigured: true,
      defaultStatus: "connected",
      assistantWebhookUrl: assistantId
        ? `${apiBase}/widget/config/${assistantId}`
        : undefined,
    }),
    item("telephone", telephoneProvider, "Telephone AI", {
      credentialConfigured:
        telephoneProvider === "twilio"
          ? Boolean(
              input.options.twilioAccountSid && input.options.twilioAuthToken,
            )
          : true,
      webhookUrl: assistantId
        ? `${voiceBase}/voice/turn?assistantId=${assistantId}`
        : `${voiceBase}/voice/turn`,
    }),
    item("whatsapp", "meta-whatsapp-cloud", "WhatsApp Business", {
      credentialConfigured: Boolean(input.options.whatsappAccessToken),
      webhookUrl: `${apiBase}/webhooks/meta/whatsapp`,
      assistantWebhookUrl: assistantId
        ? `${apiBase}/webhooks/meta/whatsapp?assistantId=${assistantId}`
        : undefined,
    }),
    item("messenger", "meta-messenger-platform", "Facebook Messenger", {
      credentialConfigured: Boolean(input.options.messengerPageAccessToken),
      webhookUrl: `${apiBase}/webhooks/meta/messenger`,
      assistantWebhookUrl: assistantId
        ? `${apiBase}/webhooks/meta/messenger?assistantId=${assistantId}`
        : undefined,
    }),
    item("instagram", "meta-messenger-platform", "Instagram DM", {
      credentialConfigured: Boolean(input.options.messengerPageAccessToken),
      webhookUrl: `${apiBase}/webhooks/meta/instagram`,
      assistantWebhookUrl: assistantId
        ? `${apiBase}/webhooks/meta/instagram?assistantId=${assistantId}`
        : undefined,
    }),
    item("telegram", "telegram-bot-api", "Telegram", {
      credentialConfigured: false,
      assistantWebhookUrl: assistantId
        ? `${apiBase}/webhooks/telegram?assistantId=${assistantId}`
        : undefined,
    }),
    item("email", "assaddar-email-forwarding", "Email support inbox", {
      credentialConfigured: false,
    }),
  ];
}

async function processChannelInboundEvent(input: {
  options: BuildServerOptions;
  engine: ReturnType<typeof createAnswerEngine>;
  adapter: ChannelAdapter;
  tenant: StoreTenant;
  event: NormalizedInboundEvent;
}) {
  const conversationInput: Parameters<
    PlatformStore["findOrCreateConversation"]
  >[0] = {
    tenantId: input.tenant.id,
    channel: input.event.channel,
    locale: input.tenant.defaultLocale,
  };
  if (input.event.externalConversationId) {
    conversationInput.publicConversationId = buildProviderConversationId(
      input.event,
    );
  }
  if (input.event.externalUserId) {
    conversationInput.externalUserId = input.event.externalUserId;
  }

  const conversation =
    await input.options.store.findOrCreateConversation(conversationInput);

  const inboundRecord = await input.options.store.addMessage({
    tenantId: input.tenant.id,
    conversationId: conversation.id,
    channel: input.event.channel,
    direction: "inbound",
    role: "user",
    content: input.event.text,
    trace: {
      provider: input.event.provider,
      providerAccountId: input.event.providerAccountId,
      raw: input.event.raw,
    },
  });

  const answer = await input.engine.answer(
    InboundMessageSchema.parse({
      tenantId: input.tenant.id,
      conversationId: conversation.id,
      channel: input.event.channel,
      externalUserId: input.event.externalUserId,
      text: input.event.text,
      locale: input.tenant.defaultLocale,
      metadata: {
        provider: input.event.provider,
        providerAccountId: input.event.providerAccountId,
      },
    }),
  );

  const outboundMessage = {
    tenantId: input.tenant.id,
    channel: input.event.channel,
    provider: input.adapter.provider,
    text: answer.text,
  };
  if (input.event.providerAccountId) {
    Object.assign(outboundMessage, {
      providerAccountId: input.event.providerAccountId,
    });
  }
  if (input.event.externalConversationId) {
    Object.assign(outboundMessage, {
      externalConversationId: input.event.externalConversationId,
    });
  }
  if (input.event.externalUserId) {
    Object.assign(outboundMessage, {
      externalUserId: input.event.externalUserId,
    });
  }
  const sendPolicy = evaluateAutomatedReplyPolicy({
    channel: input.event.channel,
    provider: input.adapter.provider,
    lastInboundAt: getDateProperty(inboundRecord, "createdAt") ?? new Date(),
  });
  const delivery: DeliveryResult = sendPolicy.allowed
    ? await input.adapter.sendMessage(outboundMessage)
    : {
        status: "skipped" as const,
        detail:
          sendPolicy.reason ?? "Outbound reply blocked by channel policy.",
      };

  const outboundRecord = await input.options.store.addMessage({
    tenantId: input.tenant.id,
    conversationId: conversation.id,
    channel: input.event.channel,
    direction: "outbound",
    role: "assistant",
    content: answer.text,
    trace: {
      answer,
      delivery,
      sendPolicy,
    },
  });

  await input.options.store.recordMessageDelivery({
    tenantId: input.tenant.id,
    messageId: getStringProperty(outboundRecord, "id") ?? null,
    conversationId: conversation.id,
    channel: input.event.channel,
    provider: input.adapter.provider,
    providerMessageId: delivery.providerMessageId ?? null,
    status: delivery.status,
    detail: delivery.detail ?? null,
    metadata: {
      providerAccountId: input.event.providerAccountId,
      externalConversationId: input.event.externalConversationId,
      externalUserId: input.event.externalUserId,
      sendPolicy,
      // Persist retry eligibility and an attempt counter so the delivery-retry
      // worker can pick up transient failures and re-send them.
      retryable: delivery.status === "failed" && delivery.retryable === true,
      attempts: 0,
    },
  });

  await input.options.store.logUsage({
    tenantId: input.tenant.id,
    channel: input.event.channel,
    eventType: answer.status,
    credits: answer.usage.estimatedCredits,
    metadata: {
      intent: answer.intent,
      confidence: answer.confidence,
      provider: input.event.provider,
      deliveryStatus: delivery.status,
      providerMessageId: delivery.providerMessageId,
    },
  });

  return {
    conversationId: conversation.publicId,
    answerStatus: answer.status,
    deliveryStatus: delivery.status,
    deliveryDetail: delivery.detail,
  };
}

function buildProviderConversationId(event: NormalizedInboundEvent) {
  return [
    event.channel,
    event.provider,
    event.providerAccountId,
    event.externalConversationId,
  ]
    .filter(Boolean)
    .join(":");
}

function extractMetaProviderAccountId(
  channel: "whatsapp" | "messenger" | "instagram",
  payload: unknown,
) {
  const entry = asArray(asRecord(payload).entry)[0];
  if (!isRecord(entry)) {
    return undefined;
  }

  if (channel === "whatsapp") {
    const change = asArray(entry.changes)[0];
    const value = isRecord(change) ? asRecord(change.value) : {};
    const metadata = asRecord(value.metadata);
    return typeof metadata.phone_number_id === "string"
      ? metadata.phone_number_id
      : undefined;
  }

  return typeof entry.id === "string" ? entry.id : undefined;
}

function getPermissions(role: LegacyAdminRole | RoleName) {
  const permissions: Record<LegacyAdminRole | RoleName, string[]> = {
    owner: [
      "tenants:write",
      "users:write",
      "knowledge:write",
      "leads:write",
      "settings:write",
      "exports:read",
    ],
    admin: [
      "users:write",
      "knowledge:write",
      "leads:write",
      "settings:write",
      "exports:read",
    ],
    operator: ["knowledge:write", "leads:write"],
    viewer: ["exports:read"],
    platform_owner: [
      "tenants:write",
      "users:write",
      "knowledge:write",
      "leads:write",
      "settings:write",
      "exports:read",
    ],
    tenant_owner: [
      "users:write",
      "knowledge:write",
      "leads:write",
      "settings:write",
      "exports:read",
    ],
    tenant_admin: [
      "users:write",
      "knowledge:write",
      "leads:write",
      "settings:write",
      "exports:read",
    ],
  };
  return permissions[role];
}

type DecodedKnowledgeUpload = {
  buffer: Buffer;
  checksum: string;
  bytes: number;
};

type ExtractedKnowledgeUploadText = {
  text: string;
  checksum: string;
  parser: string;
  bytes: number;
};

function decodeKnowledgeUpload(
  input: KnowledgeDocumentUploadInput,
): DecodedKnowledgeUpload {
  const cleaned = input.contentBase64
    .replace(/^data:[^;]+;base64,/i, "")
    .replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned)) {
    throw new AppError(
      400,
      "invalid_document_upload",
      "Document content must be base64 encoded.",
    );
  }
  const buffer = Buffer.from(cleaned, "base64");
  if (buffer.byteLength === 0) {
    throw new AppError(
      400,
      "invalid_document_upload",
      "Document upload is empty.",
    );
  }
  if (buffer.byteLength > 5 * 1024 * 1024) {
    throw new AppError(
      400,
      "document_too_large",
      "Document upload must be 5 MB or smaller.",
    );
  }
  return {
    buffer,
    checksum: createHash("sha256").update(buffer).digest("hex"),
    bytes: buffer.byteLength,
  };
}

function extractUploadedKnowledgeText(
  input: KnowledgeDocumentUploadInput,
  decoded: DecodedKnowledgeUpload,
): ExtractedKnowledgeUploadText {
  const contentType = input.contentType.toLowerCase();
  const fileName = input.fileName.toLowerCase();
  const isPdf =
    contentType.includes("application/pdf") || fileName.endsWith(".pdf");
  const isText =
    contentType.startsWith("text/") ||
    contentType.includes("json") ||
    contentType.includes("csv") ||
    /\.(txt|md|markdown|csv|json)$/i.test(input.fileName);

  const text = isPdf
    ? extractTextFromSimplePdf(decoded.buffer)
    : isText
      ? decoded.buffer.toString("utf8")
      : "";
  if (!text) {
    throw new AppError(
      400,
      "unsupported_document_type",
      "Only text, Markdown, CSV, JSON, and text-based PDFs are supported.",
    );
  }
  const normalized = normalizeUploadedText(text);
  if (normalized.length < 20) {
    throw new AppError(
      400,
      "document_parse_failed",
      "Document extraction produced too little readable text.",
    );
  }
  return {
    text: normalized,
    checksum: decoded.checksum,
    parser: isPdf ? "simple_pdf_text" : "plain_text",
    bytes: decoded.bytes,
  };
}

function normalizeUploadedText(value: string) {
  return value
    .split(String.fromCharCode(0))
    .join("")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function extractTextFromSimplePdf(buffer: Buffer) {
  const source = buffer.toString("latin1");
  const streamMatches = Array.from(
    source.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g),
  ).map((match) => match[1] ?? "");
  const candidates = streamMatches.length ? streamMatches : [source];
  const text = candidates
    .flatMap((candidate) => extractPdfTextOperators(candidate))
    .join("\n");
  const normalized = normalizeUploadedText(text);
  if (!normalized) {
    throw new AppError(
      400,
      "document_parse_failed",
      "This PDF does not expose readable text. Upload a text PDF or OCR export.",
    );
  }
  return normalized;
}

function extractPdfTextOperators(source: string): string[] {
  const output: string[] = [];
  for (const match of source.matchAll(/\(((?:\\.|[^\\)])*)\)\s*(?:Tj|'|")/g)) {
    output.push(decodePdfLiteralString(match[1] ?? ""));
  }
  for (const match of source.matchAll(/\[((?:.|\n|\r)*?)\]\s*TJ/g)) {
    const arraySource = match[1] ?? "";
    const parts = Array.from(
      arraySource.matchAll(/\(((?:\\.|[^\\)])*)\)/g),
    ).map((part) => decodePdfLiteralString(part[1] ?? ""));
    if (parts.length) {
      output.push(parts.join(""));
    }
  }
  for (const match of source.matchAll(/<([0-9A-Fa-f\s]{4,})>\s*Tj/g)) {
    output.push(decodePdfHexString(match[1] ?? ""));
  }
  return output.map((item) => item.trim()).filter(Boolean);
}

function decodePdfLiteralString(value: string) {
  let output = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char !== "\\") {
      output += char;
      continue;
    }
    const next = value[index + 1];
    if (!next) {
      continue;
    }
    if (next === "n") {
      output += "\n";
    } else if (next === "r") {
      output += "\r";
    } else if (next === "t") {
      output += "\t";
    } else if (next === "b") {
      output += "\b";
    } else if (next === "f") {
      output += "\f";
    } else if (/[0-7]/.test(next)) {
      const octal = value.slice(index + 1).match(/^[0-7]{1,3}/)?.[0] ?? next;
      output += String.fromCharCode(Number.parseInt(octal, 8));
      index += octal.length;
      continue;
    } else {
      output += next;
    }
    index += 1;
  }
  return output;
}

function decodePdfHexString(value: string) {
  const hex = value.replace(/\s/g, "");
  if (hex.length < 2 || hex.length % 2 !== 0) {
    return "";
  }
  const bytes = Buffer.from(hex, "hex");
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    const chars: string[] = [];
    for (let index = 2; index + 1 < bytes.length; index += 2) {
      chars.push(String.fromCharCode(bytes.readUInt16BE(index)));
    }
    return chars.join("");
  }
  return bytes.toString("latin1");
}

async function crawlTextDocuments(url: string, maxPages: number) {
  const first = await fetchTextDocument(url);
  if (maxPages <= 1) {
    return [first];
  }

  const links = extractSameOriginLinks(first.html, first.finalUrl).slice(
    0,
    maxPages - 1,
  );
  const extraPages = await Promise.allSettled(
    links.map((link) => fetchTextDocument(link)),
  );

  return [
    first,
    ...extraPages.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    ),
  ];
}

async function fetchTextDocument(url: string, redirectsRemaining = 3) {
  const parsed = new URL(url);
  await assertPublicHttpScanUrl(parsed);

  const response = await fetch(parsed.toString(), {
    headers: {
      accept: "text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.5",
      "user-agent": "AssaddarAI-WebsiteScanner/1.0",
    },
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });
  if (isRedirect(response.status)) {
    if (redirectsRemaining <= 0) {
      throw new Error("Too many redirects while scanning URL.");
    }
    const location = response.headers.get("location");
    if (!location) {
      throw new Error("Redirect response did not include a Location header.");
    }
    return fetchTextDocument(
      new URL(location, parsed).toString(),
      redirectsRemaining - 1,
    );
  }
  if (!isTextResponse(response)) {
    throw new Error("Only HTML or plain-text URLs can be scanned.");
  }
  const html = await readLimitedResponseText(response, 900_000);

  return {
    finalUrl: response.url || parsed.toString(),
    status: response.status,
    html,
  };
}

async function assertPublicHttpScanUrl(parsed: URL) {
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS URLs can be scanned.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Credentialed URLs cannot be scanned.");
  }
  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    throw new Error("Private or local network URLs cannot be scanned.");
  }

  const addresses = net.isIP(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (
    addresses.length === 0 ||
    addresses.some((entry) => isPrivateOrReservedAddress(entry.address))
  ) {
    throw new Error("Private or local network URLs cannot be scanned.");
  }
}

function isRedirect(status: number) {
  return status >= 300 && status < 400;
}

function isTextResponse(response: Response) {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  return (
    !contentType ||
    contentType.includes("text/html") ||
    contentType.includes("application/xhtml+xml") ||
    contentType.includes("text/plain")
  );
}

async function readLimitedResponseText(response: Response, maxBytes: number) {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > maxBytes) {
    throw new Error("Scanned document is too large.");
  }
  if (!response.body) {
    return "";
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      throw new Error("Scanned document is too large.");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function isPrivateOrReservedAddress(address: string) {
  if (net.isIPv4(address)) {
    const [first = 0, second = 0] = address.split(".").map(Number);
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 100 && second >= 64 && second <= 127) ||
      first >= 224
    );
  }

  const normalized = address.toLowerCase();
  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80") ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:192.168.") ||
    /^::ffff:172\.(1[6-9]|2\d|3[01])\./.test(normalized)
  );
}

function extractSameOriginLinks(html: string, sourceUrl: string) {
  const origin = new URL(sourceUrl).origin;
  const links = Array.from(html.matchAll(/href=["']([^"']+)["']/gi))
    .flatMap((match) => {
      try {
        const href = match[1];
        if (!href) {
          return [];
        }
        const url = new URL(href, sourceUrl);
        url.hash = "";
        return [url];
      } catch {
        return [];
      }
    })
    .filter((url) => url.origin === origin)
    .filter(
      (url) => !/\.(pdf|png|jpg|jpeg|gif|svg|webp|zip)$/i.test(url.pathname),
    )
    .map((url) => url.toString());

  return Array.from(new Set(links)).filter((link) => link !== sourceUrl);
}

function buildUnansweredQueue(handoffs: unknown[]) {
  return handoffs
    .map(
      (handoff) =>
        handoff as {
          id: string;
          conversationId?: string | null;
          channel: string;
          reason: string;
          requesterMessage: string;
          status: string;
          createdAt: string;
        },
    )
    .filter((handoff) => handoff.reason !== "lead_capture")
    .filter((handoff) => handoff.reason !== "readiness_assessment")
    .map((handoff) => ({
      id: handoff.id,
      conversationId: handoff.conversationId,
      channel: handoff.channel,
      reason: handoff.reason,
      question: handoff.requesterMessage,
      status: handoff.status,
      createdAt: handoff.createdAt,
      suggestedTags: ["unanswered", handoff.reason, handoff.channel].filter(
        Boolean,
      ),
    }));
}

async function buildProductionReadinessForTenant(
  options: BuildServerOptions,
  request: FastifyRequest,
  tenantId: string,
): Promise<ProductionReadinessResult | null> {
  const auth = requestAuthContext.get(request);
  const canLoadUsers = auth
    ? canAccessTenantRole(auth, tenantId, "tenant_admin")
    : false;
  const [
    tenant,
    knowledge,
    analytics,
    conversations,
    unifiedInbox,
    contacts,
    handoffs,
    rawChannelConnections,
    whatsappTemplates,
    whatsappCompliance,
    tenantUsers,
  ] = await Promise.all([
    options.store.getTenant(tenantId),
    options.store.listKnowledge(tenantId, { limit: 50, offset: 0 }),
    options.store.getTenantAnalytics(tenantId),
    options.store.listConversations(tenantId, { limit: 4, offset: 0 }),
    Promise.resolve([]),
    options.store.listContacts(tenantId, { limit: 50, offset: 0 }),
    options.store.listHandoffs(tenantId, { limit: 50, offset: 0 }),
    options.store.listChannelConnections(tenantId),
    options.store.listWhatsappTemplates(tenantId),
    options.store.getWhatsappCompliance(tenantId),
    canLoadUsers
      ? options.store.listTenantUsers(tenantId, { limit: 50, offset: 0 })
      : Promise.resolve([]),
  ]);

  if (!tenant) {
    return null;
  }

  const channelConnections = buildChannelConnectionDashboard({
    tenant,
    connections: rawChannelConnections,
    options,
  });

  return buildProductionReadiness({
    tenant,
    knowledge,
    analytics,
    conversations,
    unifiedInbox,
    contacts,
    handoffs,
    channelConnections,
    whatsappTemplates,
    whatsappCompliance,
    tenantUsers,
    options,
  });
}

async function buildDashboardBootstrap(
  options: BuildServerOptions,
  request: FastifyRequest,
  tenantId: string,
) {
  const auth = requestAuthContext.get(request);
  const canLoadUsers = auth
    ? canAccessTenantRole(auth, tenantId, "tenant_admin")
    : false;
  const [
    tenant,
    knowledge,
    analytics,
    conversations,
    unifiedInbox,
    contacts,
    handoffs,
    rawChannelConnections,
    whatsappTemplates,
    whatsappCompliance,
    tenantUsers,
    tenantInvites,
  ] = await Promise.all([
    options.store.getTenant(tenantId),
    options.store.listKnowledge(tenantId, { limit: 50, offset: 0 }),
    options.store.getTenantAnalytics(tenantId),
    options.store.listConversations(tenantId, { limit: 50, offset: 0 }),
    options.store.listUnifiedInbox(tenantId, { limit: 50, offset: 0 }),
    options.store.listContacts(tenantId, { limit: 50, offset: 0 }),
    options.store.listHandoffs(tenantId, { limit: 50, offset: 0 }),
    options.store.listChannelConnections(tenantId),
    options.store.listWhatsappTemplates(tenantId),
    options.store.getWhatsappCompliance(tenantId),
    canLoadUsers
      ? options.store.listTenantUsers(tenantId, { limit: 50, offset: 0 })
      : Promise.resolve([]),
    canLoadUsers
      ? options.store.listTenantInvites(tenantId)
      : Promise.resolve([]),
  ]);
  const channelConnections = withTelephoneLiveTraffic(
    buildChannelConnectionDashboard({
      tenant,
      connections: rawChannelConnections,
      options,
    }),
    unifiedInbox,
  );
  const productionReadiness = tenant
    ? buildProductionReadiness({
        tenant,
        knowledge,
        analytics,
        conversations,
        unifiedInbox,
        contacts,
        handoffs,
        channelConnections,
        whatsappTemplates,
        whatsappCompliance,
        tenantUsers,
        options,
      })
    : null;

  return {
    knowledge,
    analytics,
    conversations,
    unifiedInbox,
    contacts,
    handoffs,
    channelConnections,
    whatsappTemplates,
    whatsappCompliance,
    unansweredQuestions: buildUnansweredQueue(handoffs),
    workflowSuggestions: buildWorkflowSuggestions({
      analytics,
      handoffs,
      contacts,
      templates: whatsappTemplates,
      compliance: whatsappCompliance,
    }),
    productionReadiness,
    tenantUsers,
    tenantInvites,
  };
}

function buildProductionReadiness(input: {
  tenant: StoreTenant;
  knowledge: unknown[];
  analytics: unknown;
  conversations: unknown[];
  unifiedInbox: unknown[];
  contacts: unknown[];
  handoffs: unknown[];
  channelConnections: ChannelDashboardItem[];
  whatsappTemplates: unknown[];
  whatsappCompliance: unknown;
  tenantUsers: unknown[];
  options: BuildServerOptions;
}): ProductionReadinessResult {
  const tenant = asRecord(input.tenant);
  const analytics = asRecord(input.analytics);
  const usageByStatus = asArray(analytics.usageByStatus);
  const channelByName = new Map<string, Record<string, unknown>>();
  for (const connection of input.channelConnections) {
    channelByName.set(String(connection.channel), asRecord(connection));
  }

  const website = channelByName.get("website");
  const whatsapp = channelByName.get("whatsapp");
  const messenger = channelByName.get("messenger");
  const instagram = channelByName.get("instagram");
  const telephone = channelByName.get("telephone");
  const telephoneSettings = asRecord(telephone?.settings);
  const telephoneChecklist = asRecord(telephoneSettings.setupChecklist);
  const telephoneGdpr = asRecord(telephoneSettings.gdpr);
  const compliance = asRecord(input.whatsappCompliance);
  const templateStats = asRecord(compliance.templates);
  const recentDeliveries = asArray(compliance.recentDeliveries);
  const theme = asRecord(tenant.theme);

  const approvedKnowledge =
    numberValue(analytics.approvedKnowledge) ??
    input.knowledge.filter((item) => asRecord(item).status === "approved")
      .length;
  const answered = usageTotal(usageByStatus, ["answered"]);
  const needsHuman = usageTotal(usageByStatus, ["handoff", "refused"]);
  const outcomeTotal = answered + needsHuman;
  const unresolvedRate = outcomeTotal > 0 ? needsHuman / outcomeTotal : 0;
  const approvedTemplates =
    numberValue(templateStats.approved) ??
    input.whatsappTemplates.filter(
      (template) => asRecord(template).status === "approved",
    ).length;
  const failedDeliveries = recentDeliveries.filter((delivery) =>
    ["failed", "error", "blocked"].includes(String(asRecord(delivery).status)),
  );
  const openHandoffs = input.handoffs
    .map((handoff) => asRecord(handoff))
    .filter((handoff) => handoff.status === "open");
  const assignedOpenHandoffs = openHandoffs.filter(
    (handoff) =>
      typeof handoff.assignedTo === "string" && handoff.assignedTo.trim(),
  );
  const contactsWithReachableDetail = input.contacts
    .map((contact) => asRecord(contact))
    .filter((contact) => Boolean(contact.email || contact.phone));
  const contactCompletionRate = input.contacts.length
    ? contactsWithReachableDetail.length / input.contacts.length
    : 0;

  const websiteReady = channelReady(website);
  const whatsappConnected = channelReady(whatsapp);
  const whatsappCredentialed = credentialReady(whatsapp);
  const metaSignatureConfigured = Boolean(
    input.options.metaAppSecret || process.env.META_APP_SECRET,
  );
  const socialCredentialed = [whatsapp, messenger, instagram].some(
    (connection) => credentialReady(connection) && channelReady(connection),
  );
  const telephoneConnected = channelReady(telephone);
  const telephoneHasNumber =
    typeof telephone?.externalAccountId === "string" &&
    telephone.externalAccountId.trim().length > 0;
  const telephoneHasDisclosure = Boolean(
    telephoneChecklist.disclosureConfirmed || telephoneGdpr.disclosureText,
  );
  const telephoneHasFallback = Boolean(
    telephoneChecklist.fallbackSet ||
    telephoneSettings.fallbackNumber ||
    telephoneSettings.transferPhoneNumber,
  );
  const telephoneLaunchReady = Boolean(
    telephoneConnected &&
    telephoneHasNumber &&
    telephoneChecklist.sipConfigured &&
    telephoneChecklist.testCallCompleted &&
    telephoneHasDisclosure &&
    telephoneHasFallback,
  );
  const whatsappLaunchReady = Boolean(
    whatsappConnected &&
    whatsappCredentialed &&
    approvedTemplates > 0 &&
    metaSignatureConfigured,
  );
  const credentialEncryptionConfigured = Boolean(
    process.env.CHANNEL_CREDENTIAL_MASTER_KEY ||
    process.env.CHANNEL_CREDENTIAL_KMS_KEY_ID,
  );
  const retentionDays = numberValue(tenant.retentionDays);
  const hasTenantTeam = input.tenantUsers.length > 0;
  const usageMetered = usageByStatus.length > 0;
  const leadCaptureEnabled = theme.leadCaptureEnabled !== false;
  const readinessEnabled = theme.readinessEnabled !== false;
  const billingConfigured = Boolean(
    process.env.STRIPE_SECRET_KEY ||
    process.env.BILLING_PROVIDER ||
    process.env.PLAN_LIMITS_ENABLED === "true",
  );

  const sections = [
    readinessSection("beta_scope", "Production beta scope", [
      readinessCheck({
        id: "beta.website_plus_channel",
        title: "Website plus one production channel",
        detail:
          "Launch with website chat and at least one real WhatsApp or telephone path before adding more channels.",
        status:
          websiteReady && (whatsappLaunchReady || telephoneLaunchReady)
            ? "pass"
            : websiteReady && approvedKnowledge > 0
              ? "warn"
              : "fail",
        actionLabel: "Finish WhatsApp or telephone launch",
        weight: 10,
      }),
    ]),
    readinessSection("provider_delivery", "Provider delivery and rules", [
      readinessCheck({
        id: "provider.whatsapp_send_path",
        title: "WhatsApp send path and templates",
        detail:
          "Requires a connected WhatsApp channel, access token, Meta signature verification, and at least one approved utility template.",
        status: whatsappLaunchReady
          ? "pass"
          : whatsappConnected || whatsappCredentialed || approvedTemplates > 0
            ? "warn"
            : "fail",
        actionLabel: "Complete WhatsApp Cloud API setup",
        weight: 7,
      }),
      readinessCheck({
        id: "provider.meta_accounts",
        title: "Messenger and Instagram account mapping",
        detail:
          "Messenger and Instagram should have connected page/account mappings before automated replies are enabled.",
        status:
          channelReady(messenger) || channelReady(instagram)
            ? credentialReady(messenger) || credentialReady(instagram)
              ? "pass"
              : "warn"
            : "warn",
        actionLabel: "Connect Meta accounts",
        weight: 3,
      }),
    ]),
    readinessSection("voice", "Production voice", [
      readinessCheck({
        id: "voice.media_edge",
        title: "SIP/RTP voice edge and launch checklist",
        detail:
          "Phone AI needs a routed number/SIP trunk, successful test call, caller disclosure, and a human fallback.",
        status: telephoneLaunchReady
          ? "pass"
          : telephoneConnected || telephoneHasNumber
            ? "warn"
            : "fail",
        actionLabel: "Finish telephone launch checklist",
        weight: 10,
      }),
    ]),
    readinessSection("handoff", "Human handoff operations", [
      readinessCheck({
        id: "handoff.assignment",
        title: "Open handoffs have owners",
        detail:
          "Uncertain, risky, or lead conversations should be assigned so no customer request stalls.",
        status:
          openHandoffs.length === 0 ||
          assignedOpenHandoffs.length === openHandoffs.length
            ? "pass"
            : assignedOpenHandoffs.length > 0
              ? "warn"
              : "fail",
        actionLabel: "Assign open handoffs",
        weight: 5,
      }),
      readinessCheck({
        id: "handoff.contact_details",
        title: "Contacts are reachable",
        detail:
          "At least 70% of known contacts should have an email or phone number for follow-up and callbacks.",
        status:
          input.contacts.length === 0 || contactCompletionRate >= 0.7
            ? "pass"
            : contactCompletionRate >= 0.4
              ? "warn"
              : "fail",
        actionLabel: "Complete contact profiles",
        weight: 5,
      }),
    ]),
    readinessSection("ai_quality", "AI quality and evaluation", [
      readinessCheck({
        id: "ai.knowledge_coverage",
        title: "Approved knowledge coverage",
        detail:
          "Production tenants should have enough approved FAQ and policy coverage before the assistant is exposed to live traffic.",
        status:
          approvedKnowledge >= 8
            ? "pass"
            : approvedKnowledge >= 3
              ? "warn"
              : "fail",
        actionLabel: "Add approved knowledge",
        weight: 5,
      }),
      readinessCheck({
        id: "ai.outcome_regression",
        title: "Answer outcome regression signal",
        detail:
          "Use tenant examples and live outcomes to keep refusal, handoff, and answer behavior stable before releases.",
        status:
          process.env.AI_EVAL_ENABLED === "true" || process.env.AI_EVAL_SET_PATH
            ? "pass"
            : outcomeTotal > 0 && unresolvedRate <= 0.25
              ? "warn"
              : "fail",
        actionLabel: "Add tenant evaluation set",
        weight: 5,
      }),
    ]),
    readinessSection("security_gdpr", "Security and GDPR", [
      readinessCheck({
        id: "security.credential_encryption",
        title: "Channel credential encryption",
        detail:
          "Production channel tokens need a configured master key or KMS-backed envelope encryption path.",
        status: credentialEncryptionConfigured
          ? "pass"
          : socialCredentialed
            ? "fail"
            : "warn",
        actionLabel: "Configure credential encryption",
        weight: 5,
      }),
      readinessCheck({
        id: "security.retention",
        title: "Retention window configured",
        detail:
          "Set tenant retention days before handling production personal data.",
        status:
          retentionDays && retentionDays >= 30 && retentionDays <= 730
            ? "pass"
            : retentionDays && retentionDays > 0
              ? "warn"
              : "fail",
        actionLabel: "Set retention policy",
        weight: 5,
      }),
    ]),
    readinessSection("reliability", "Reliability and replay", [
      readinessCheck({
        id: "reliability.redis_workers",
        title: "Worker queue configured",
        detail:
          "Redis-backed workers are required for retries, dead-letter inspection, embeddings, and retention cleanup.",
        status: process.env.REDIS_URL ? "pass" : "warn",
        actionLabel: "Configure worker Redis",
        weight: 4,
      }),
      readinessCheck({
        id: "reliability.retention_job",
        title: "Retention cleanup job enabled",
        detail:
          "Retention cleanup remains off until explicitly enabled because it deletes old conversation history.",
        status:
          process.env.RETENTION_CLEANUP_ENABLED === "true" ? "pass" : "warn",
        actionLabel: "Enable retention cleanup",
        weight: 3,
      }),
      readinessCheck({
        id: "reliability.delivery_failures",
        title: "Provider delivery failures reviewed",
        detail:
          "Recent delivery failures should be resolved or replayed before launch.",
        status: failedDeliveries.length === 0 ? "pass" : "fail",
        actionLabel: "Review delivery failures",
        weight: 3,
      }),
    ]),
    readinessSection("observability", "Observability and cost", [
      readinessCheck({
        id: "observability.metrics",
        title: "Metrics and request tracing",
        detail:
          "The API exposes Prometheus metrics and request IDs for production health checks.",
        status: "pass",
        actionLabel: "Review dashboards",
        weight: 3,
      }),
      readinessCheck({
        id: "observability.error_reporting",
        title: "Error reporting configured",
        detail:
          "Sentry or equivalent error reporting should be enabled before live customer traffic.",
        status: process.env.SENTRY_DSN ? "pass" : "warn",
        actionLabel: "Configure Sentry",
        weight: 3,
      }),
      readinessCheck({
        id: "observability.usage_metering",
        title: "Usage and outcome metering",
        detail:
          "Usage events should exist so cost, answer outcomes, and channel behavior can be monitored.",
        status: usageMetered ? "pass" : "warn",
        actionLabel: "Generate smoke traffic",
        weight: 4,
      }),
    ]),
    readinessSection("onboarding", "Onboarding and launch UX", [
      readinessCheck({
        id: "onboarding.widget_setup",
        title: "Widget and lead capture configured",
        detail:
          "The tenant should have a branded widget, consent copy, lead capture, and readiness flow before public launch.",
        status:
          theme.openingMessage && leadCaptureEnabled && readinessEnabled
            ? "pass"
            : theme.openingMessage
              ? "warn"
              : "fail",
        actionLabel: "Finish widget setup",
        weight: 6,
      }),
      readinessCheck({
        id: "onboarding.live_test",
        title: "Live conversation tested",
        detail:
          "Run at least one real website or channel conversation and confirm it appears in the inbox.",
        status: input.conversations.length > 0 ? "pass" : "warn",
        actionLabel: "Run live test",
        weight: 4,
      }),
    ]),
    readinessSection("commercial", "Commercial SaaS controls", [
      readinessCheck({
        id: "commercial.billing_limits",
        title: "Billing and plan limits",
        detail:
          "Usage metering exists, but production selling needs billing enforcement, plan limits, and overage handling.",
        status: billingConfigured ? "pass" : usageMetered ? "warn" : "fail",
        actionLabel: "Configure billing limits",
        weight: 5,
      }),
      readinessCheck({
        id: "commercial.team_access",
        title: "Customer team access",
        detail:
          "A tenant owner or admin user should exist so the customer can operate the workspace without a bootstrap token.",
        status: hasTenantTeam ? "pass" : "warn",
        actionLabel: "Invite tenant users",
        weight: 5,
      }),
    ]),
  ];

  const checks = sections.flatMap((section) => section.checks);
  const totalWeight = checks.reduce((total, check) => total + check.weight, 0);
  const earned = checks.reduce((total, check) => total + check.score, 0);
  const score = totalWeight ? Math.round((earned / totalWeight) * 100) : 0;
  const failed = checks.filter((check) => check.status === "fail");
  const warnings = checks.filter((check) => check.status === "warn");
  const actionable = [...failed, ...warnings].sort(
    (a, b) => b.weight - a.weight,
  );

  return {
    generatedAt: new Date().toISOString(),
    score,
    status:
      score >= 85 && failed.length === 0
        ? "ready_for_beta"
        : score >= 65
          ? "needs_work"
          : "not_ready",
    summary: {
      passed: checks.filter((check) => check.status === "pass").length,
      warnings: warnings.length,
      failed: failed.length,
      blockers: failed.sort((a, b) => b.weight - a.weight).slice(0, 5),
      nextActions: actionable.slice(0, 6),
    },
    sections,
  };
}

function readinessSection(
  id: string,
  title: string,
  checks: ProductionReadinessCheck[],
): ProductionReadinessSection {
  const totalWeight = checks.reduce((total, check) => total + check.weight, 0);
  const score = checks.reduce((total, check) => total + check.score, 0);
  return {
    id,
    title,
    score: totalWeight ? Math.round((score / totalWeight) * 100) : 0,
    checks,
  };
}

function readinessCheck(input: {
  id: string;
  title: string;
  detail: string;
  status: ProductionReadinessStatus;
  actionLabel: string;
  weight: number;
}): ProductionReadinessCheck {
  return {
    ...input,
    score:
      input.status === "pass"
        ? input.weight
        : input.status === "warn"
          ? input.weight / 2
          : 0,
  };
}

function channelReady(connection: Record<string, unknown> | undefined) {
  return connection?.status === "connected";
}

function credentialReady(connection: Record<string, unknown> | undefined) {
  return Boolean(connection?.credentialConfigured);
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function usageTotal(usageByStatus: unknown[], eventTypes: string[]): number {
  const wanted = new Set(eventTypes);
  return usageByStatus.reduce<number>((total, item) => {
    const record = asRecord(item);
    if (!wanted.has(String(record.eventType))) {
      return total;
    }
    return total + (numberValue(record.total) ?? 0);
  }, 0);
}

async function notifyLead(
  options: BuildServerOptions,
  payload: LeadNotificationPayload,
) {
  const results: Array<Record<string, unknown>> = [];
  const notificationPayload: LeadNotificationPayload = {
    ...payload,
    adminUrl: buildLeadAdminUrl(payload, options.adminPublicUrl),
  };

  if (!options.leadNotificationWebhookUrl && !options.leadNotificationEmailTo) {
    return { sent: false, reason: "not_configured" };
  }

  if (options.leadNotificationWebhookUrl) {
    try {
      const response = await fetch(options.leadNotificationWebhookUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          ...notificationPayload,
          notifyTo: options.leadNotificationEmailTo,
          sentAt: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(8_000),
      });

      results.push({
        channel: "webhook",
        sent: response.ok,
        status: response.status,
      });
    } catch (error) {
      results.push({
        channel: "webhook",
        sent: false,
        reason: error instanceof Error ? error.message : "notification_failed",
      });
    }
  }

  if (options.leadNotificationEmailTo) {
    try {
      const from =
        options.leadNotificationSmtp?.from ??
        options.adminUser?.email ??
        "owner@assad-dar.de";
      const email = buildLeadNotificationEmail(
        notificationPayload,
        options.leadNotificationEmailTo,
        from,
      );

      if (options.leadNotificationEmailSender) {
        await options.leadNotificationEmailSender(email);
      } else if (options.leadNotificationSmtp) {
        await sendSmtpEmail(options.leadNotificationSmtp, email);
      } else {
        results.push({
          channel: "email",
          sent: false,
          reason: "smtp_not_configured",
        });
      }

      if (options.leadNotificationEmailSender || options.leadNotificationSmtp) {
        results.push({ channel: "email", sent: true });
      }
    } catch (error) {
      results.push({
        channel: "email",
        sent: false,
        reason: error instanceof Error ? error.message : "email_failed",
      });
    }
  }

  return {
    sent: results.some((result) => result.sent === true),
    results,
  };
}

async function notifyVisitorConfirmation(
  options: BuildServerOptions,
  payload: {
    tenantName: string;
    type: "lead_capture" | "readiness_assessment";
    fields: Record<string, string>;
    pageUrl?: string;
    score?: number;
    bookingUrl?: string;
  },
) {
  const visitorEmail = findEmail(payload.fields);
  if (!visitorEmail) {
    return { sent: false, reason: "visitor_email_missing" };
  }

  const from =
    options.leadNotificationSmtp?.from ??
    options.adminUser?.email ??
    "owner@assad-dar.de";
  return sendNotificationEmail(
    options,
    buildVisitorConfirmationEmail(payload, visitorEmail, from),
  );
}

async function sendNotificationEmail(
  options: BuildServerOptions,
  email: LeadNotificationEmail,
) {
  if (options.leadNotificationEmailSender) {
    await options.leadNotificationEmailSender(email);
    return { sent: true, channel: "email" };
  }

  if (options.leadNotificationSmtp) {
    await sendSmtpEmail(options.leadNotificationSmtp, email);
    return { sent: true, channel: "email" };
  }

  return { sent: false, reason: "smtp_not_configured" };
}

function buildLeadNotificationEmail(
  payload: LeadNotificationPayload,
  to: string,
  from: string,
): LeadNotificationEmail {
  const typeLabel =
    payload.type === "readiness_assessment"
      ? "AI readiness lead"
      : "Website lead";
  const subjectParts = [typeLabel, payload.tenantName];
  if (payload.score) {
    subjectParts.push(`${payload.score}/100`);
  }

  return {
    to,
    from,
    subject: subjectParts.join(" - "),
    text: [
      `${typeLabel} captured for ${payload.tenantName}`,
      "",
      `Conversation: ${payload.conversationId}`,
      payload.adminUrl ? `Open in admin: ${payload.adminUrl}` : "",
      payload.score ? `Readiness score: ${payload.score}/100` : "",
      payload.pageUrl ? `Page: ${payload.pageUrl}` : "",
      "",
      "Details:",
      ...Object.entries(payload.fields)
        .filter(([, value]) => value.trim())
        .map(([key, value]) => `${titleCase(key)}: ${value.trim()}`),
      "",
      "Raw message:",
      payload.message,
    ]
      .filter((line) => line !== "")
      .join("\n"),
  };
}

function buildVisitorConfirmationEmail(
  payload: {
    tenantName: string;
    type: "lead_capture" | "readiness_assessment";
    fields: Record<string, string>;
    pageUrl?: string;
    score?: number;
    bookingUrl?: string;
  },
  to: string,
  from: string,
): LeadNotificationEmail {
  const typeLabel =
    payload.type === "readiness_assessment"
      ? "AI readiness check"
      : "AI consultation request";
  const firstName =
    payload.fields.name?.trim().split(/\s+/)[0] ||
    payload.fields.Name?.trim().split(/\s+/)[0] ||
    "there";

  return {
    to,
    from,
    subject: `${typeLabel} received - ${payload.tenantName}`,
    text: [
      `Hi ${firstName},`,
      "",
      `Thanks for contacting ${payload.tenantName}. Your request was received and the team can follow up with the context you shared.`,
      payload.score ? `AI readiness score: ${payload.score}/100` : "",
      payload.bookingUrl ? `Book a time directly: ${payload.bookingUrl}` : "",
      payload.pageUrl ? `Page: ${payload.pageUrl}` : "",
      "",
      "Shared details:",
      ...Object.entries(payload.fields)
        .filter(([, value]) => value.trim())
        .map(([key, value]) => `${titleCase(key)}: ${value.trim()}`),
      "",
      "Best regards",
      payload.tenantName,
    ]
      .filter((line) => line !== "")
      .join("\n"),
  };
}

function buildLeadAdminUrl(
  payload: LeadNotificationPayload,
  adminPublicUrl = defaultAdminPublicUrl,
) {
  const url = new URL(adminPublicUrl);
  url.searchParams.set("tenantId", payload.tenantId);
  url.searchParams.set("tab", "leads");
  if (payload.handoffId) {
    url.searchParams.set("handoffId", payload.handoffId);
  }
  if (payload.conversationId) {
    url.searchParams.set("conversationId", payload.conversationId);
  }
  return url.toString();
}

function buildWeeklyReportEmail(
  tenant: StoreTenant,
  analytics: unknown,
  handoffs: unknown[],
  to: string,
  from: string,
  automation: AutomationSettings,
): LeadNotificationEmail {
  const analyticsRecord =
    analytics && typeof analytics === "object"
      ? (analytics as Record<string, unknown>)
      : {};
  const leadHandoffs = handoffs.filter((handoff) =>
    isLeadHandoff(asRecord(handoff)),
  );
  const openLeads = leadHandoffs.filter(
    (handoff) => asRecord(handoff).status === "open",
  );
  const qualifiedLeads = leadHandoffs.filter(
    (handoff) => getHandoffPipelineStage(handoff) === "qualified",
  );
  const unanswered = buildUnansweredQueue(handoffs).slice(0, 5);
  const staleLeads = openLeads.filter((handoff) =>
    isOlderThanDays(
      asRecord(handoff).createdAt,
      automation.staleLeadReminderDays,
    ),
  );

  return {
    to,
    from,
    subject: `Weekly AI assistant report - ${tenant.name}`,
    text: [
      `Weekly report for ${tenant.name}`,
      "",
      `Conversations: ${analyticsRecord.conversations ?? 0}`,
      `Messages: ${analyticsRecord.messages ?? 0}`,
      `Total leads: ${leadHandoffs.length}`,
      `Open leads: ${openLeads.length}`,
      `Qualified leads: ${qualifiedLeads.length}`,
      `Stale follow-ups: ${staleLeads.length}`,
      `Unanswered questions: ${unanswered.length}`,
      "",
      "Top follow-ups:",
      ...(openLeads.length
        ? openLeads.slice(0, 5).map((handoff, index) => {
            const record = asRecord(handoff);
            return `${index + 1}. ${String(record.reason ?? "lead")} - ${String(record.requesterMessage ?? record.message ?? "").slice(0, 220)}`;
          })
        : ["None"]),
      "",
      "Knowledge gaps:",
      ...(unanswered.length
        ? unanswered.map((item, index) => `${index + 1}. ${item.question}`)
        : ["None"]),
    ].join("\n"),
  };
}

function getAutomationSettings(
  theme?: WidgetThemeInput | null,
): AutomationSettings {
  const automation = theme?.automation;
  return {
    ownerLeadEmailEnabled:
      automation?.ownerLeadEmailEnabled ??
      defaultAutomationSettings.ownerLeadEmailEnabled,
    visitorConfirmationEmailEnabled:
      automation?.visitorConfirmationEmailEnabled ??
      defaultAutomationSettings.visitorConfirmationEmailEnabled,
    autoQualifyReadinessEnabled:
      automation?.autoQualifyReadinessEnabled ??
      defaultAutomationSettings.autoQualifyReadinessEnabled,
    autoQualifyLeadDetailsEnabled:
      automation?.autoQualifyLeadDetailsEnabled ??
      defaultAutomationSettings.autoQualifyLeadDetailsEnabled,
    weeklySummaryEmailEnabled:
      automation?.weeklySummaryEmailEnabled ??
      defaultAutomationSettings.weeklySummaryEmailEnabled,
    staleLeadReminderDays:
      automation?.staleLeadReminderDays ??
      defaultAutomationSettings.staleLeadReminderDays,
    readinessQualificationScore:
      automation?.readinessQualificationScore ??
      defaultAutomationSettings.readinessQualificationScore,
  };
}

function getBookingUrl(theme?: WidgetThemeInput | null) {
  return theme?.bookingUrl ?? theme?.ctaUrl;
}

function shouldAutoQualifyLeadDetails(
  fields: Record<string, string>,
  automation: AutomationSettings,
) {
  if (!automation.autoQualifyLeadDetailsEnabled) {
    return false;
  }

  const normalized = normalizeFieldMap(fields);
  const hasEmail = Boolean(normalized.email);
  const hasCompany = Boolean(normalized.company);
  const hasBudget = Boolean(normalized.budget);
  const hasProject =
    Boolean(normalized.projecttype) ||
    Boolean(normalized.project) ||
    Boolean(normalized.message);

  return hasEmail && hasCompany && (hasBudget || hasProject);
}

function normalizeFieldMap(fields: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key.toLowerCase().replace(/[^a-z0-9]/g, ""),
      value.trim(),
    ]),
  );
}

function contactProfileFromFields(
  fields: Record<string, string>,
  metadata: Record<string, unknown>,
): ContactProfileInput {
  const normalized = normalizeFieldMap(fields);
  const email = findEmail(fields);
  const phone =
    normalized.phone ??
    Object.values(fields)
      .map((value) => value.match(/(?:\+?\d[\d\s().-]{5,}\d)/)?.[0])
      .find(Boolean);
  const name =
    normalized.name ??
    normalized.fullname ??
    normalized.contact ??
    normalized.contactperson;

  return {
    displayName: name || normalized.company || email || phone || null,
    email: email ?? null,
    phone: phone ?? null,
    company: normalized.company || null,
    metadata: {
      ...metadata,
      rawFields: fields,
      projectType: normalized.projecttype || normalized.project || null,
      budget: normalized.budget || null,
      timeline: normalized.timeline || null,
      contactPreference: normalized.contactpreference || null,
    },
  };
}

function findEmail(fields: Record<string, string>) {
  const emailField = Object.entries(fields).find(
    ([key, value]) => key.toLowerCase().includes("email") && value.trim(),
  )?.[1];
  const candidate =
    emailField ??
    Object.values(fields).find((value) =>
      /[^\s@]+@[^\s@]+\.[^\s@]+/.test(value),
    );

  return candidate?.match(/[^\s@]+@[^\s@]+\.[^\s@]+/)?.[0];
}

function buildWorkflowSuggestions(input: {
  analytics: unknown;
  handoffs: unknown[];
  contacts: unknown[];
  templates: unknown[];
  compliance: unknown;
}) {
  const analytics = asRecord(input.analytics);
  const compliance = asRecord(input.compliance);
  const templateStats = asRecord(compliance.templates);
  const openHandoffs = input.handoffs.filter(
    (handoff) => asRecord(handoff).status === "open",
  );
  const inProgressHandoffs = input.handoffs.filter(
    (handoff) => asRecord(handoff).status === "in_progress",
  );
  const contactsMissingDetails = input.contacts.filter((contact) => {
    const record = asRecord(contact);
    return !record.email && !record.phone;
  });
  const suggestions = [
    openHandoffs.length
      ? {
          id: "handoff_assignment",
          priority: "high",
          category: "handoff",
          title: "Assign open handoffs",
          detail: `${openHandoffs.length} customer request${openHandoffs.length === 1 ? "" : "s"} need an owner.`,
          actionLabel: "Open leads",
        }
      : null,
    inProgressHandoffs.length
      ? {
          id: "handoff_resolution",
          priority: "medium",
          category: "handoff",
          title: "Close in-progress conversations",
          detail: `${inProgressHandoffs.length} handoff${inProgressHandoffs.length === 1 ? "" : "s"} are being worked but not resolved.`,
          actionLabel: "Review queue",
        }
      : null,
    Number(templateStats.approved ?? 0) === 0
      ? {
          id: "whatsapp_template",
          priority: "high",
          category: "whatsapp",
          title: "Create a WhatsApp re-open template",
          detail:
            "You need at least one approved utility template before replying outside the 24-hour customer service window.",
          actionLabel: "Add template",
        }
      : null,
    compliance.canUseFreeformReply === false &&
    Number(templateStats.approved ?? 0) > 0
      ? {
          id: "whatsapp_window",
          priority: "medium",
          category: "whatsapp",
          title: "Use a template for the next WhatsApp reply",
          detail:
            "The last inbound WhatsApp message is outside the freeform response window.",
          actionLabel: "Use template",
        }
      : null,
    contactsMissingDetails.length
      ? {
          id: "contact_completion",
          priority: "medium",
          category: "contacts",
          title: "Complete customer contact details",
          detail: `${contactsMissingDetails.length} contact${contactsMissingDetails.length === 1 ? "" : "s"} have no email or phone number.`,
          actionLabel: "Open inbox",
        }
      : null,
    Number(analytics.openHandoffs ?? 0) === 0 &&
    Number(analytics.contacts ?? 0) > 0
      ? {
          id: "proactive_followup",
          priority: "low",
          category: "automation",
          title: "Prepare proactive follow-up campaigns",
          detail:
            "There are contacts but no open handoffs. Segment them by lead source and follow up with consent-aware templates.",
          actionLabel: "Plan campaign",
        }
      : null,
  ].filter(Boolean);

  return {
    generatedAt: new Date().toISOString(),
    suggestions,
    counts: {
      suggestions: suggestions.length,
      openHandoffs: openHandoffs.length,
      contacts: input.contacts.length,
      whatsappTemplates: input.templates.length,
    },
  };
}

async function buildWorkspaceSummary(store: PlatformStore, tenantId: string) {
  const [
    analytics,
    handoffs,
    contacts,
    recentConversations,
    connections,
    templates,
    compliance,
  ] = await Promise.all([
    store.getTenantAnalytics(tenantId),
    store.listHandoffs(tenantId),
    store.listContacts(tenantId),
    store.listConversations(tenantId, { limit: 4 }),
    store.listChannelConnections(tenantId),
    store.listWhatsappTemplates(tenantId),
    store.getWhatsappCompliance(tenantId),
  ]);
  const unanswered = buildUnansweredQueue(handoffs);
  const workflowSuggestions = buildWorkflowSuggestions({
    analytics,
    handoffs,
    contacts,
    templates,
    compliance,
  });

  return {
    analytics,
    handoffs,
    contacts,
    recentConversations,
    channelConnections: connections,
    whatsapp: {
      templates,
      compliance,
    },
    unanswered,
    workflowSuggestions,
  };
}

function isLeadHandoff(handoff: Record<string, unknown>) {
  return (
    handoff.reason === "lead_capture" ||
    handoff.reason === "readiness_assessment"
  );
}

function getHandoffPipelineStage(handoff: unknown) {
  const metadata = asRecord(asRecord(handoff).metadata);
  return typeof metadata.pipelineStage === "string"
    ? metadata.pipelineStage
    : "new";
}

function isOlderThanDays(value: unknown, days: number) {
  if (!value) {
    return false;
  }
  const timestamp =
    value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  if (!Number.isFinite(timestamp)) {
    return false;
  }
  return Date.now() - timestamp >= days * 24 * 60 * 60 * 1000;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

const secretLikeKeyPattern =
  /token|secret|password|api[_-]?key|apikey|authorization|credential|private[_-]?key/i;

function redactSecretSettings(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (secretLikeKeyPattern.test(key)) {
      output[key] = "[redacted]";
    } else if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      output[key] = redactSecretSettings(entry);
    } else if (Array.isArray(entry)) {
      output[key] = entry.map((item) =>
        item && typeof item === "object" && !Array.isArray(item)
          ? redactSecretSettings(item)
          : item,
      );
    } else {
      output[key] = entry;
    }
  }
  return output;
}

function getStringProperty(value: unknown, key: string) {
  const record = asRecord(value);
  return typeof record[key] === "string" ? record[key] : undefined;
}

function getDateProperty(value: unknown, key: string) {
  const raw = asRecord(value)[key];
  if (raw instanceof Date) {
    return raw;
  }
  if (typeof raw === "string" || typeof raw === "number") {
    const date = new Date(raw);
    return Number.isFinite(date.getTime()) ? date : undefined;
  }
  return undefined;
}

function evaluateAutomatedReplyPolicy(input: {
  channel: Channel;
  provider: string;
  lastInboundAt: Date;
  now?: Date;
}): { allowed: boolean; reason?: string } {
  if (!["whatsapp", "messenger", "instagram"].includes(input.channel)) {
    return { allowed: true };
  }

  const now = input.now ?? new Date();
  const ageMs = now.getTime() - input.lastInboundAt.getTime();
  if (ageMs <= 24 * 60 * 60 * 1000) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `${input.channel} freeform replies are blocked outside the 24-hour customer-service window.`,
  };
}

/**
 * Read an optional `Idempotency-Key` request header used to dedupe retried lead
 * / readiness submissions. Returns a trimmed, bounded key, or undefined when
 * absent. Bounding the length keeps a hostile header from bloating the index.
 */
function getIdempotencyKey(
  headers: Record<string, string | string[] | undefined>,
): string | undefined {
  const raw = headers["idempotency-key"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 200) : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

async function sendSmtpEmail(
  smtp: NonNullable<BuildServerOptions["leadNotificationSmtp"]>,
  email: LeadNotificationEmail,
) {
  const socket = smtp.secure
    ? tls.connect({
        host: smtp.host,
        port: smtp.port,
        servername: smtp.host,
      })
    : net.createConnection({
        host: smtp.host,
        port: smtp.port,
      });

  socket.setTimeout(12_000);

  let buffer = "";
  const waiters: Array<{
    resolve: (response: { code: number; text: string }) => void;
    reject: (error: Error) => void;
  }> = [];

  function takeResponse() {
    const lines = buffer.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (/^\d{3} /.test(line ?? "")) {
        const responseLines = lines.slice(0, index + 1);
        buffer = lines.slice(index + 1).join("\r\n");
        return {
          code: Number(line?.slice(0, 3)),
          text: responseLines.join("\n"),
        };
      }
    }
    return null;
  }

  function flushWaiters() {
    let response = takeResponse();
    while (response && waiters.length) {
      const waiter = waiters.shift();
      waiter?.resolve(response);
      response = takeResponse();
    }
  }

  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    flushWaiters();
  });

  const socketReady = new Promise<void>((resolve, reject) => {
    socket.once(smtp.secure ? "secureConnect" : "connect", () => resolve());
    socket.once("error", reject);
    socket.once("timeout", () =>
      reject(new Error("SMTP connection timed out.")),
    );
  });

  function readResponse() {
    const response = takeResponse();
    if (response) {
      return Promise.resolve(response);
    }
    return new Promise<{ code: number; text: string }>((resolve, reject) => {
      waiters.push({ resolve, reject });
    });
  }

  async function command(line: string, expected: number[]) {
    socket.write(`${line}\r\n`);
    const response = await readResponse();
    if (!expected.includes(response.code)) {
      throw new Error(`SMTP ${response.code}: ${response.text}`);
    }
    return response;
  }

  await socketReady;
  const greeting = await readResponse();
  if (greeting.code !== 220) {
    throw new Error(`SMTP ${greeting.code}: ${greeting.text}`);
  }

  await command("EHLO assaddar-ai", [250]);
  if (smtp.username && smtp.password) {
    await command("AUTH LOGIN", [334]);
    await command(Buffer.from(smtp.username).toString("base64"), [334]);
    await command(Buffer.from(smtp.password).toString("base64"), [235]);
  }
  await command(`MAIL FROM:<${email.from}>`, [250]);
  await command(`RCPT TO:<${email.to}>`, [250, 251]);
  await command("DATA", [354]);
  socket.write(formatSmtpMessage(email));
  const accepted = await readResponse();
  if (accepted.code !== 250) {
    throw new Error(`SMTP ${accepted.code}: ${accepted.text}`);
  }
  await command("QUIT", [221]);
  socket.end();
}

function formatSmtpMessage(email: LeadNotificationEmail) {
  const body = email.text.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
  return [
    `From: ${email.from}`,
    `To: ${email.to}`,
    `Subject: ${escapeMailHeader(email.subject)}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    body,
    ".",
    "",
  ].join("\r\n");
}

function escapeMailHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").slice(0, 160);
}

function buildWebsiteImport(html: string, sourceUrl: string, maxFaqs: number) {
  const title = extractTitle(html) || new URL(sourceUrl).hostname;
  const description = extractMetaDescription(html);
  const text = htmlToReadableText(html);
  const language = detectLanguage(text);
  const snippets = extractReadableSnippets(text);
  const services = snippets
    .filter((snippet) =>
      /(ki|ai|beratung|consult|automation|automatis|prozess|service|leistung|workshop|strategie|strategy)/i.test(
        snippet,
      ),
    )
    .slice(0, 3);
  const contact = snippets.find((snippet) =>
    /(kontakt|contact|termin|call|email|mail|beratungsgespräch|consultation)/i.test(
      snippet,
    ),
  );
  const privacy = snippets.find((snippet) =>
    /(dsgvo|gdpr|privacy|datenschutz|daten)/i.test(snippet),
  );
  const overview = [description, ...snippets.slice(0, 2)]
    .filter(Boolean)
    .join(" ")
    .slice(0, 950);

  const faqs = [
    {
      question:
        language === "de"
          ? `Was bietet ${title}?`
          : `What does ${title} offer?`,
      answer:
        overview ||
        `${title} presents its business information on ${sourceUrl}.`,
      tags: ["website", "company"],
    },
    {
      question:
        language === "de"
          ? "Welche KI- und Automatisierungsleistungen werden angeboten?"
          : "Which AI and automation services are offered?",
      answer:
        services.join(" ") ||
        "The website should be reviewed and expanded with the approved AI consultancy services before launch.",
      tags: ["website", "services"],
    },
    {
      question:
        language === "de"
          ? "Wie kann ein Beratungsgespräch angefragt werden?"
          : "How can someone request a consultation?",
      answer:
        contact ||
        `Visitors can use the contact options on ${sourceUrl} to request a consultation.`,
      tags: ["website", "lead-capture"],
    },
    {
      question:
        language === "de"
          ? "Wie wird mit Datenschutz und Unternehmensdaten umgegangen?"
          : "How are privacy and business data handled?",
      answer:
        privacy ||
        "Only approved business information should be used by the assistant. Privacy, GDPR, and data handling details should be confirmed before publishing.",
      tags: ["website", "privacy"],
    },
  ];

  const uniqueFaqs = faqs
    .filter((faq) => faq.answer.trim().length > 24)
    .filter(
      (faq, index, all) =>
        all.findIndex((item) => item.question === faq.question) === index,
    )
    .slice(0, maxFaqs);

  return {
    title,
    detectedLanguage: language,
    summary: overview,
    suggestedFaqs: uniqueFaqs,
  };
}

function inspectWidgetInstall(
  html: string,
  assistantId: string,
  widgetUrl?: string,
) {
  const lowerHtml = html.toLowerCase();
  const hasAssistantId = html.includes(assistantId);
  const hasDataAttribute = new RegExp(
    `data-assistant-id=["']${escapeRegExp(assistantId)}["']`,
  ).test(html);
  const hasWidgetUrl = widgetUrl ? html.includes(widgetUrl) : false;
  const hasWidgetScript =
    hasWidgetUrl ||
    /assaddar[^<>"']*widget|widget-production[^<>"']*widget|\/widget\.js/i.test(
      html,
    );
  const hasApiUrl =
    lowerHtml.includes("data-api-url") ||
    lowerHtml.includes("assaddar-api-production");
  const evidence = [
    hasDataAttribute ? "assistant id data attribute found" : "",
    hasWidgetScript ? "widget script found" : "",
    hasApiUrl ? "api url found" : "",
  ].filter(Boolean);

  return {
    installed: hasAssistantId && hasWidgetScript,
    hasAssistantId,
    hasWidgetScript,
    hasApiUrl,
    evidence,
  };
}

function formatLeadCaptureMessage(
  fields: Record<string, string>,
  pageUrl?: string,
) {
  const labelMap: Record<string, string> = {
    name: "Name",
    email: "Email",
    phone: "Phone",
    company: "Company",
    projectType: "Project type",
    budget: "Budget",
    timeline: "Timeline",
    contactPreference: "Contact preference",
    message: "Message",
  };
  const lines = Object.entries(fields)
    .filter(([, value]) => value.trim())
    .map(
      ([key, value]) => `${labelMap[key] ?? titleCase(key)}: ${value.trim()}`,
    );

  if (pageUrl) {
    lines.push(`Page: ${pageUrl}`);
  }

  return `Lead captured\n${lines.join("\n")}`;
}

function formatReadinessMessage(
  answers: Record<string, string>,
  score: number,
  pageUrl?: string,
) {
  const labelMap: Record<string, string> = {
    goal: "Goal",
    processPain: "Process pain",
    dataReadiness: "Data readiness",
    systems: "Systems",
    timeline: "Timeline",
    budget: "Budget",
    contact: "Contact",
  };
  const lines = Object.entries(answers)
    .filter(([, value]) => value.trim())
    .map(
      ([key, value]) => `${labelMap[key] ?? titleCase(key)}: ${value.trim()}`,
    );

  lines.unshift(`Readiness score: ${score}/100`);
  if (pageUrl) {
    lines.push(`Page: ${pageUrl}`);
  }

  return `AI readiness assessment\n${lines.join("\n")}`;
}

function scoreReadiness(answers: Record<string, string>) {
  const text = Object.values(answers).join(" ").toLowerCase();
  let score = 30;
  if (answers.goal?.trim()) {
    score += 12;
  }
  if (answers.processPain?.trim()) {
    score += 12;
  }
  if (answers.systems?.trim()) {
    score += 10;
  }
  if (answers.timeline?.trim()) {
    score += 10;
  }
  if (answers.budget?.trim()) {
    score += 10;
  }
  if (
    /(crm|erp|sap|hubspot|salesforce|excel|database|api|datenbank)/.test(text)
  ) {
    score += 8;
  }
  if (
    /(manual|manuell|repetitive|wiederkehrend|email|e-mail|dokument)/.test(text)
  ) {
    score += 8;
  }

  return Math.min(100, score);
}

function readinessRecommendation(score: number) {
  if (score >= 76) {
    return "High readiness: qualify for a concrete automation use-case workshop.";
  }
  if (score >= 55) {
    return "Medium readiness: start with process and data discovery.";
  }
  return "Early readiness: clarify goals, systems, data access, and business owner first.";
}

function extractTitle(html: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return cleanText(title ?? "").slice(0, 140);
}

function extractMetaDescription(html: string) {
  const match =
    html.match(
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    ) ??
    html.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["'][^>]*>/i,
    );
  return cleanText(match?.[1] ?? "").slice(0, 500);
}

function htmlToReadableText(html: string) {
  return cleanText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|section|article|li|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  );
}

function extractReadableSnippets(text: string) {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map(cleanText)
    .filter((sentence) => sentence.length >= 45 && sentence.length <= 420)
    .filter(
      (sentence, index, all) =>
        all.findIndex(
          (item) => item.toLowerCase() === sentence.toLowerCase(),
        ) === index,
    )
    .slice(0, 16);
}

function detectLanguage(text: string) {
  const lower = text.toLowerCase();
  const germanMatches = (
    lower.match(
      /\b(und|der|die|das|beratung|kontakt|leistungen|daten|für)\b/g,
    ) ?? []
  ).length;
  const englishMatches = (
    lower.match(/\b(and|the|consulting|contact|services|data|for)\b/g) ?? []
  ).length;
  return germanMatches > englishMatches ? "de" : "en";
}

function cleanText(value: string) {
  return decodeHtmlEntities(value)
    .replace(/\s+/g, " ")
    .replace(/\s+([.,!?;:])/g, "$1")
    .trim();
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function titleCase(value: string) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}
