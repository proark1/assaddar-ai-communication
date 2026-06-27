/**
 * Error-capture seam.
 *
 * `captureException` is the single place the API funnels unexpected errors
 * through. Today it (a) logs the error in structured form via the app/request
 * logger and (b) bumps the `errors_total` metric. It is written so a real
 * error reporter can be dropped in later without touching call sites.
 *
 * To enable Sentry, install @sentry/node and forward here when SENTRY_DSN is
 * set — e.g. initialise the SDK once at startup and call
 * `Sentry.captureException(error, { extra: context })` below, guarded by the
 * env flag. No call site needs to change.
 */
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

  // To enable Sentry, install @sentry/node and forward here when SENTRY_DSN is
  // set, e.g.:
  //   if (process.env.SENTRY_DSN) {
  //     Sentry.captureException(error, { extra: context });
  //   }
}
