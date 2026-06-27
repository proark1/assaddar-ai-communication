/**
 * Error-capture seam.
 *
 * `captureException` is the single place the API funnels unexpected errors
 * through. It (a) logs the error in structured form via the app/request logger,
 * (b) bumps the `errors_total` metric, and (c) forwards to Sentry when
 * SENTRY_DSN is set (the SDK is initialised once at startup in `index.ts`,
 * also gated on the DSN). When the DSN is unset, the Sentry forward is skipped
 * and behaviour is unchanged. No call site needs to change.
 */
import * as Sentry from "@sentry/node";
import type { FastifyBaseLogger } from "fastify";
import type { MetricsRegistry } from "./metrics";

export type CaptureContext = Record<string, unknown>;

/** Derive a low-cardinality label for the error (its constructor name). */
function errorKind(error: unknown): string {
  if (error instanceof Error && error.name) {
    return error.name;
  }
  return "Unknown";
}

/**
 * Log an error in structured form and increment the `errors_total` metric.
 *
 * @param logger  A Fastify logger — prefer `request.log` so the correlation id
 *                is attached; fall back to `app.log` outside a request.
 * @param metrics The process metrics registry.
 * @param error   The thrown value (any type).
 * @param context Optional extra fields to attach to the log line / future
 *                reporter (must not contain secrets or tenant PII).
 */
export function captureException(
  logger: FastifyBaseLogger,
  metrics: MetricsRegistry,
  error: unknown,
  context?: CaptureContext,
): void {
  const kind = errorKind(error);
  metrics.errorsTotal.inc({ kind });

  // Structured log: pass the error under `err` so pino serializes it, plus any
  // caller-supplied context fields.
  logger.error({ err: error, ...(context ?? {}) }, "Unhandled error captured");

  // Forward to Sentry only when a DSN is configured; otherwise the SDK was never
  // initialised and this is a no-op anyway. Gated so behaviour is unchanged when
  // SENTRY_DSN is unset. Attach the caller context as `extra` when present.
  if (process.env.SENTRY_DSN) {
    if (context) {
      Sentry.captureException(error, { extra: context });
    } else {
      Sentry.captureException(error);
    }
  }
}
