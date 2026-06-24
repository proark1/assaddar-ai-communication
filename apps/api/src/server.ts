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
import net from "node:net";
import tls from "node:tls";
import { z } from "zod";
import { openApiDocument } from "./openapi";

const ParamsTenantSchema = z.object({
  tenantId: z.string().uuid(),
});

const ParamsKnowledgeSchema = ParamsTenantSchema.extend({
  knowledgeId: z.string().uuid(),
});

const ParamsConversationSchema = ParamsTenantSchema.extend({
  conversationId: z.string().uuid(),
});

const ParamsHandoffSchema = ParamsTenantSchema.extend({
  handoffId: z.string().uuid(),
});

const ParamsAssistantSchema = z.object({
  assistantId: z.string().min(8),
});

const ParamsMetaChannelSchema = z.object({
  channel: z.enum(["whatsapp", "messenger", "instagram"]),
});

const ParamsChannelSchema = ParamsTenantSchema.extend({
  channel: z.enum([
    "website",
    "whatsapp",
    "messenger",
    "instagram",
    "telephone",
  ]),
});

const CreateTenantSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z
    .string()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  defaultLocale: z.string().min(2).max(16).optional(),
  theme: z
    .object({
      primaryColor: z.string().optional(),
      backgroundColor: z.string().optional(),
      textColor: z.string().optional(),
      launcherLabel: z.string().optional(),
      openingMessage: z.string().optional(),
      language: z.string().optional(),
    })
    .optional(),
});

const AutomationSettingsSchema = z.object({
  ownerLeadEmailEnabled: z.boolean().optional(),
  visitorConfirmationEmailEnabled: z.boolean().optional(),
  autoQualifyReadinessEnabled: z.boolean().optional(),
  autoQualifyLeadDetailsEnabled: z.boolean().optional(),
  weeklySummaryEmailEnabled: z.boolean().optional(),
  staleLeadReminderDays: z.number().int().min(1).max(30).optional(),
  readinessQualificationScore: z.number().int().min(1).max(100).optional(),
});

const WidgetThemeSchema = z.object({
  primaryColor: z.string().min(3).max(32).optional(),
  backgroundColor: z.string().min(3).max(32).optional(),
  textColor: z.string().min(3).max(32).optional(),
  launcherLabel: z.string().min(1).max(40).optional(),
  openingMessage: z.string().min(1).max(500).optional(),
  language: z.string().min(2).max(16).optional(),
  position: z.enum(["bottom-right", "bottom-left"]).optional(),
  assistantName: z.string().min(1).max(80).optional(),
  leadCaptureEnabled: z.boolean().optional(),
  leadCaptureIntro: z.string().min(1).max(500).optional(),
  leadCaptureFields: z.array(z.string().min(1).max(40)).max(10).optional(),
  ctaLabel: z.string().min(1).max(80).optional(),
  ctaUrl: z.string().url().max(500).optional(),
  bookingUrl: z.string().url().max(500).optional(),
  consentEnabled: z.boolean().optional(),
  consentText: z.string().min(1).max(500).optional(),
  quickReplies: z.array(z.string().min(1).max(120)).max(8).optional(),
  readinessEnabled: z.boolean().optional(),
  readinessIntro: z.string().min(1).max(500).optional(),
  automation: AutomationSettingsSchema.optional(),
});

const UpdateTenantSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  slug: z
    .string()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
  defaultLocale: z.string().min(2).max(16).optional(),
  tone: z.enum(["friendly", "neutral", "formal"]).optional(),
  confidenceThreshold: z.number().min(0.05).max(0.95).optional(),
  maxMessageLength: z.number().int().min(200).max(4000).optional(),
  retentionDays: z.number().int().min(1).max(3650).optional(),
  theme: WidgetThemeSchema.optional(),
});

const AddFaqSchema = z.object({
  question: z.string().min(3).max(500),
  answer: z.string().min(3).max(4000),
  tags: z.array(z.string().min(1).max(60)).max(20).optional(),
});

const UpdateHandoffSchema = z.object({
  status: z.enum(["open", "in_progress", "resolved", "dismissed"]).optional(),
  assignedTo: z.string().max(120).nullable().optional(),
  pipelineStage: z
    .enum(["new", "contacted", "qualified", "proposal", "won", "lost"])
    .optional(),
  note: z.string().max(1000).optional(),
});

