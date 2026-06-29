import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/env";

const baseEnv = {
  ADMIN_USER_EMAIL: "owner@example.com",
  WIDGET_ALLOWED_ORIGINS: "http://localhost:3000",
};

describe("loadEnv", () => {
  it("throws in production when default admin token is still set", () => {
    expect(() =>
      loadEnv({
        ...baseEnv,
        NODE_ENV: "production",
        ADMIN_API_TOKEN: "change-me-dev-admin-token",
        META_VERIFY_TOKEN: "a-secure-verify-token",
        META_APP_SECRET: "a-secure-meta-app-secret",
      }),
    ).toThrow(/ADMIN_API_TOKEN/);
  });

  it("throws in production when default meta verify token is still set", () => {
    expect(() =>
      loadEnv({
        ...baseEnv,
        NODE_ENV: "production",
        ADMIN_API_TOKEN: "a-secure-admin-token",
        META_VERIFY_TOKEN: "change-me-meta-verify-token",
        META_APP_SECRET: "a-secure-meta-app-secret",
      }),
    ).toThrow(/META_VERIFY_TOKEN/);
  });

  it("throws in production when meta app secret is missing", () => {
    expect(() =>
      loadEnv({
        ...baseEnv,
        NODE_ENV: "production",
        ADMIN_API_TOKEN: "a-secure-admin-token",
        META_VERIFY_TOKEN: "a-secure-verify-token",
      }),
    ).toThrow(/META_APP_SECRET/);
  });

  it("boots in production when secure values are provided", () => {
    const env = loadEnv({
      ...baseEnv,
      NODE_ENV: "production",
      ADMIN_API_TOKEN: "a-secure-admin-token",
      META_VERIFY_TOKEN: "a-secure-verify-token",
      META_APP_SECRET: "a-secure-meta-app-secret",
    });
    expect(env.ADMIN_API_TOKEN).toBe("a-secure-admin-token");
  });

  it("keeps development defaults working", () => {
    const env = loadEnv({ ...baseEnv, NODE_ENV: "development" });
    expect(env.ADMIN_API_TOKEN).toBe("change-me-dev-admin-token");
    expect(env.META_VERIFY_TOKEN).toBe("change-me-meta-verify-token");
  });
});
