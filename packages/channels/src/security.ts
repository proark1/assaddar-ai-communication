import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Constant-time comparison of two ASCII/hex strings. Returns false when the
 * lengths differ (which is itself not secret) and otherwise compares the bytes
 * without leaking timing information about where they first diverge.
 */
function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}

/**
 * Verify Meta's `X-Hub-Signature-256` header for inbound webhooks.
 *
 * Meta signs the RAW request body with HMAC-SHA256 using the app secret and
 * sends the result as `sha256=<hex digest>`. The caller MUST pass the exact raw
 * bytes/string Meta sent (not a re-serialised JSON object), otherwise the digest
 * will not match.
 *
 * @param rawBody The raw request body exactly as received.
 * @param signatureHeader The value of the `X-Hub-Signature-256` header.
 * @param appSecret The Meta app secret.
 * @returns true when the signature is present, well-formed, and valid.
 */
export function verifyMetaSignature(
  rawBody: string | Buffer,
  signatureHeader: string | undefined | null,
  appSecret: string,
): boolean {
  if (!signatureHeader || !appSecret) {
    return false;
  }

  const prefix = "sha256=";
  if (!signatureHeader.startsWith(prefix)) {
    return false;
  }

  const provided = signatureHeader.slice(prefix.length).trim();
  if (!provided) {
    return false;
  }

  const expected = createHmac("sha256", appSecret)
    .update(
      typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody,
    )
    .digest("hex");

  return timingSafeEqualStrings(provided.toLowerCase(), expected.toLowerCase());
}

/**
 * Verify Twilio's `X-Twilio-Signature` header for inbound webhooks.
 *
 * Twilio builds the signature by concatenating the full request URL with each
 * POST parameter (sorted alphabetically by key, key and value concatenated with
 * no separator), then taking the base64-encoded HMAC-SHA1 of that string using
 * the account auth token.
 *
 * @param url The full request URL Twilio invoked (scheme, host, path, query).
 * @param params The POST form parameters Twilio sent.
 * @param signatureHeader The value of the `X-Twilio-Signature` header.
 * @param authToken The Twilio account auth token.
 * @returns true when the signature is present and valid.
 */
export function verifyTwilioSignature(
  url: string,
  params: Record<string, string> | undefined | null,
  signatureHeader: string | undefined | null,
  authToken: string,
): boolean {
  if (!signatureHeader || !authToken) {
    return false;
  }

  const safeParams = params ?? {};
  let data = url;
  for (const key of Object.keys(safeParams).sort()) {
    data += key + safeParams[key];
  }

  const expected = createHmac("sha1", authToken)
    .update(Buffer.from(data, "utf8"))
    .digest("base64");

  return timingSafeEqualStrings(signatureHeader, expected);
}
