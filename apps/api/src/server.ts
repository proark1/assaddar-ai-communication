import {
  MetaMessengerAdapter,
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
  consentEnabled: z.boolean().optional(),
  consentText: z.string().min(1).max(500).optional(),
  quickReplies: z.array(z.string().min(1).max(120)).max(8).optional(),
  readinessEnabled: z.boolean().optional(),
  readinessIntro: z.string().min(1).max(500).optional(),
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

export type PlatformStore = AnswerDataStore &
  HandoffStore & {
    createTenant(input: CreateTenantInput): Promise<unknown>;
    updateTenant(tenantId: string, input: UpdateTenantInput): Promise<unknown>;
    listTenants(): Promise<unknown[]>;
    getTenant(
      tenantId: string,
    ): Promise<{ id: string; publicId: string; name: string; defaultLocale: string } | null>;
    getTenantByPublicId(
      publicId: string,
    ): Promise<{ id: string; publicId: string; name: string; defaultLocale: string } | null>;
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
    listConversationMessages(
      tenantId: string,
      conversationId: string,
    ): Promise<unknown[]>;
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
  metaVerifyToken?: string;
  whatsappAccessToken?: string;
  messengerPageAccessToken?: string;
};

type LeadNotificationPayload = {
  tenantId: string;
  tenantName: string;
  type: "lead_capture" | "readiness_assessment";
  conversationId: string;
  message: string;
  fields: Record<string, string>;
  pageUrl?: string;
  score?: number;
};

type LeadNotificationEmail = {
  to: string;
  from: string;
  subject: string;
  text: string;
};

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
    ),
    messenger: new MetaMessengerAdapter(
      "messenger",
      options.metaVerifyToken ?? "change-me-meta-verify-token",
      options.messengerPageAccessToken,
    ),
    instagram: new MetaMessengerAdapter(
      "instagram",
      options.metaVerifyToken ?? "change-me-meta-verify-token",
      options.messengerPageAccessToken,
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
          title: extractTitle(document.html) || new URL(document.finalUrl).hostname,
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
        ...inspectWidgetInstall(document.html, body.assistantId, body.widgetUrl),
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

    await options.store.createHandoff({
      tenantId: tenant.id,
      conversationId: conversation.id,
      channel: "website",
      reason: "lead_capture",
      message,
    });

    await notifyLead(options, {
      tenantId: tenant.id,
      tenantName: tenant.name,
      type: "lead_capture",
      conversationId: conversation.publicId,
      message,
      fields: body.fields,
      ...(body.pageUrl ? { pageUrl: body.pageUrl } : {}),
    });

    await options.store.logUsage({
      tenantId: tenant.id,
      channel: "website",
      eventType: "lead_capture",
      credits: 1,
      metadata: {
        fields: Object.keys(body.fields),
        pageUrl: body.pageUrl,
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

    await options.store.createHandoff({
      tenantId: tenant.id,
      conversationId: conversation.id,
      channel: "website",
      reason: "readiness_assessment",
      message,
    });

    await options.store.logUsage({
      tenantId: tenant.id,
      channel: "website",
      eventType: "readiness_assessment",
      credits: 1,
      metadata: {
        score,
        fields: Object.keys(body.answers),
        pageUrl: body.pageUrl,
      },
    });

    await notifyLead(options, {
      tenantId: tenant.id,
      tenantName: tenant.name,
      type: "readiness_assessment",
      conversationId: conversation.publicId,
      message,
      fields: body.answers,
      score,
      ...(body.pageUrl ? { pageUrl: body.pageUrl } : {}),
    });

    return reply.code(201).send({
      conversationId: conversation.publicId,
      status: "captured",
      score,
      recommendation: readinessRecommendation(score),
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

  app.post("/webhooks/meta/:channel", async (request) => {
    const { channel } = ParamsMetaChannelSchema.parse(request.params);
    return {
      received: true,
      channel,
      adapter: metaAdapters[channel].provider,
      note: "Webhook payload stored/processed once channel connection credential mapping is configured.",
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
    .filter((url) => !/\.(pdf|png|jpg|jpeg|gif|svg|webp|zip)$/i.test(url.pathname))
    .map((url) => url.toString());

  return Array.from(new Set(links)).filter((link) => link !== sourceUrl);
}

function buildUnansweredQueue(handoffs: unknown[]) {
  return handoffs
    .map((handoff) => handoff as {
      id: string;
      conversationId?: string | null;
      channel: string;
      reason: string;
      requesterMessage: string;
      status: string;
      createdAt: string;
    })
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
      suggestedTags: ["unanswered", handoff.reason, handoff.channel].filter(Boolean),
    }));
}

async function notifyLead(
  options: BuildServerOptions,
  payload: LeadNotificationPayload,
) {
  const results: Array<Record<string, unknown>> = [];

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
          ...payload,
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
        payload,
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
    socket.once("timeout", () => reject(new Error("SMTP connection timed out.")));
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
  const body = email.text
    .replace(/\r?\n/g, "\r\n")
    .replace(/^\./gm, "..");
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
    company: "Company",
    projectType: "Project type",
    budget: "Budget",
    timeline: "Timeline",
    message: "Message",
  };
  const lines = Object.entries(fields)
    .filter(([, value]) => value.trim())
    .map(([key, value]) => `${labelMap[key] ?? titleCase(key)}: ${value.trim()}`);

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
    .map(([key, value]) => `${labelMap[key] ?? titleCase(key)}: ${value.trim()}`);

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
  if (/(crm|erp|sap|hubspot|salesforce|excel|database|api|datenbank)/.test(text)) {
    score += 8;
  }
  if (/(manual|manuell|repetitive|wiederkehrend|email|e-mail|dokument)/.test(text)) {
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
        all.findIndex((item) => item.toLowerCase() === sentence.toLowerCase()) ===
        index,
    )
    .slice(0, 16);
}

function detectLanguage(text: string) {
  const lower = text.toLowerCase();
  const germanMatches = (
    lower.match(/\b(und|der|die|das|beratung|kontakt|leistungen|daten|für)\b/g) ??
    []
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
