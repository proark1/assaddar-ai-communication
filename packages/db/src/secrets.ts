import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from "node:crypto";

const VERSION = "v1";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export type ChannelCredentialContext = {
  tenantId: string;
  channel: string;
  provider: string;
  credential: "access_token" | "refresh_token";
};

export type ChannelCredentialCipher = {
  encrypt(plaintext: string, context: ChannelCredentialContext): string;
  decrypt(ciphertext: string, context: ChannelCredentialContext): string;
};

export function createEnvChannelCredentialCipher(
  env: { CHANNEL_CREDENTIAL_MASTER_KEY?: string | undefined } = process.env,
): ChannelCredentialCipher | null {
  const value = env.CHANNEL_CREDENTIAL_MASTER_KEY?.trim();
  if (!value) {
    return null;
  }
  return new AesGcmChannelCredentialCipher(parseMasterKey(value));
}

export class AesGcmChannelCredentialCipher implements ChannelCredentialCipher {
  constructor(private readonly key: Buffer) {
    if (key.length !== KEY_BYTES) {
      throw new Error(
        `Channel credential master key must be ${KEY_BYTES} bytes.`,
      );
    }
  }

  encrypt(plaintext: string, context: ChannelCredentialContext): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(contextAad(context));
    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return [
      VERSION,
      base64UrlEncode(iv),
      base64UrlEncode(tag),
      base64UrlEncode(encrypted),
    ].join(":");
  }

  decrypt(ciphertext: string, context: ChannelCredentialContext): string {
    const [version, ivValue, tagValue, encryptedValue] = ciphertext.split(":");
    if (version !== VERSION || !ivValue || !tagValue || !encryptedValue) {
      throw new Error("Unsupported channel credential ciphertext format.");
    }

    const iv = base64UrlDecode(ivValue);
    const tag = base64UrlDecode(tagValue);
    const encrypted = base64UrlDecode(encryptedValue);
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
      throw new Error("Invalid channel credential ciphertext.");
    }

    const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAAD(contextAad(context));
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf8");
  }
}

function parseMasterKey(value: string): Buffer {
  if (value.startsWith("base64:")) {
    const key = Buffer.from(value.slice("base64:".length), "base64");
    if (key.length !== KEY_BYTES) {
      throw new Error("CHANNEL_CREDENTIAL_MASTER_KEY base64 value is invalid.");
    }
    return key;
  }
  if (value.startsWith("hex:")) {
    const key = Buffer.from(value.slice("hex:".length), "hex");
    if (key.length !== KEY_BYTES) {
      throw new Error("CHANNEL_CREDENTIAL_MASTER_KEY hex value is invalid.");
    }
    return key;
  }
  return scryptSync(value, "assaddar-channel-credentials-v1", KEY_BYTES);
}

function contextAad(context: ChannelCredentialContext): Buffer {
  return createHash("sha256")
    .update(
      [
        VERSION,
        context.tenantId,
        context.channel,
        context.provider,
        context.credential,
      ].join("\0"),
    )
    .digest();
}

function base64UrlEncode(value: Buffer) {
  return value.toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url");
}