const TestAssistantSchema = z.object({
  message: z.string().min(1).max(1200),
  locale: z.string().min(2).max(16).optional(),
});

const WidgetChatSchema = z.object({
  assistantId: z.string().min(8),
  message: z.string().min(1).max(1200),
  conversationId: z.string().min(8).max(80).optional(),
  visitorId: z.string().min(1).max(120).optional(),
  locale: z.string().min(2).max(16).optional(),
});

const WidgetLeadSchema = z.object({
  assistantId: z.string().min(8),
  conversationId: z.string().min(8).max(80).optional(),
  visitorId: z.string().min(1).max(120).optional(),
  pageUrl: z.string().url().max(500).optional(),
  fields: z
    .record(z.string().max(1000))
    .refine(
      (fields) => Object.values(fields).some((value) => value.trim()),
      "At least one lead field is required.",
    ),
});

const WidgetReadinessSchema = z.object({
  assistantId: z.string().min(8),
  conversationId: z.string().min(8).max(80).optional(),
  visitorId: z.string().min(1).max(120).optional(),
  pageUrl: z.string().url().max(500).optional(),
  answers: z
    .record(z.string().max(1200))
    .refine(
      (answers) => Object.values(answers).some((value) => value.trim()),
      "At least one readiness answer is required.",
    ),
});

const WidgetEventSchema = z.object({
  assistantId: z.string().min(8),
  conversationId: z.string().min(8).max(80).optional(),
  visitorId: z.string().min(1).max(120).optional(),
  pageUrl: z.string().url().max(500).optional(),
  eventType: z.enum(["widget_open", "quick_reply_clicked", "cta_clicked"]),
  metadata: z.record(z.unknown()).optional(),
});

const MetaWebhookQuerySchema = z.object({
  assistantId: z.string().min(8).optional(),
});

const ChannelConnectionSchema = z.object({
  channel: z.enum([
    "website",
    "whatsapp",
    "messenger",
    "instagram",
    "telephone",
  ]),
  provider: z.string().min(1).max(80),
  externalAccountId: z.string().max(256).nullable().optional(),
  status: z.enum(["pending", "connected", "disabled"]).optional(),
  settings: z.record(z.unknown()).optional(),
});

