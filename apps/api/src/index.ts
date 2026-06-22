import { config } from "dotenv";
import { createDbClient, TenantRepository } from "@assaddar/db";
import { loadEnv } from "./env";
import { buildServer, type BuildServerOptions } from "./server";

config({ path: new URL("../../../.env", import.meta.url) });

async function main() {
  const env = loadEnv();
  const client = createDbClient();
  const store = new TenantRepository(client.db);
  const serverOptions: BuildServerOptions = {
    store,
    adminToken: env.ADMIN_API_TOKEN,
    allowedOrigins: env.WIDGET_ALLOWED_ORIGINS.split(",").map((origin) => origin.trim()),
    metaVerifyToken: env.META_VERIFY_TOKEN,
    metaGraphApiVersion: env.META_GRAPH_API_VERSION,
    adminUser: {
      email: env.ADMIN_USER_EMAIL,
      name: env.ADMIN_USER_NAME,
      role: env.ADMIN_USER_ROLE
    }
  };
  if (env.LEAD_NOTIFICATION_WEBHOOK_URL) {
    serverOptions.leadNotificationWebhookUrl = env.LEAD_NOTIFICATION_WEBHOOK_URL;
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
        : {})
    };
  }
  if (env.WHATSAPP_ACCESS_TOKEN) {
    serverOptions.whatsappAccessToken = env.WHATSAPP_ACCESS_TOKEN;
  }
  if (env.MESSENGER_PAGE_ACCESS_TOKEN) {
    serverOptions.messengerPageAccessToken = env.MESSENGER_PAGE_ACCESS_TOKEN;
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
    port: env.API_PORT
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
