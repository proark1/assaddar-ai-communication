/**
 * Typed application errors.
 *
 * Handlers can `throw new NotFoundError(...)` instead of repeating
 * `reply.code(404).send({ error })` everywhere; the central error handler in
 * `server.ts` maps these to responses. Each error carries a machine-readable
 * `code` and an HTTP `statusCode`, and only ever exposes its `message` to the
 * client — never internal details.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
  }

  toResponse(): { error: string; code: string } {
    return { error: this.message, code: this.code };
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed.") {
    super(400, "validation_error", message);
  }
}

export class UnauthorizedError extends AppError {
  // Deliberately generic so we never reveal whether an account/resource exists.
  constructor(message = "Authentication required.") {
    super(401, "unauthorized", message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have access to this resource.") {
    super(403, "forbidden", message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found.") {
    super(404, "not_found", message);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Resource already exists.") {
    super(409, "conflict", message);
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many requests.") {
    super(429, "rate_limited", message);
  }
}