const ContactProfileSchema = z.object({
  displayName: z.string().min(1).max(160).nullable().optional(),
  email: z.string().email().max(240).nullable().optional(),
  phone: z.string().min(3).max(80).nullable().optional(),
  company: z.string().min(1).max(160).nullable().optional(),
  identifiers: z.record(z.union([z.string(), z.array(z.string())])).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const WhatsappTemplateSchema = z.object({
  name: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-zA-Z0-9_ -]+$/),
  language: z.string().min(2).max(16).default("de"),
  category: z
    .enum(["marketing", "utility", "authentication"])
    .default("utility"),
  status: z
    .enum(["draft", "submitted", "approved", "rejected", "paused"])
    .default("draft"),
  body: z.string().min(5).max(1024),
  variables: z.array(z.string().min(1).max(80)).max(20).optional(),
  providerTemplateId: z.string().max(240).nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const WebsiteImportSchema = z.object({
  url: z.string().url().max(500),
  maxFaqs: z.number().int().min(1).max(12).default(6),
  maxPages: z.number().int().min(1).max(8).default(1),
});

const InstallCheckSchema = z.object({
  url: z.string().url().max(500),
  assistantId: z.string().min(8),
  widgetUrl: z.string().url().max(500).optional(),
});

type CreateTenantInput = z.infer<typeof CreateTenantSchema>;
type UpdateTenantInput = z.infer<typeof UpdateTenantSchema>;
type AddFaqInput = z.infer<typeof AddFaqSchema>;
type UpdateHandoffInput = z.infer<typeof UpdateHandoffSchema>;
type ChannelConnectionInput = z.infer<typeof ChannelConnectionSchema>;
type ContactProfileInput = z.infer<typeof ContactProfileSchema>;
type WhatsappTemplateInput = z.infer<typeof WhatsappTemplateSchema>;
type WidgetThemeInput = z.infer<typeof WidgetThemeSchema>;
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
  defaultLocale: string;
  theme?: WidgetThemeInput | null;
};

export type PlatformStore = AnswerDataStore &
  HandoffStore & {
    createTenant(input: CreateTenantInput): Promise<unknown>;
    updateTenant(tenantId: string, input: UpdateTenantInput): Promise<unknown>;
    listTenants(): Promise<unknown[]>;
    getTenant(tenantId: string): Promise<StoreTenant | null>;
    getTenantByPublicId(publicId: string): Promise<StoreTenant | null>;
    getWidgetConfig(publicId: string): Promise<unknown | null>;
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
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
    },
  });

  const allowedOrigins = options.allowedOrigins ?? [];
  await app.register(cors, {
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

  await app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute",
  });

  const engine = createAnswerEngine({
    dataStore: options.store,
    handoffStore: options.store,
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

  app.get("/health", async () => ({
    ok: true,
    service: "assaddar-ai-communication-api",
  }));

  app.get("/openapi.json", async () => openApiDocument);

  app.get(
    "/admin/session",
    { preHandler: requireAdmin(options.adminToken) },
    async () => ({
      authenticated: true,
      user: options.adminUser ?? {
        email: "owner@assad-dar.de",
        name: "Assad Dar",
        role: "owner",
      },
      permissions: getPermissions(options.adminUser?.role ?? "owner"),
    }),
  );

  app.get(
    "/admin/tenants",
    { preHandler: requireAdmin(options.adminToken) },
    async () => {
      return options.store.listTenants();
    },
  );

  app.post(
    "/admin/tenants",
    { preHandler: requireAdmin(options.adminToken) },
    async (request, reply) => {
      const body = CreateTenantSchema.parse(request.body);
      const tenant = await options.store.createTenant(body);
      return reply.code(201).send(tenant);
    },
  );

  app.patch(
    "/admin/tenants/:tenantId",
    { preHandler: requireAdmin(options.adminToken) },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const body = UpdateTenantSchema.parse(request.body);
      return options.store.updateTenant(tenantId, body);
    },
  );

  app.get(
    "/admin/tenants/:tenantId/channel-connections",
    { preHandler: requireAdmin(options.adminToken) },
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
    { preHandler: requireAdmin(options.adminToken) },
    async (request) => {
      const { tenantId, channel } = ParamsChannelSchema.parse(request.params);
      const body = ChannelConnectionSchema.parse({
        ...(isRecord(request.body) ? request.body : {}),
        channel,
      });
      return options.store.upsertChannelConnection(tenantId, body);
    },
  );

  app.post(
    "/admin/tenants/:tenantId/knowledge/faqs",
    { preHandler: requireAdmin(options.adminToken) },
    async (request, reply) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const body = AddFaqSchema.parse(request.body);
      const result = await options.store.addFaq(tenantId, body);
      return reply.code(201).send(result);
    },
  );

  app.get(
    "/admin/tenants/:tenantId/knowledge",
    { preHandler: requireAdmin(options.adminToken) },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      return options.store.listKnowledge(tenantId);
    },
  );

  app.post(
    "/admin/tenants/:tenantId/knowledge/import-website",
    { preHandler: requireAdmin(options.adminToken) },
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
    { preHandler: requireAdmin(options.adminToken) },
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
    { preHandler: requireAdmin(options.adminToken) },
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
    { preHandler: requireAdmin(options.adminToken) },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      return options.store.getTenantAnalytics(tenantId);
    },
  );

  app.get(
    "/admin/tenants/:tenantId/conversations",
    { preHandler: requireAdmin(options.adminToken) },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      return options.store.listConversations(tenantId);
    },
  );

  app.get(
    "/admin/tenants/:tenantId/inbox",
    { preHandler: requireAdmin(options.adminToken) },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      return options.store.listUnifiedInbox(tenantId);
    },
  );

  app.get(
    "/admin/tenants/:tenantId/contacts",
    { preHandler: requireAdmin(options.adminToken) },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      return options.store.listContacts(tenantId);
    },
  );

  app.get(
    "/admin/tenants/:tenantId/conversations/:conversationId/messages",
    { preHandler: requireAdmin(options.adminToken) },
    async (request) => {
      const { tenantId, conversationId } = ParamsConversationSchema.parse(
        request.params,
      );
      return options.store.listConversationMessages(tenantId, conversationId);
    },
  );

  app.get(
    "/admin/tenants/:tenantId/handoffs",
    { preHandler: requireAdmin(options.adminToken) },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      return options.store.listHandoffs(tenantId);
    },
  );

  app.get(
    "/admin/tenants/:tenantId/unanswered",
    { preHandler: requireAdmin(options.adminToken) },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const handoffs = await options.store.listHandoffs(tenantId);
      return buildUnansweredQueue(handoffs);
    },
  );

  app.get(
    "/admin/tenants/:tenantId/workflows/suggestions",
    { preHandler: requireAdmin(options.adminToken) },
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
    { preHandler: requireAdmin(options.adminToken) },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      return options.store.listWhatsappTemplates(tenantId);
    },
  );

  app.post(
    "/admin/tenants/:tenantId/whatsapp/templates",
    { preHandler: requireAdmin(options.adminToken) },
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
    { preHandler: requireAdmin(options.adminToken) },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      return options.store.getWhatsappCompliance(tenantId);
    },
  );

  app.post(
    "/admin/tenants/:tenantId/weekly-report",
    { preHandler: requireAdmin(options.adminToken) },
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
    { preHandler: requireAdmin(options.adminToken) },
    async (request) => {
      const { tenantId, handoffId } = ParamsHandoffSchema.parse(request.params);
      const body = UpdateHandoffSchema.parse(request.body);
      return options.store.updateHandoff(tenantId, handoffId, body);
    },
  );

  app.post(
    "/admin/tenants/:tenantId/test-assistant",
    { preHandler: requireAdmin(options.adminToken) },
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
    { preHandler: requireAdmin(options.adminToken) },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      return options.store.exportTenantData(tenantId);
    },
  );

  app.delete(
    "/admin/tenants/:tenantId",
    { preHandler: requireAdmin(options.adminToken) },
    async (request, reply) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      await options.store.deleteTenantData(tenantId);
      return reply.code(204).send();
    },
  );

  app.post(
    "/admin/tenants/:tenantId/install-check",
    { preHandler: requireAdmin(options.adminToken) },
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

  app.post("/widget/events", async (request, reply) => {
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
  });

  app.post("/widget/chat", async (request, reply) => {
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
  });

  app.post("/widget/leads", async (request, reply) => {
    const body = WidgetLeadSchema.parse(request.body);
    const tenant = await options.store.getTenantByPublicId(body.assistantId);
    if (!tenant) {
      return reply.code(404).send({ error: "Assistant not found." });
    }
    const theme = tenant.theme ?? {};
    const automation = getAutomationSettings(theme);
    const autoQualified = shouldAutoQualifyLeadDetails(body.fields, automation);
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
  });

  app.post("/widget/readiness", async (request, reply) => {
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
  });

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

    _request.log.error(error);
    return reply.code(500).send({
      error: "Internal server error.",
    });
  });

  return app;
}

function requireAdmin(adminToken: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.headers["x-admin-token"];
    if (token !== adminToken) {
      return reply.code(401).send({ error: "Unauthorized." });
    }
  };
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
    process.env.VOICE_PUBLIC_URL ??
    "https://assaddar-voice-production.up.railway.app";
  const assistantId = input.tenant?.publicId;
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
    item("telephone", "twilio", "Telephone", {
      credentialConfigured: true,
      webhookUrl: assistantId
        ? `${voiceBase}/twilio/voice?assistantId=${assistantId}`
        : `${voiceBase}/twilio/voice`,
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

function getPermissions(role: "owner" | "admin" | "operator" | "viewer") {
  const permissions = {
    owner: [
      "tenants:write",
      "knowledge:write",
      "leads:write",
      "settings:write",
      "exports:read",
    ],
    admin: ["knowledge:write", "leads:write", "settings:write", "exports:read"],
    operator: ["knowledge:write", "leads:write"],
    viewer: ["exports:read"],
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
