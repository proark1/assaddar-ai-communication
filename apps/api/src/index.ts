import { config } from "dotenv";
import * as Sentry from "@sentry/node";
import {
  createEmbeddingProvider,
  createGeminiDraftAnswerGenerator,
  createGeminiGroundedAnswerGenerator,
  createOneBrainProvider,
} from "@assaddar/core";
import {
  createDbClient,
  createEnvChannelCredentialCipher,
  TenantRepository,
} from "@assaddar/db";
import { loadEnv } from "./env";
import { buildServer, type BuildServerOptions } from "./server";
import { createStripeBillingProvider } from "./billing";
import { createSupabaseAuthProvider } from "./supabase-auth";

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

async function main() {
  initSentry();
  const env = loadEnv();
  const client = createDbClient();
  const store = new TenantRepository(
    client.db,
    client.db,
    undefined,
    createEnvChannelCredentialCipher(process.env),
  );
  const embeddingProvider = createEmbeddingProvider(process.env);
  const groundedGenerator = createGeminiGroundedAnswerGenerator(process.env);
  const draftGenerator = createGeminiDraftAnswerGenerator(process.env);
  const oneBrainProvider = createOneBrainProvider(process.env);
  const oneBrainAnswerEnabled =
    (process.env.ONEBRAIN_ANSWER_ENABLED ?? "").toLowerCase() === "true";
  const serverOptions: BuildServerOptions = {
    store,
    adminToken: env.ADMIN_API_TOKEN,
    allowedOrigins: env.WIDGET_ALLOWED_ORIGINS.split(",").map((origin) =>
      origin.trim(),
    ),
    metaVerifyToken: env.META_VERIFY_TOKEN,
    metaGraphApiVersion: env.META_GRAPH_API_VERSION,
    adminUser: {
      email: env.ADMIN_USER_EMAIL,
      name: env.ADMIN_USER_NAME,
      role: env.ADMIN_USER_ROLE,
    },
  };
  if (env.ADMIN_PUBLIC_URL) {
    serverOptions.adminPublicUrl = env.ADMIN_PUBLIC_URL;
  }
  const supabasePublishableKey =
    env.SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_ANON_KEY;
  const supabaseServiceRoleKey =
    env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
  if (env.SUPABASE_URL && supabasePublishableKey) {
    serverOptions.supabaseAuth = createSupabaseAuthProvider({
      url: env.SUPABASE_URL,
      publishableKey: supabasePublishableKey,
      serviceRoleKey: supabaseServiceRoleKey,
    });
  }
  if (env.LEAD_NOTIFICATION_WEBHOOK_URL) {
    serverOptions.leadNotificationWebhookUrl =
      env.LEAD_NOTIFICATION_WEBHOOK_URL;
  }
  if (env.LEAD_NOTIFICATION_EMAIL_TO) {
    serverOptions.leadNotificationEmailTo = env.LEAD_NOTIFICATION_EMAIL_TO;
  }
  if (env.LEAD_NOTIFICATION_SMTP_HOST && env.LEAD_NOTIFICATION_EMAIL_TO) {
    const smtpPort = env.LEAD_NOTIFICATION_SMTP_PORT ?? 465;
    serverOptions.leadNotificationSmtp = {
      host: env.LEAD_NOTIFICATION_SMTP_HOST,
      port: smtpPort,
      secure: env.LEAD_NOTIFICATION_SMTP_SECURE ?? smtpPort === 465,
      from: env.LEAD_NOTIFICATION_EMAIL_FROM ?? env.ADMIN_USER_EMAIL,
      ...(env.LEAD_NOTIFICATION_SMTP_USER
        ? { username: env.LEAD_NOTIFICATION_SMTP_USER }
        : {}),
      ...(env.LEAD_NOTIFICATION_SMTP_PASSWORD
        ? { password: env.LEAD_NOTIFICATION_SMTP_PASSWORD }
        : {}),
    };
  }
  if (env.WHATSAPP_ACCESS_TOKEN) {
    serverOptions.whatsappAccessToken = env.WHATSAPP_ACCESS_TOKEN;
  }
  if (env.MESSENGER_PAGE_ACCESS_TOKEN) {
    serverOptions.messengerPageAccessToken = env.MESSENGER_PAGE_ACCESS_TOKEN;
  }
  if (env.META_APP_SECRET) {
    serverOptions.metaAppSecret = env.META_APP_SECRET;
  }
  if (env.VOICE_PUBLIC_URL) {
    serverOptions.voicePublicUrl = env.VOICE_PUBLIC_URL;
  }
  if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN) {
    serverOptions.twilioAccountSid = env.TWILIO_ACCOUNT_SID;
    serverOptions.twilioAuthToken = env.TWILIO_AUTH_TOKEN;
  }
  if (env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET) {
    serverOptions.billingProvider = createStripeBillingProvider({
      secretKey: env.STRIPE_SECRET_KEY,
      webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    });
  }
  serverOptions.billing = {
    selfServiceEnabled: env.SELF_SERVICE_ONBOARDING_ENABLED,
    ...(env.STRIPE_NUMBER_PRICE_ID
      ? { numberPriceId: env.STRIPE_NUMBER_PRICE_ID }
      : {}),
    ...(env.STRIPE_ACCEPTED_CALL_PRICE_ID
      ? { acceptedCallPriceId: env.STRIPE_ACCEPTED_CALL_PRICE_ID }
      : {}),
    ...(env.STRIPE_ACCEPTED_CALL_METER_EVENT_NAME
      ? {
          acceptedCallMeterEventName: env.STRIPE_ACCEPTED_CALL_METER_EVENT_NAME,
        }
      : {}),
    ...(env.STRIPE_CUSTOMER_PORTAL_RETURN_URL
      ? { customerPortalReturnUrl: env.STRIPE_CUSTOMER_PORTAL_RETURN_URL }
      : {}),
  };
  if (embeddingProvider) {
    serverOptions.embedder = async (text) => {
      const [vector] = await embeddingProvider.embed([text]);
      return vector ?? null;
    };
  }
  if (groundedGenerator) {
    serverOptions.groundedGenerator = groundedGenerator;
  }
  if (draftGenerator) {
    serverOptions.draftGenerator = draftGenerator;
  }
  if (
    oneBrainAnswerEnabled ||
    process.env.ONEBRAIN_API_BASE_URL ||
    process.env.ONEBRAIN_SERVICE_KEY
  ) {
    serverOptions.oneBrainAnswer = {
      enabled: oneBrainAnswerEnabled,
      provider: oneBrainProvider,
      env: process.env,
    };
    serverOptions.oneBrainDataLayer = {
      provider: oneBrainProvider,
      env: process.env,
    };
  }

  const app = await buildServer(serverOptions);

  const close = async () => {
    await app.close();
    await client.close();
  };
  process.on("SIGTERM", close);
  process.on("SIGINT", close);

  await app.listen({
    host: env.API_HOST,
    port: env.API_PORT,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
