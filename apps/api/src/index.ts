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
    metaVerifyToken: env.META_VERIFY_TOKEN
  };
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
