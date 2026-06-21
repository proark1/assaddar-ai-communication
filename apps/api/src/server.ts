import {
  MetaMessengerAdapter,
  WhatsAppCloudAdapter,
  WebsiteAdapter,
  type ChannelAdapter
} from "@assaddar/channels";
import {
  createAnswerEngine,
  InboundMessageSchema,
  type AnswerDataStore,
  type Channel,
  type HandoffStore
} from "@assaddar/core";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { z } from "zod";
import { openApiDocument } from "./openapi";

const ParamsTenantSchema = z.object({
  tenantId: z.string().uuid()
});

const ParamsAssistantSchema = z.object({
  assistantId: z.string().min(8)
});

const ParamsMetaChannelSchema = z.object({
  channel: z.enum(["whatsapp", "messenger", "instagram"])
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
      language: z.string().optional()
    })
    .optional()
});

const AddFaqSchema = z.object({
  question: z.string().min(3).max(500),
  answer: z.string().min(3).max(4000),
  tags: z.array(z.string().min(1).max(60)).max(20).optional()
});

const TestAssistantSchema = z.object({
  message: z.string().min(1).max(1200),
  locale: z.string().min(2).max(16).optional()
});

const WidgetChatSchema = z.object({
  assistantId: z.string().min(8),
  message: z.string().min(1).max(1200),
  conversationId: z.string().min(8).max(80).optional(),
  visitorId: z.string().min(1).max(120).optional(),
  locale: z.string().min(2).max(16).optional()
});

type CreateTenantInput = z.infer<typeof CreateTenantSchema>;
type AddFaqInput = z.infer<typeof AddFaqSchema>;

export type PlatformStore = AnswerDataStore &
  HandoffStore & {
    createTenant(input: CreateTenantInput): Promise<unknown>;
    listTenants(): Promise<unknown[]>;
    getTenant(tenantId: string): Promise<{ id: string; publicId: string; defaultLocale: string } | null>;
    getTenantByPublicId(publicId: string): Promise<{ id: string; publicId: string; defaultLocale: string } | null>;
    getWidgetConfig(publicId: string): Promise<unknown | null>;
    addFaq(tenantId: string, input: AddFaqInput): Promise<unknown>;
    listKnowledge(tenantId: string): Promise<unknown[]>;
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
  metaVerifyToken?: string;
  whatsappAccessToken?: string;
  messengerPageAccessToken?: string;
};

