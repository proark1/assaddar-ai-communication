import { z } from "zod";

export const EnvSchema = z.object({
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  ADMIN_API_TOKEN: z.string().min(8).default("change-me-dev-admin-token"),
  WIDGET_ALLOWED_ORIGINS: z
    .string()
    .default("http://localhost:5174,http://localhost:3000"),
  META_VERIFY_TOKEN: z.string().default("change-me-meta-verify-token"),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  MESSENGER_PAGE_ACCESS_TOKEN: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(env = process.env): Env {
  return EnvSchema.parse({
    ...env,
    API_PORT: env.API_PORT ?? env.PORT,
  });
}
