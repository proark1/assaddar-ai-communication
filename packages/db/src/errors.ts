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
 */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const candidate = error as {
    code?: unknown;
    constraint_name?: unknown;
    message?: unknown;
  };
  if (candidate.code !== "23505") {
    return false;
  }
  return (
    candidate.constraint_name === constraint ||
    (typeof candidate.message === "string" &&
      candidate.message.includes(constraint))
  );
}
