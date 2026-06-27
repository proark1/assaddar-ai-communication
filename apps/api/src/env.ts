import { z } from "zod";

export const EnvSchema = z.object({
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  ADMIN_API_TOKEN: z.string().min(8).default("change-me-dev-admin-token"),
  WIDGET_ALLOWED_ORIGINS: z
    .string()
    .default("http://localhost:5174,http://localhost:3000"),
  META_VERIFY_TOKEN: z.string().default("change-me-meta-verify-token"),
  META_GRAPH_API_VERSION: z.string().default("v25.0"),
  ADMIN_PUBLIC_URL: z.string().url().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  MESSENGER_PAGE_ACCESS_TOKEN: z.string().optional(),
  VOICE_PUBLIC_URL: z.string().url().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  ADMIN_USER_EMAIL: z.string().email().default("owner@assad-dar.de"),
  ADMIN_USER_NAME: z.string().default("Assad Dar"),
  ADMIN_USER_ROLE: z
    .enum(["owner", "admin", "operator", "viewer"])
    .default("owner"),
  LEAD_NOTIFICATION_WEBHOOK_URL: z.string().url().optional(),
  LEAD_NOTIFICATION_EMAIL_TO: z.string().email().optional(),
  LEAD_NOTIFICATION_EMAIL_FROM: z.string().email().optional(),
  LEAD_NOTIFICATION_SMTP_HOST: z.string().optional(),
  LEAD_NOTIFICATION_SMTP_PORT: z.coerce.number().int().positive().optional(),
  LEAD_NOTIFICATION_SMTP_SECURE: z.coerce.boolean().optional(),
  LEAD_NOTIFICATION_SMTP_USER: z.string().optional(),
  LEAD_NOTIFICATION_SMTP_PASSWORD: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(env = process.env): Env {
  return EnvSchema.parse({
    ...env,
    API_PORT: env.API_PORT ?? env.PORT,
  });
}