export async function buildServer(options: BuildServerOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info"
    }
  });

  const allowedOrigins = options.allowedOrigins ?? [];
  await app.register(cors, {
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin not allowed"), false);
    }
  });

  await app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute"
  });

  const engine = createAnswerEngine({
    dataStore: options.store,
    handoffStore: options.store
  });
  const websiteAdapter = new WebsiteAdapter();
  const metaAdapters: Record<"whatsapp" | "messenger" | "instagram", ChannelAdapter> = {
    whatsapp: new WhatsAppCloudAdapter(options.metaVerifyToken ?? "change-me-meta-verify-token", options.whatsappAccessToken),
    messenger: new MetaMessengerAdapter(
      "messenger",
      options.metaVerifyToken ?? "change-me-meta-verify-token",
      options.messengerPageAccessToken
    ),
    instagram: new MetaMessengerAdapter(
      "instagram",
      options.metaVerifyToken ?? "change-me-meta-verify-token",
      options.messengerPageAccessToken
    )
  };

  app.get("/health", async () => ({
    ok: true,
    service: "assaddar-ai-communication-api"
  }));

  app.get("/openapi.json", async () => openApiDocument);

  app.get("/admin/tenants", { preHandler: requireAdmin(options.adminToken) }, async () => {
    return options.store.listTenants();
  });

  app.post("/admin/tenants", { preHandler: requireAdmin(options.adminToken) }, async (request, reply) => {
    const body = CreateTenantSchema.parse(request.body);
    const tenant = await options.store.createTenant(body);
    return reply.code(201).send(tenant);
  });

  app.post(
    "/admin/tenants/:tenantId/knowledge/faqs",
    { preHandler: requireAdmin(options.adminToken) },
    async (request, reply) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      const body = AddFaqSchema.parse(request.body);
      const result = await options.store.addFaq(tenantId, body);
      return reply.code(201).send(result);
    }
  );

  app.get(
    "/admin/tenants/:tenantId/knowledge",
    { preHandler: requireAdmin(options.adminToken) },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      return options.store.listKnowledge(tenantId);
    }
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
        locale: body.locale ?? tenant.defaultLocale
      });

      await options.store.addMessage({
        tenantId,
        conversationId: conversation.id,
        channel: "admin_test",
        direction: "inbound",
        role: "user",
        content: body.message
      });

      const answer = await engine.answer(
        InboundMessageSchema.parse({
          tenantId,
          conversationId: conversation.id,
          channel: "admin_test",
          text: body.message,
          locale: body.locale ?? tenant.defaultLocale,
          metadata: {}
        })
      );

      await options.store.addMessage({
        tenantId,
        conversationId: conversation.id,
        channel: "admin_test",
        direction: "outbound",
        role: "assistant",
        content: answer.text,
        trace: { answer }
      });

      await options.store.logUsage({
        tenantId,
        channel: "admin_test",
        eventType: answer.status,
        credits: answer.usage.estimatedCredits,
        metadata: { intent: answer.intent, confidence: answer.confidence }
      });

      return {
        conversationId: conversation.publicId,
        answer
      };
    }
  );

  app.get(
    "/admin/tenants/:tenantId/export",
    { preHandler: requireAdmin(options.adminToken) },
    async (request) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      return options.store.exportTenantData(tenantId);
    }
  );

  app.delete(
    "/admin/tenants/:tenantId",
    { preHandler: requireAdmin(options.adminToken) },
    async (request, reply) => {
      const { tenantId } = ParamsTenantSchema.parse(request.params);
      await options.store.deleteTenantData(tenantId);
      return reply.code(204).send();
    }
  );

  app.get("/widget/config/:assistantId", async (request, reply) => {
    const { assistantId } = ParamsAssistantSchema.parse(request.params);
    const config = await options.store.getWidgetConfig(assistantId);
    if (!config) {
      return reply.code(404).send({ error: "Assistant not found." });
    }

    return config;
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
        visitorId: body.visitorId
      },
      tenant.id
    );
    if (!event) {
      return reply.code(400).send({ error: "No message event found." });
    }

    const conversationInput: Parameters<PlatformStore["findOrCreateConversation"]>[0] = {
      tenantId: tenant.id,
      channel: "website",
      locale: body.locale ?? tenant.defaultLocale
    };
    if (body.conversationId) {
      conversationInput.publicConversationId = body.conversationId;
    }
    if (body.visitorId) {
      conversationInput.externalUserId = body.visitorId;
    }

    const conversation = await options.store.findOrCreateConversation(conversationInput);

    await options.store.addMessage({
      tenantId: tenant.id,
      conversationId: conversation.id,
      channel: "website",
      direction: "inbound",
      role: "user",
      content: event.text
    });

    const answer = await engine.answer(
      InboundMessageSchema.parse({
        tenantId: tenant.id,
        conversationId: conversation.id,
        channel: "website",
        externalUserId: body.visitorId,
        text: event.text,
        locale: body.locale ?? tenant.defaultLocale,
        metadata: {}
      })
    );

    await options.store.addMessage({
      tenantId: tenant.id,
      conversationId: conversation.id,
      channel: "website",
      direction: "outbound",
      role: "assistant",
      content: answer.text,
      trace: { answer }
    });

    await options.store.logUsage({
      tenantId: tenant.id,
      channel: "website",
      eventType: answer.status,
      credits: answer.usage.estimatedCredits,
      metadata: {
        intent: answer.intent,
        confidence: answer.confidence
      }
    });

    return {
      conversationId: conversation.publicId,
      status: answer.status,
      reply: answer.text,
      citations: answer.citations,
      handoffRecommended: answer.handoffRecommended
    };
  });

  app.get("/webhooks/meta/:channel", async (request, reply) => {
    const { channel } = ParamsMetaChannelSchema.parse(request.params);
    const query = z
      .object({
        "hub.mode": z.string().optional(),
        "hub.verify_token": z.string().optional(),
        "hub.challenge": z.string().optional()
      })
      .parse(request.query);

    const verificationRequest = {};
    if (query["hub.mode"]) {
      Object.assign(verificationRequest, { mode: query["hub.mode"] });
    }
    if (query["hub.verify_token"]) {
      Object.assign(verificationRequest, { verifyToken: query["hub.verify_token"] });
    }
    if (query["hub.challenge"]) {
      Object.assign(verificationRequest, { challenge: query["hub.challenge"] });
    }

    const challenge = metaAdapters[channel].verifyWebhook?.(verificationRequest);

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
      note: "Webhook payload stored/processed once channel connection credential mapping is configured."
    };
  });

  app.setErrorHandler(async (error, _request, reply) => {
    if (error instanceof z.ZodError) {
      return reply.code(400).send({
        error: "Validation failed.",
        issues: error.issues
      });
    }

    _request.log.error(error);
    return reply.code(500).send({
      error: "Internal server error."
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
