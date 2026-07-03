import { createHmac, timingSafeEqual } from "node:crypto";

export type BillingProvider = {
  createCustomer(input: {
    email: string;
    name: string;
    metadata?: Record<string, string>;
  }): Promise<{ id: string }>;
  createCheckoutSession(input: {
    customerId: string;
    successUrl: string;
    cancelUrl: string;
    numberPriceId: string;
    acceptedCallPriceId?: string | undefined;
    metadata: Record<string, string>;
  }): Promise<{ id: string; url: string }>;
  createCustomerPortalSession(input: {
    customerId: string;
    returnUrl: string;
  }): Promise<{ url: string }>;
  verifyWebhook(input: {
    rawBody: Buffer;
    signatureHeader: string | undefined;
  }): StripeWebhookEvent;
  reportMeterEvent(input: {
    identifier: string;
    eventName: string;
    customerId: string;
    value: number;
    timestamp?: Date | undefined;
    metadata?: Record<string, string> | undefined;
  }): Promise<{ id: string }>;
};

export type StripeWebhookEvent = {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
};

export type StripeBillingConfig = {
  secretKey: string;
  webhookSecret: string;
};

const stripeApiBase = "https://api.stripe.com";

export function createStripeBillingProvider(
  config: StripeBillingConfig,
): BillingProvider {
  return {
    async createCustomer(input) {
      const response = await stripeFormRequest<{ id: string }>(
        config.secretKey,
        "/v1/customers",
        {
          email: input.email,
          name: input.name,
          ...metadataParams(input.metadata),
        },
      );
      return { id: response.id };
    },

    async createCheckoutSession(input) {
      const params: Record<string, string> = {
        mode: "subscription",
        customer: input.customerId,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        "line_items[0][price]": input.numberPriceId,
        "line_items[0][quantity]": "1",
        ...metadataParams(input.metadata),
        ...subscriptionMetadataParams(input.metadata),
      };
      if (input.acceptedCallPriceId) {
        params["line_items[1][price]"] = input.acceptedCallPriceId;
      }
      const response = await stripeFormRequest<{ id: string; url?: string }>(
        config.secretKey,
        "/v1/checkout/sessions",
        params,
      );
      if (!response.url) {
        throw new Error("Stripe checkout session did not include a URL.");
      }
      return { id: response.id, url: response.url };
    },

    async createCustomerPortalSession(input) {
      const response = await stripeFormRequest<{ url?: string }>(
        config.secretKey,
        "/v1/billing_portal/sessions",
        {
          customer: input.customerId,
          return_url: input.returnUrl,
        },
      );
      if (!response.url) {
        throw new Error(
          "Stripe customer portal session did not include a URL.",
        );
      }
      return { url: response.url };
    },

    verifyWebhook(input) {
      return verifyStripeWebhook(input.rawBody, input.signatureHeader, config);
    },

    async reportMeterEvent(input) {
      const response = await fetch(`${stripeApiBase}/v2/billing/meter_events`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.secretKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          identifier: input.identifier,
          event_name: input.eventName,
          timestamp: (input.timestamp ?? new Date()).toISOString(),
          payload: {
            stripe_customer_id: input.customerId,
            value: String(input.value),
          },
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const payload = await readStripePayload(response);
      if (!response.ok) {
        throw stripeError(payload);
      }
      const id =
        typeof payload.identifier === "string"
          ? payload.identifier
          : input.identifier;
      return { id };
    },
  };
}

function verifyStripeWebhook(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  config: StripeBillingConfig,
): StripeWebhookEvent {
  if (!signatureHeader) {
    throw new Error("Missing Stripe signature.");
  }
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key, value];
    }),
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) {
    throw new Error("Invalid Stripe signature header.");
  }
  const signedPayload = Buffer.concat([Buffer.from(`${timestamp}.`), rawBody]);
  const expected = createHmac("sha256", config.webhookSecret)
    .update(signedPayload)
    .digest("hex");
  if (!timingSafeHexEqual(signature, expected)) {
    throw new Error("Invalid Stripe signature.");
  }
  const ageSeconds = Math.abs(
    Math.floor(Date.now() / 1000) - Number(timestamp),
  );
  if (!Number.isFinite(ageSeconds) || ageSeconds > 5 * 60) {
    throw new Error("Stale Stripe signature.");
  }
  const parsed = JSON.parse(rawBody.toString("utf8")) as StripeWebhookEvent;
  if (!parsed.id || !parsed.type || !parsed.data?.object) {
    throw new Error("Invalid Stripe webhook payload.");
  }
  return parsed;
}

async function stripeFormRequest<T>(
  secretKey: string,
  path: string,
  params: Record<string, string | undefined>,
): Promise<T> {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      body.set(key, value);
    }
  }
  const response = await fetch(`${stripeApiBase}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secretKey}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await readStripePayload(response);
  if (!response.ok) {
    throw stripeError(payload);
  }
  return payload as T;
}

async function readStripePayload(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await response.json()) as Record<string, unknown>;
  }
  return { error: { message: await response.text() } };
}

function stripeError(payload: Record<string, unknown>) {
  const error = payload.error;
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message)
      : "Stripe request failed.";
  return new Error(message);
}

function metadataParams(metadata: Record<string, string> | undefined) {
  return Object.fromEntries(
    Object.entries(metadata ?? {}).map(([key, value]) => [
      `metadata[${key}]`,
      value,
    ]),
  );
}

function subscriptionMetadataParams(metadata: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      `subscription_data[metadata][${key}]`,
      value,
    ]),
  );
}

function timingSafeHexEqual(provided: string, expected: string) {
  const providedBuffer = Buffer.from(provided, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}
