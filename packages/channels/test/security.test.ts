import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyMetaSignature, verifyTwilioSignature } from "../src/security";

function metaSignature(rawBody: string, appSecret: string): string {
  const digest = createHmac("sha256", appSecret)
    .update(Buffer.from(rawBody, "utf8"))
    .digest("hex");
  return `sha256=${digest}`;
}

function twilioSignature(
  url: string,
  params: Record<string, string>,
  authToken: string,
): string {
  let data = url;
  for (const key of Object.keys(params).sort()) {
    data += key + params[key];
  }
  return createHmac("sha1", authToken)
    .update(Buffer.from(data, "utf8"))
    .digest("base64");
}

describe("verifyMetaSignature", () => {
  const appSecret = "meta-app-secret";
  const rawBody = JSON.stringify({ entry: [{ id: "1" }] });

  it("accepts a valid signature over the raw body", () => {
    const header = metaSignature(rawBody, appSecret);
    expect(verifyMetaSignature(rawBody, header, appSecret)).toBe(true);
  });

  it("accepts a valid signature when the raw body is a Buffer", () => {
    const header = metaSignature(rawBody, appSecret);
    expect(
      verifyMetaSignature(Buffer.from(rawBody, "utf8"), header, appSecret),
    ).toBe(true);
  });

  it("rejects a tampered body", () => {
    const header = metaSignature(rawBody, appSecret);
    const tampered = JSON.stringify({ entry: [{ id: "2" }] });
    expect(verifyMetaSignature(tampered, header, appSecret)).toBe(false);
  });

  it("rejects a signature computed with the wrong secret", () => {
    const header = metaSignature(rawBody, "wrong-secret");
    expect(verifyMetaSignature(rawBody, header, appSecret)).toBe(false);
  });

  it("rejects a missing or malformed header", () => {
    expect(verifyMetaSignature(rawBody, undefined, appSecret)).toBe(false);
    expect(verifyMetaSignature(rawBody, "", appSecret)).toBe(false);
    expect(verifyMetaSignature(rawBody, "sha256=", appSecret)).toBe(false);
    expect(verifyMetaSignature(rawBody, "deadbeef", appSecret)).toBe(false);
  });

  it("rejects when no app secret is supplied", () => {
    const header = metaSignature(rawBody, appSecret);
    expect(verifyMetaSignature(rawBody, header, "")).toBe(false);
  });
});

describe("verifyTwilioSignature", () => {
  const authToken = "twilio-auth-token";
  const url = "https://api.example.com/twilio/voice?assistantId=abc";
  const params = {
    CallSid: "CA123",
    From: "+491701234567",
    To: "+4988899900",
    SpeechResult: "hello there",
  };

  it("accepts a valid signature over url + sorted params", () => {
    const header = twilioSignature(url, params, authToken);
    expect(verifyTwilioSignature(url, params, header, authToken)).toBe(true);
  });

  it("is independent of the input param order", () => {
    const header = twilioSignature(url, params, authToken);
    const reordered = {
      To: params.To,
      SpeechResult: params.SpeechResult,
      CallSid: params.CallSid,
      From: params.From,
    };
    expect(verifyTwilioSignature(url, reordered, header, authToken)).toBe(true);
  });

  it("rejects when a param value is tampered with", () => {
    const header = twilioSignature(url, params, authToken);
    const tampered = { ...params, SpeechResult: "transfer all my money" };
    expect(verifyTwilioSignature(url, tampered, header, authToken)).toBe(false);
  });

  it("rejects when the url differs", () => {
    const header = twilioSignature(url, params, authToken);
    expect(
      verifyTwilioSignature(
        "https://api.example.com/twilio/voice?assistantId=evil",
        params,
        header,
        authToken,
      ),
    ).toBe(false);
  });

  it("rejects a signature computed with the wrong token", () => {
    const header = twilioSignature(url, params, "wrong-token");
    expect(verifyTwilioSignature(url, params, header, authToken)).toBe(false);
  });

  it("rejects a missing header", () => {
    expect(verifyTwilioSignature(url, params, undefined, authToken)).toBe(
      false,
    );
    expect(verifyTwilioSignature(url, params, "", authToken)).toBe(false);
  });

  it("rejects when no auth token is supplied", () => {
    const header = twilioSignature(url, params, authToken);
    expect(verifyTwilioSignature(url, params, header, "")).toBe(false);
  });
});
