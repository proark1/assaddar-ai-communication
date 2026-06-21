import { config } from "dotenv";
import {
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

const port = Number(process.env.VOICE_PORT ?? process.env.PORT ?? 4100);
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

app.post("/twilio/voice", async (request, reply) => {
  const query = VoiceQuerySchema.safeParse(request.query);
  if (!query.success) {
    return reply
      .type("text/xml")
      .send(
        createTwiMLSay(
          "This assistant is not configured. Please contact the business directly.",
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
        ),
      );
  }

  const [event] = adapter.normalizeInbound(request.body, tenant.id);
  if (!event) {
    return reply
      .type("text/xml")
      .send(
        createTwiMLGather(
          "Hello. Please tell me how I can help with this business.",
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

  return reply.type("text/xml").send(createTwiMLSay(answer.text));
});

app.setErrorHandler(async (error, request, reply) => {
  request.log.error(error);
  return reply
    .type("text/xml")
    .send(createTwiMLSay("I cannot answer right now. Please try again later."));
});

process.on("SIGTERM", async () => {
  await app.close();
  await client.close();
});

await app.listen({
  host: "0.0.0.0",
  port,
});
