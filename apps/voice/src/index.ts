import { config } from "dotenv";
import * as Sentry from "@sentry/node";
import {
  createTwiMLDial,
  createTwiMLGather,
  createTwiMLSay,
  TwilioVoiceAdapter,
  verifyTwilioSignature,
} from "@assaddar/channels";
import { createAnswerEngine, InboundMessageSchema } from "@assaddar/core";
import {
  createDbClient,
  createEnvChannelCredentialCipher,
  TenantRepository,
} from "@assaddar/db";
import formBody from "@fastify/formbody";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import { createHmac, timingSafeEqual } from "node:crypto";
import { Readable } from "node:stream";
import { z } from "zod";

config({ path: new URL("../../../.env", import.meta.url) });

/**
 * Initialise Sentry only when SENTRY_DSN is set; otherwise this is a no-op and
 * error reporting stays inert (no behaviour change).
 */
function initSentry() {
  // Read the DSN from the environment; never hardcode it.
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    return;
  }
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0,
  });
}

initSentry();

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
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const voiceEdgeSecret = process.env.VOICE_EDGE_SECRET;

if (process.env.NODE_ENV === "production" && !voiceEdgeSecret) {
  throw new Error(
    "VOICE_EDGE_SECRET is required in production to authenticate /voice/turn.",
  );
}

type RequestWithRawBody = FastifyRequest & { rawBody?: Buffer };

/**
 * Reconstruct the externally-visible URL Twilio used when it signed the
 * request. Twilio computes the signature over the public URL, so behind a
 * proxy/load balancer we must honour `x-forwarded-proto` / `x-forwarded-host`
 * rather than the internal scheme/host Fastify sees.
 */
function buildPublicUrl(request: FastifyRequest): string {
  const headerValue = (name: string): string | undefined => {
    const value = request.headers[name];
    return Array.isArray(value) ? value[0] : value;
  };
  const forwardedProto = headerValue("x-forwarded-proto");
  const proto = (forwardedProto ?? request.protocol).split(",")[0]!.trim();
  const forwardedHost = headerValue("x-forwarded-host");
  const host = (forwardedHost ?? headerValue("host") ?? "")
    .split(",")[0]!
    .trim();
  return `${proto}://${host}${request.url}`;
}

/**
 * Verify the `X-Twilio-Signature` on an inbound Twilio webhook.
 *
 * Safe fallback: if no auth token is configured (dev/local), log a warning and
 * skip verification. When the token IS configured, a missing/invalid signature
 * is rejected before any work happens.
 *
 * @returns true when the request may proceed, false when it was rejected (the
 * reply has already been sent with HTTP 403).
 */
function ensureValidTwilioSignature(
  request: FastifyRequest,
  reply: { code(statusCode: number): { send(payload: unknown): unknown } },
): boolean {
  if (!twilioAuthToken) {
    request.log.warn(
      "TWILIO_AUTH_TOKEN is not set; skipping Twilio webhook signature verification.",
    );
    return true;
  }

  const signature = request.headers["x-twilio-signature"];
  const signatureHeader = Array.isArray(signature) ? signature[0] : signature;
  const params =
    request.body && typeof request.body === "object"
      ? (request.body as Record<string, string>)
      : {};

  const valid = verifyTwilioSignature(
    buildPublicUrl(request),
    params,
    signatureHeader,
    twilioAuthToken,
  );

  if (!valid) {
    request.log.warn(
      { url: request.url },
      "Rejected Twilio webhook with missing or invalid X-Twilio-Signature.",
    );
    reply.code(403).send({ error: "Invalid Twilio signature." });
    return false;
  }

  return true;
}

function ensureValidVoiceEdgeSignature(
  request: FastifyRequest,
  reply: FastifyReply,
): boolean {
  if (!voiceEdgeSecret) {
    request.log.warn(
      "VOICE_EDGE_SECRET is not set; skipping /voice/turn signature verification.",
    );
    return true;
  }

  const timestampHeader = firstHeader(
    request.headers["x-voice-edge-timestamp"],
  );
  const signatureHeader = firstHeader(
    request.headers["x-voice-edge-signature"],
  );
  if (!timestampHeader || !signatureHeader) {
    reply.code(403).send({ error: "Missing voice edge signature." });
    return false;
  }

  const timestamp = Number(timestampHeader);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (
    !Number.isFinite(timestamp) ||
    Math.abs(nowSeconds - timestamp) > 5 * 60
  ) {
    reply.code(403).send({ error: "Stale voice edge signature." });
    return false;
  }

  const rawBody = (request as RequestWithRawBody).rawBody ?? Buffer.alloc(0);
  const expected = createHmac("sha256", voiceEdgeSecret)
    .update(timestampHeader)
    .update(".")
    .update(rawBody)
    .digest("hex");
  const provided = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice("sha256=".length)
    : signatureHeader;
  if (!timingSafeEqualHex(provided, expected)) {
    request.log.warn("Rejected /voice/turn with invalid voice edge signature.");
    reply.code(403).send({ error: "Invalid voice edge signature." });
    return false;
  }

  return true;
}

function timingSafeEqualHex(provided: string, expected: string) {
  const providedBuffer = Buffer.from(provided, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
const client = createDbClient();
const store = new TenantRepository(
  client.db,
  client.db,
  undefined,
  createEnvChannelCredentialCipher(process.env),
);
const engine = createAnswerEngine({
  dataStore: store,
  handoffStore: store,
});
const adapter = new TwilioVoiceAdapter();
const app = Fastify({ logger: true });

await app.register(formBody);
await app.register(rateLimit, {
  max: Number(process.env.VOICE_RATE_LIMIT_MAX ?? 120),
  timeWindow: process.env.VOICE_RATE_LIMIT_WINDOW ?? "1 minute",
});

app.get("/health", async () => ({
  ok: true,
  service: "assaddar-ai-communication-voice",
}));

app.post(
  "/voice/turn",
  {
    config: {
      rateLimit: { max: 30, timeWindow: "1 minute" },
    },
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
    if (!ensureValidVoiceEdgeSignature(request, reply)) {
      return reply;
    }

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

    const conversation =
      await store.findOrCreateConversation(conversationInput);

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
        ? (transferPhoneNumber ?? null)
        : null,
    };
  },
);

app.post("/twilio/voice", async (request, reply) => {
  if (!ensureValidTwilioSignature(request, reply)) {
    return reply;
  }

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
  // Forward to Sentry only when a DSN is configured (otherwise a no-op).
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(error);
  }
  return reply.type("text/xml").send(
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
