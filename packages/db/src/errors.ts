/**
 * Thrown when a tenant tries to claim a provider account id (a WhatsApp
 * phone-number id or a Meta page id) that another tenant already owns. A
 * provider account identifies one business at the provider, so it must map to
 * exactly one tenant here — otherwise a customer's inbound messages could route
 * to the wrong workspace. The API surfaces this as a 409.
 */
export class ChannelAccountConflictError extends Error {
  readonly code = "channel_account_conflict";

  constructor(
    message = "This channel account is already connected to another workspace.",
  ) {
    super(message);
    this.name = "ChannelAccountConflictError";
  }
}

/**
 * Detect a Postgres unique-violation (SQLSTATE 23505) on a specific constraint,
 * across driver error shapes. Used to turn a raced/duplicate insert into a
 * meaningful domain error instead of an opaque 500.
 *
 * drizzle wraps the driver error, so the SQLSTATE / constraint metadata lives on
 * a nested `cause` rather than the thrown error itself. Walk the cause chain so
 * the check works whether it is handed the raw PostgresError or drizzle's
 * wrapper — otherwise the conflict is missed and the caller returns a 500.
 */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  let current: unknown = error;
  for (
    let depth = 0;
    depth < 5 && current && typeof current === "object";
    depth += 1
  ) {
    const candidate = current as {
      code?: unknown;
      constraint_name?: unknown;
      message?: unknown;
      cause?: unknown;
    };
    if (
      candidate.code === "23505" &&
      (candidate.constraint_name === constraint ||
        (typeof candidate.message === "string" &&
          candidate.message.includes(constraint)))
    ) {
      return true;
    }
    current = candidate.cause;
  }
  return false;
}
