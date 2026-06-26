import { config } from "dotenv";
import {
  createTwiMLDial,
  createTwiMLGather,
  createTwiMLSay,
  TwilioVoiceAdapter,
} from "@assaddar/channels";
import { createAnswerEngine, InboundMessageSchema } from "@assaddar/core";
import { createDbClient, TenantRepository } from "@assaddar/db";
import formBody from "@fastify/formbody";
import Fastify from "fastify";
import { z } from "zod";

config({ path: new URL("../../../.env", import.meta.url) });

const VoiceQuerySchema = z.object({
  assistantId: z.string().min(8),
});

const VoiceTurnBodySchema = z.object({
  assistantId: z.string().min(8).optional(),
  text: z.string().trim().min(1).max(4000),
  callId: z.string().trim().min(1).max(160).optional(),
  from: z.string().trim().min(1).max(80).optional(),
  to: z.string().trim().min(1).max(80).optional(),
  provider: z.string().trim().min(1).max(80).default("sip_edge"),
  locale: z.string().trim().min(2).max(16).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const port = Number(process.env.VOICE_PORT ?? process.env.PORT ?? 4100);
const transferPhoneNumber = process.env.TWILIO_TRANSFER_PHONE_NUMBER;
const twilioVoiceLanguage = process.env.TWILIO_VOICE_LANGUAGE ?? "de-DE";
const twilioVoiceName = process.env.TWILIO_VOICE_NAME ?? "alice";
const client = createDbClient();
const store = new TenantRepository(client.db);
const engine = createAnswerEngine({
  dataStore: store,
  handoffStore: store,
});
const adapter = new TwilioVoiceAdapter();
const app = Fastify({ logger: true });

await app.register(formBody);

app.get("/health", async () => ({
  ok: true,
  service: "assaddar-ai-communication-voice",
}));

app.post("/voice/turn", async (request, reply) => {
  const query = VoiceQuerySchema.partial().parse(request.query);
  const body = VoiceTurnBodySchema.parse(request.body);
  const assistantId = body.assistantId ?? query.assistantId;
  if (!assistantId) {
    return reply.code(400).send({
      error: "assistantId is required in the query string or JSON body.",
    });
  }

  const tenant = await store.getTenantByPublicId(assistantId);
  if (!tenant) {
    return reply.code(404).send({ error: "Assistant is not available." });
  }

  const conversationInput: Parameters<
    TenantRepository["findOrCreateConversation"]
  >[0] = {
    tenantId: tenant.id,
    channel: "telephone",
    locale: body.locale ?? tenant.defaultLocale,
  };
  if (body.callId) {
    conversationInput.publicConversationId = body.callId;
  }
  if (body.from) {
    conversationInput.externalUserId = body.from;
  }

  const conversation = await store.findOrCreateConversation(conversationInput);

  await store.addMessage({
    tenantId: tenant.id,
    conversationId: conversation.id,
    channel: "telephone",
    direction: "inbound",
    role: "user",
    content: body.text,
    trace: {
      provider: body.provider,
      from: body.from ?? null,
      to: body.to ?? null,
      metadata: body.metadata ?? {},
    },
  });

  const answer = await engine.answer(
    InboundMessageSchema.parse({
      tenantId: tenant.id,
      conversationId: conversation.id,
      channel: "telephone",
      externalUserId: body.from,
      text: body.text,
      locale: body.locale ?? tenant.defaultLocale,
      metadata: {
        provider: body.provider,
        callId: body.callId ?? null,
        to: body.to ?? null,
        ...(body.metadata ?? {}),
      },
    }),
  );

  await store.addMessage({
    tenantId: tenant.id,
    conversationId: conversation.id,
    channel: "telephone",
    direction: "outbound",
    role: "assistant",
    content: answer.text,
    trace: { answer },
  });

  await store.logUsage({
    tenantId: tenant.id,
    channel: "telephone",
    eventType: answer.status,
    credits: answer.usage.estimatedCredits,
    metadata: {
      intent: answer.intent,
      confidence: answer.confidence,
      provider: body.provider,
    },
  });

  return {
    conversationId: conversation.id,
    reply: answer.text,
    status: answer.status,
    confidence: answer.confidence,
    handoffRecommended: answer.handoffRecommended,
    transferPhoneNumber: answer.handoffRecommended
      ? transferPhoneNumber ?? null
      : null,
  };
});

app.post("/twilio/voice", async (request, reply) => {
  const query = VoiceQuerySchema.safeParse(request.query);
  const actionUrl = query.success
    ? `/twilio/voice?assistantId=${encodeURIComponent(query.data.assistantId)}`
    : "/twilio/voice";
  const voiceOptions = {
    actionUrl,
    language: twilioVoiceLanguage,
    voice: twilioVoiceName,
  };
  if (!query.success) {
    return reply
      .type("text/xml")
      .send(
        createTwiMLSay(
          "This assistant is not configured. Please contact the business directly.",
          voiceOptions,
        ),
      );
  }

  const tenant = await store.getTenantByPublicId(query.data.assistantId);
  if (!tenant) {
    return reply
      .type("text/xml")
      .send(
        createTwiMLSay(
          "This assistant is not available. Please contact the business directly.",
          voiceOptions,
        ),
      );
  }

  const [event] = adapter.normalizeInbound(request.body, tenant.id);
  if (event?.text === "human_transfer_requested") {
    if (transferPhoneNumber) {
      return reply
        .type("text/xml")
        .send(createTwiMLDial(transferPhoneNumber, voiceOptions));
    }
    return reply
      .type("text/xml")
      .send(
        createTwiMLSay(
          "Ein direkter Transfer ist gerade nicht eingerichtet. Bitte hinterlassen Sie Ihre Frage, damit das Team nachfassen kann.",
          voiceOptions,
        ),
      );
  }

  if (!event) {
    return reply
      .type("text/xml")
      .send(
        createTwiMLGather(
          "Hallo. Ich bin der Assaddar AI Assistent. Bitte sagen Sie kurz, wobei ich helfen kann. Druecken Sie 0, wenn Sie mit einem Menschen sprechen moechten.",
          voiceOptions,
        ),
      );
  }

  const conversationInput: Parameters<
    TenantRepository["findOrCreateConversation"]
  >[0] = {
    tenantId: tenant.id,
    channel: "telephone",
    locale: tenant.defaultLocale,
  };
  if (event.externalConversationId) {
    conversationInput.publicConversationId = event.externalConversationId;
  }
  if (event.externalUserId) {
    conversationInput.externalUserId = event.externalUserId;
  }

  const conversation = await store.findOrCreateConversation(conversationInput);

  await store.addMessage({
    tenantId: tenant.id,
    conversationId: conversation.id,
    channel: "telephone",
    direction: "inbound",
    role: "user",
    content: event.text,
  });

  const answer = await engine.answer(
    InboundMessageSchema.parse({
      tenantId: tenant.id,
      conversationId: conversation.id,
      channel: "telephone",
      externalUserId: event.externalUserId,
      text: event.text,
      locale: tenant.defaultLocale,
      metadata: {
        provider: "twilio",
      },
    }),
  );

  await store.addMessage({
    tenantId: tenant.id,
    conversationId: conversation.id,
    channel: "telephone",
    direction: "outbound",
    role: "assistant",
    content: answer.text,
    trace: { answer },
  });

  await store.logUsage({
    tenantId: tenant.id,
    channel: "telephone",
    eventType: answer.status,
    credits: answer.usage.estimatedCredits,
    metadata: {
      intent: answer.intent,
      confidence: answer.confidence,
    },
  });

  return reply.type("text/xml").send(createTwiMLSay(answer.text, voiceOptions));
});

app.setErrorHandler(async (error, request, reply) => {
  request.log.error(error);
  return reply
    .type("text/xml")
    .send(
      createTwiMLSay("I cannot answer right now. Please try again later.", {
        language: twilioVoiceLanguage,
        voice: twilioVoiceName,
      }),
    );
});

process.on("SIGTERM", async () => {
  await app.close();
  await client.close();
});

await app.listen({
  host: "0.0.0.0",
  port,
});
