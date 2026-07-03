import {
  createClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import { Buffer } from "node:buffer";

export type SupabaseVerifiedUser = {
  authUserId: string;
  email: string;
  name?: string | null;
  expiresAt: Date;
};

export type SupabaseProvisionedUser = {
  authUserId: string;
  email: string;
  name?: string | null;
};

export type SupabaseInviteLink = SupabaseProvisionedUser & {
  acceptUrl: string;
};

export type SupabaseAuthProvider = {
  verifyAccessToken(token: string): Promise<SupabaseVerifiedUser | null>;
  createUser(input: {
    email: string;
    name: string;
    password?: string | undefined;
  }): Promise<SupabaseProvisionedUser>;
  createInviteLink(input: {
    email: string;
    name?: string | undefined;
    redirectTo?: string | undefined;
  }): Promise<SupabaseInviteLink>;
};

type SupabaseAuthProviderConfig = {
  url: string;
  publishableKey: string;
  serviceRoleKey?: string | undefined;
};

export function createSupabaseAuthProvider(
  config: SupabaseAuthProviderConfig,
): SupabaseAuthProvider {
  const publicClient = createSupabaseServerClient(
    config.url,
    config.publishableKey,
  );
  const adminClient = config.serviceRoleKey
    ? createSupabaseServerClient(config.url, config.serviceRoleKey)
    : null;

  async function requireAdminClient() {
    if (!adminClient) {
      throw new Error(
        "SUPABASE_SERVICE_ROLE_KEY is required for user provisioning.",
      );
    }
    return adminClient;
  }

  return {
    async verifyAccessToken(token) {
      const { data, error } = await publicClient.auth.getUser(token);
      const user = error ? null : data.user;
      const email = normalizeEmail(user?.email);
      if (!user || !email) {
        return null;
      }

      return {
        authUserId: user.id,
        email,
        name: userName(user),
        expiresAt:
          parseJwtExpiresAt(token) ?? new Date(Date.now() + 60 * 60 * 1000),
      };
    },

    async createUser(input) {
      const client = await requireAdminClient();
      const email = normalizeEmail(input.email);
      if (!email) {
        throw new Error("Valid email is required.");
      }

      const attributes = {
        email,
        ...(input.password ? { password: input.password } : {}),
        email_confirm: true,
        user_metadata: {
          name: input.name,
        },
      };
      const { data, error } = await client.auth.admin.createUser(attributes);
      if (!error && data.user) {
        return provisionedUser(data.user, input.name);
      }

      const existing = await findAuthUserByEmail(client, email);
      if (!existing) {
        throw error ?? new Error("Failed to create Supabase auth user.");
      }

      const { data: updated, error: updateError } =
        await client.auth.admin.updateUserById(existing.id, {
          ...(input.password ? { password: input.password } : {}),
          user_metadata: {
            ...(existing.user_metadata ?? {}),
            name: input.name,
          },
        });
      if (updateError) {
        throw updateError;
      }
      return provisionedUser(updated.user ?? existing, input.name);
    },

    async createInviteLink(input) {
      const client = await requireAdminClient();
      const email = normalizeEmail(input.email);
      if (!email) {
        throw new Error("Valid email is required.");
      }

      const { data, error } = await client.auth.admin.generateLink({
        type: "invite",
        email,
        options: {
          ...(input.redirectTo ? { redirectTo: input.redirectTo } : {}),
          data: input.name ? { name: input.name } : {},
        },
      });
      if (error) {
        throw error;
      }

      const user = data.user ?? (await findAuthUserByEmail(client, email));
      const acceptUrl = data.properties?.action_link;
      if (!user || !acceptUrl) {
        throw new Error("Failed to create Supabase invite link.");
      }
      return {
        ...provisionedUser(user, input.name),
        acceptUrl,
      };
    },
  };
}

function createSupabaseServerClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function findAuthUserByEmail(client: SupabaseClient, email: string) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return null;
  }

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) {
      throw error;
    }
    const match =
      data.users.find(
        (user) => normalizeEmail(user.email) === normalizedEmail,
      ) ?? null;
    if (match || data.users.length < 1000) {
      return match;
    }
  }
  return null;
}

function provisionedUser(user: User, fallbackName?: string | null) {
  const email = normalizeEmail(user.email);
  if (!email) {
    throw new Error("Supabase auth user does not have an email.");
  }
  return {
    authUserId: user.id,
    email,
    name: userName(user) ?? fallbackName ?? email,
  };
}

function userName(user: User) {
  const metadata = user.user_metadata ?? {};
  const name = metadata.name ?? metadata.full_name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

function normalizeEmail(value?: string | null) {
  const normalized = value?.trim().toLowerCase();
  return normalized && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
    ? normalized
    : null;
}

function parseJwtExpiresAt(token: string) {
  const [, payload] = token.split(".");
  if (!payload) {
    return null;
  }
  try {
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as {
      exp?: unknown;
    };
    return typeof decoded.exp === "number"
      ? new Date(decoded.exp * 1000)
      : null;
  } catch {
    return null;
  }
}
