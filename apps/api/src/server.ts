import {
  MetaMessengerAdapter,
  type NormalizedInboundEvent,
  WhatsAppCloudAdapter,
  WebsiteAdapter,
  type ChannelAdapter,
} from "@assaddar/channels";
import {
  createAnswerEngine,
  InboundMessageSchema,
  type AnswerDataStore,
  type Channel,
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
import net from "node:net";
import tls from "node:tls";
import { promisify } from "node:util";
import { z } from "zod";
import { openApiDocument } from "./openapi";
import { AppError } from "./errors";
import {
  ParamsTenantSchema,
  ParamsKnowledgeSchema,
  ParamsConversationSchema,
  ParamsHandoffSchema,
  ParamsAssistantSchema,
  ParamsMetaChannelSchema,
  ParamsChannelSchema,
  CreateTenantSchema,
  UpdateTenantSchema,
  AddFaqSchema,
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
  type UpdateHandoffInput,
  type ChannelConnectionInput,
  type WhatsappTemplateInput,
  type WidgetThemeInput,
  type RoleName,
} from "./schemas";

const scryptAsync = promisify(scrypt);

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
  defaultLocale: string;
  theme?: WidgetThemeInput | null;
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

export type PlatformStore = AnswerDataStore &
  HandoffStore & {
    createTenant(input: CreateTenantInput): Promise<unknown>;
    updateTenant(tenantId: string, input: UpdateTenantInput): Promise<unknown>;
    listTenants(): Promise<unknown[]>;
    listTenantsForUser(userId: string): Promise<unknown[]>;
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
    deleteUserSession(tokenHash: string): Promise<void>;
    deleteExpiredSessions(now?: Date): Promise<number>;
    ping(): Promise<boolean>;
    getTenantMembership(
      userId: string,
      tenantId: string,
    ): Promise<StoreTenantMembership | null>;
    listTenantUsers(tenantId: string): Promise<unknown[]>;
    upsertTenantUser(
      tenantId: string,
      input: {
        email: string;
        name: string;
        role: RoleName;
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
    listKnowledge(tenantId: string): Promise<unknown[]>;
    listConversations(tenantId: string): Promise<unknown[]>;
    listUnifiedInbox(tenantId: string): Promise<unknown[]>;
    listContacts(tenantId: string): Promise<unknown[]>;
    listChannelConnections(tenantId: string): Promise<unknown[]>;
    upsertChannelConnection(
      tenantId: string,
      input: ChannelConnectionInput,
    ): Promise<unknown>;
    getTenantByChannelConnection(
      channel: Channel,
      provider: string,
      externalAccountId: string,
    ): Promise<StoreTenant | null>;
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
    listHandoffs(tenantId: string): Promise<unknown[]>;
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
  metaGraphApiVersion?: string;
  whatsappAccessToken?: string;
  messengerPageAccessToken?: string;
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  /**
   * Optional query embedder. When supplied, the answer engine runs hybrid
   * keyword + semantic retrieval. Omitted in keyword-only mode.
   */
  embedder?: (text: string) => Promise<number[] | null>;
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

export async function buildServer(
  options: BuildServerOptions,
): Promise<FastifyInstance> {
  const app = Fastify({
    // Honour an inbound correlation id (e.g. from a gateway/load balancer) so
    // logs can be traced across services; otherwise Fastify generates one.
    requestIdHeader: "x-request-id",
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

  // Surface the correlation id on responses so clients/operators can quote it.
  app.addHook("onSend", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  const allowedOrigins = options.allowedOrigins ?? [];
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

  app.patch(
    "/admin/tenants/:tenantId",
    { preHandler: requireTenantAccess(options) },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const body = UpdateTenantSchema.parse(request.body);
      return options.store.updateTenant(tenantId, body);
    },
  );

  app.get(
    "/admin/tenants/:tenantId/users",
    { preHandler: requireTenantAccess(options) },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      return options.store.listTenantUsers(tenantId);
    },
  );

  app.post(
    "/admin/tenants/:tenantId/users",
    { preHandler: requireTenantAccess(options, "tenant_admin") },
    async (request, reply) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const body = CreateTenantUserSchema.parse(request.body);
      const user = await options.store.upsertTenantUser(tenantId, {
        email: body.email,
        name: body.name,
        role: body.role,
        ...(body.password
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
    { preHandler: requireTenantAccess(options) },
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
    { preHandler: requireTenantAccess(options) },
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
    { preHandler: requireTenantAccess(options) },
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
    { preHandler: requireTenantAccess(options) },
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
    { preHandler: requireTenantAccess(options) },
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
    { preHandler: requireTenantAccess(options) },
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
    { preHandler: requireTenantAccess(options) },
    async (request, reply) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const tenant = await options.store.getTenant(tenantId);
      if (!tenant) {
        return reply.code(404).send({ error: "Tenant not found." });
      }
      const body = NewTelephoneNumberSetupSchema.parse(request.body);
      const voiceBridgeUrl = buildTelephoneVoiceBridgeUrl(options, tenant);
      const sipTarget = buildTelephoneSipTarget(tenant);
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
    { preHandler: requireTenantAccess(options) },
    async (request, reply) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const tenant = await options.store.getTenant(tenantId);
      if (!tenant) {
        return reply.code(404).send({ error: "Tenant not found." });
      }
      const body = CarrierForwardingSchema.parse(request.body);
      const voiceBridgeUrl = buildTelephoneVoiceBridgeUrl(options, tenant);
      const sipTarget = buildTelephoneSipTarget(tenant);
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
    { preHandler: requireTenantAccess(options) },
    async (request, reply) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const tenant = await options.store.getTenant(tenantId);
      if (!tenant) {
        return reply.code(404).send({ error: "Tenant not found." });
      }
      const body = SipByocSetupSchema.parse(request.body);
      const voiceBridgeUrl = buildTelephoneVoiceBridgeUrl(options, tenant);
      const sipTarget = buildTelephoneSipTarget(tenant);
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
    { preHandler: requireTenantAccess(options) },
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
    { preHandler: requireTenantAccess(options) },
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
    { preHandler: requireTenantAccess(options) },
    async (request, reply) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const body = AddFaqSchema.parse(request.body);
      const result = await options.store.addFaq(tenantId, body);
      return reply.code(201).send(result);
    },
  );

  app.get(
    "/admin/tenants/:tenantId/knowledge",
    { preHandler: requireTenantAccess(options) },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      return options.store.listKnowledge(tenantId);
    },
  );

  app.post(
    "/admin/tenants/:tenantId/knowledge/import-website",
    { preHandler: requireTenantAccess(options) },
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
    { preHandler: requireTenantAccess(options) },
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
    { preHandler: requireTenantAccess(options) },
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
    { preHandler: requireTenantAccess(options) },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      return options.store.getTenantAnalytics(tenantId);
    },
  );

  app.get(
    "/admin/tenants/:tenantId/conversations",
    { preHandler: requireTenantAccess(options) },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      return options.store.listConversations(tenantId);
    },
  );

  app.get(
    "/admin/tenants/:tenantId/inbox",
    { preHandler: requireTenantAccess(options) },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      return options.store.listUnifiedInbox(tenantId);
    },
  );

  app.get(
    "/admin/tenants/:tenantId/contacts",
    { preHandler: requireTenantAccess(options) },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      return options.store.listContacts(tenantId);
    },
  );

  app.get(
    "/admin/tenants/:tenantId/conversations/:conversationId/messages",
    { preHandler: requireTenantAccess(options) },
    async (request) => {
      const { tenantId, conversationId } = ParamsConversationSchema.parse(
        request.params,
      );
      return options.store.listConversationMessages(tenantId, conversationId);
    },
  );

  app.get(
    "/admin/tenants/:tenantId/handoffs",
    { preHandler: requireTenantAccess(options) },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      return options.store.listHandoffs(tenantId);
    },
  );

  app.get(
    "/admin/tenants/:tenantId/unanswered",
    { preHandler: requireTenantAccess(options) },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const handoffs = await options.store.listHandoffs(tenantId);
      return buildUnansweredQueue(handoffs);
    },
  );

  app.get(
    "/admin/tenants/:tenantId/workflows/suggestions",
    { preHandler: requireTenantAccess(options) },
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
    { preHandler: requireTenantAccess(options) },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      return options.store.listWhatsappTemplates(tenantId);
    },
  );

  app.post(
    "/admin/tenants/:tenantId/whatsapp/templates",
    { preHandler: requireTenantAccess(options) },
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
    { preHandler: requireTenantAccess(options) },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      return options.store.getWhatsappCompliance(tenantId);
    },
  );

  app.post(
    "/admin/tenants/:tenantId/weekly-report",
    { preHandler: requireTenantAccess(options) },
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
    { preHandler: requireTenantAccess(options) },
    async (request) => {
      const { tenantId, handoffId } = ParamsHandoffSchema.parse(request.params);
      const body = UpdateHandoffSchema.parse(request.body);
      return options.store.updateHandoff(tenantId, handoffId, body);
    },
  );

  app.post(
    "/admin/tenants/:tenantId/test-assistant",
    { preHandler: requireTenantAccess(options) },
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
    { preHandler: requireTenantAccess(options) },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      return options.store.exportTenantData(tenantId);
    },
  );

  app.delete(
    "/admin/tenants/:tenantId",
    { preHandler: requireTenantAccess(options) },
    async (request, reply) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      await options.store.deleteTenantData(tenantId);
      return reply.code(204).send();
    },
  );

  app.post(
    "/admin/tenants/:tenantId/install-check",
    { preHandler: requireTenantAccess(options) },
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

    return config;
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

      const answer = await engine.answer(
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

      const conversationInput: Parameters<
        PlatformStore["findOrCreateConversation"]
      >[0] = {
        tenantId: tenant.id,
        channel: "website",
        locale: tenant.defaultLocale,
      };
      if (body.conversationId) {
        conversationInput.publicConversationId = body.conversationId;
      }
      if (body.visitorId) {
        conversationInput.externalUserId = body.visitorId;
      }

      const conversation =
        await options.store.findOrCreateConversation(conversationInput);
      const message = formatLeadCaptureMessage(body.fields, body.pageUrl);
      await options.store.enrichConversationContact({
        tenantId: tenant.id,
        conversationId: conversation.id,
        channel: "website",
        externalUserId: body.visitorId ?? null,
        contact: contactProfileFromFields(body.fields, {
          pageUrl: body.pageUrl,
          source: "lead_capture",
        }),
      });

      await options.store.addMessage({
        tenantId: tenant.id,
        conversationId: conversation.id,
        channel: "website",
        direction: "inbound",
        role: "user",
        content: message,
        trace: {
          type: "lead_capture",
          fields: body.fields,
          pageUrl: body.pageUrl,
        },
      });

      const handoff = await options.store.createHandoff({
        tenantId: tenant.id,
        conversationId: conversation.id,
        channel: "website",
        reason: "lead_capture",
        message,
        metadata: {
          pipelineStage,
          ...(autoQualified
            ? {
                automationReason: "lead_details",
                pipelineUpdatedAt: new Date().toISOString(),
              }
            : {}),
        },
      });
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

      const conversationInput: Parameters<
        PlatformStore["findOrCreateConversation"]
      >[0] = {
        tenantId: tenant.id,
        channel: "website",
        locale: tenant.defaultLocale,
      };
      if (body.conversationId) {
        conversationInput.publicConversationId = body.conversationId;
      }
      if (body.visitorId) {
        conversationInput.externalUserId = body.visitorId;
      }

      const conversation =
        await options.store.findOrCreateConversation(conversationInput);
      const score = scoreReadiness(body.answers);
      const message = formatReadinessMessage(body.answers, score, body.pageUrl);
      await options.store.enrichConversationContact({
        tenantId: tenant.id,
        conversationId: conversation.id,
        channel: "website",
        externalUserId: body.visitorId ?? null,
        contact: contactProfileFromFields(body.answers, {
          pageUrl: body.pageUrl,
          source: "readiness_assessment",
          score,
        }),
      });
      const autoQualified =
        automation.autoQualifyReadinessEnabled &&
        score >= automation.readinessQualificationScore;
      const pipelineStage = autoQualified ? "qualified" : "new";

      await options.store.addMessage({
        tenantId: tenant.id,
        conversationId: conversation.id,
        channel: "website",
        direction: "inbound",
        role: "user",
        content: message,
        trace: {
          type: "readiness_assessment",
          answers: body.answers,
          score,
          pageUrl: body.pageUrl,
        },
      });

      const handoff = await options.store.createHandoff({
        tenantId: tenant.id,
        conversationId: conversation.id,
        channel: "website",
        reason: "readiness_assessment",
        message,
        metadata: {
          pipelineStage,
          score,
          ...(autoQualified
            ? {
                automationReason: "readiness_score",
                pipelineUpdatedAt: new Date().toISOString(),
              }
            : {}),
        },
      });
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

  app.post("/webhooks/meta/:channel", async (request, reply) => {
    const { channel } = ParamsMetaChannelSchema.parse(request.params);
    const query = MetaWebhookQuerySchema.parse(request.query);
    const adapter = metaAdapters[channel];
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
      results.push(
        await processChannelInboundEvent({
          options,
          engine,
          adapter,
          tenant,
          event,
        }),
      );
    }

    return {
      received: true,
      channel,
      provider: adapter.provider,
      routed: results.length,
      results,
    };
  });

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

    _request.log.error(error);
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
    requestAuthContext.set(request, auth);
  };
}

