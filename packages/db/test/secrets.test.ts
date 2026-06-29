import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  AesGcmChannelCredentialCipher,
  createEnvChannelCredentialCipher,
} from "../src";

const context = {
  tenantId: "tenant-1",
  channel: "whatsapp",
  provider: "meta-whatsapp-cloud",
  credential: "access_token" as const,
};

describe("channel credential encryption", () => {
  it("round-trips credentials without storing plaintext", () => {
    const cipher = new AesGcmChannelCredentialCipher(randomBytes(32));

    const encrypted = cipher.encrypt("secret-access-token", context);

    expect(encrypted).toMatch(/^v1:/);
    expect(encrypted).not.toContain("secret-access-token");
    expect(cipher.decrypt(encrypted, context)).toBe("secret-access-token");
  });

  it("binds ciphertext to tenant/channel/provider credential context", () => {
    const cipher = new AesGcmChannelCredentialCipher(randomBytes(32));
    const encrypted = cipher.encrypt("secret-access-token", context);

    expect(() =>
      cipher.decrypt(encrypted, {
        ...context,
        tenantId: "tenant-2",
      }),
    ).toThrow();
    expect(() =>
      cipher.decrypt(encrypted, {
        ...context,
        credential: "refresh_token",
      }),
    ).toThrow();
  });

  it("supports env master keys and stays disabled when unset", () => {
    expect(createEnvChannelCredentialCipher({})).toBeNull();

    const cipher = createEnvChannelCredentialCipher({
      CHANNEL_CREDENTIAL_MASTER_KEY:
        "base64:YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE=",
    });

    expect(cipher).not.toBeNull();
    const encrypted = cipher!.encrypt("secret-access-token", context);
    expect(cipher!.decrypt(encrypted, context)).toBe("secret-access-token");
  });
});