function requirePlatformOwner(options: BuildServerOptions) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = await authenticateRequest(request, options);
    if (!auth || !isPlatformOwner(auth)) {
      return reply.code(403).send({ error: "Forbidden." });
    }
    requestAuthContext.set(request, auth);
  };
}

function requireTenantAccess(
  options: BuildServerOptions,
  minimumRole: RoleName = "viewer",
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = await authenticateRequest(request, options);
    if (!auth) {
      return reply.code(401).send({ error: "Unauthorized." });
    }
    if (auth.kind === "admin" || isPlatformOwner(auth)) {
      requestAuthContext.set(request, auth);
      return;
    }

    const { tenantId } = ParamsTenantSchema.parse(request.params);
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
  if (adminToken === options.adminToken) {
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
  if (!checklist.sipConfigured) {
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
};

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
      settings: asRecord(connection?.settings),
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

  const outboundRecord = await input.options.store.addMessage({
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
  const delivery = await input.adapter.sendMessage(outboundMessage);

  await input.options.store.addMessage({
    tenantId: input.tenant.id,
    conversationId: conversation.id,
    channel: input.event.channel,
    direction: "outbound",
    role: "assistant",
    content: answer.text,
    trace: {
      answer,
      delivery,
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

async function fetchTextDocument(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS URLs can be scanned.");
  }

  const response = await fetch(parsed.toString(), {
    headers: {
      accept: "text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.5",
      "user-agent": "AssaddarAI-WebsiteScanner/1.0",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(10_000),
  });
  const html = (await response.text()).slice(0, 900_000);

  return {
    finalUrl: response.url || parsed.toString(),
    status: response.status,
    html,
  };
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

function getStringProperty(value: unknown, key: string) {
  const record = asRecord(value);
  return typeof record[key] === "string" ? record[key] : undefined;
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
