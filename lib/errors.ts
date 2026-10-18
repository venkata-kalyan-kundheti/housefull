/**
 * lib/errors.ts
 *
 * Typed error classes with stable error codes as specified in Section 17.
 */

export abstract class AppError extends Error {
  abstract readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, status = 500, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ConfigError extends AppError {
  readonly code = "CONFIG_INVALID";
  constructor(message: string, details?: unknown) {
    super(message, 500, details);
  }
}

export class ValidationError extends AppError {
  readonly code = "VALIDATION_FAILED";
  constructor(message: string, details?: unknown) {
    super(message, 400, details);
  }
}

export class NotFoundError extends AppError {
  readonly code:
    | "SHOW_NOT_FOUND"
    | "BRIEF_NOT_FOUND"
    | "CAMPAIGN_NOT_FOUND"
    | "EXPERIMENT_NOT_FOUND"
    | "OFFER_NOT_FOUND";

  constructor(
    code:
      | "SHOW_NOT_FOUND"
      | "BRIEF_NOT_FOUND"
      | "CAMPAIGN_NOT_FOUND"
      | "EXPERIMENT_NOT_FOUND"
      | "OFFER_NOT_FOUND",
    message: string
  ) {
    super(message, 404);
    this.code = code;
  }
}

export class ConflictError extends AppError {
  readonly code = "SHOW_ALREADY_STARTED";
  constructor(message = "Show has already started or starts in less than 1 hour") {
    super(message, 409);
  }
}

export class AuthError extends AppError {
  readonly code = "UNAUTHORIZED";
  constructor(message = "Unauthorized") {
    super(message, 401);
  }
}

export class RateLimitError extends AppError {
  readonly code = "RATE_LIMITED";
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds = 60, message = "Rate limit exceeded") {
    super(message, 429);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class PipelineError extends AppError {
  readonly code: "FILM_UNRESOLVED" | "QLOO_UNAVAILABLE";
  readonly alternates?: { name: string; entityId: string }[];

  constructor(
    code: "FILM_UNRESOLVED" | "QLOO_UNAVAILABLE",
    message: string,
    alternates?: { name: string; entityId: string }[]
  ) {
    super(message, 500);
    this.code = code;
    this.alternates = alternates;
  }
}

// Qloo-specific errors
export class QlooAuthError extends AppError {
  readonly code = "QLOO_AUTH";
  constructor(message = "Authentication with taste service failed") {
    super(message, 500);
  }
}

export class QlooForbiddenError extends AppError {
  readonly code = "QLOO_FORBIDDEN";
  constructor(message = "Requested taste entity or type is not allowed") {
    super(message, 500);
  }
}

export class QlooBadRequestError extends AppError {
  readonly code = "QLOO_BAD_REQUEST";
  constructor(message: string, details?: unknown) {
    super(message, 500, details);
  }
}

export class QlooRateLimitError extends AppError {
  readonly code = "QLOO_RATE_LIMIT";
  constructor(message = "Taste service rate limit exceeded after retry") {
    super(message, 500);
  }
}

export class QlooServerError extends AppError {
  readonly code = "QLOO_SERVER";
  constructor(message = "Taste service returned an upstream server error") {
    super(message, 500);
  }
}

export class QlooTimeoutError extends AppError {
  readonly code = "QLOO_TIMEOUT";
  constructor(message = "Taste service request timed out after retry") {
    super(message, 500);
  }
}

export class QlooNetworkError extends AppError {
  readonly code = "QLOO_NETWORK";
  constructor(message = "Network error connecting to taste service") {
    super(message, 500);
  }
}

export class QlooParseError extends AppError {
  readonly code = "QLOO_PARSE";
  constructor(message = "Taste service response could not be parsed as JSON") {
    super(message, 500);
  }
}

export class BudgetExceededError extends AppError {
  readonly code = "BUDGET_EXCEEDED";
  constructor(message = "Per-brief Qloo request budget exceeded") {
    super(message, 500);
  }
}

export class ReplayMissError extends AppError {
  readonly code = "REPLAY_MISS";
  constructor(message = "Cache miss encountered while running in replay mode") {
    super(message, 500);
  }
}

export class ParamGuardError extends AppError {
  readonly code = "PARAM_GUARD";
  readonly guardCode: string;

  constructor(guardCode: string, message?: string) {
    super(message || `ParamGuard violation: ${guardCode}`, 500);
    this.guardCode = guardCode;
  }
}

// LLM errors
export class LlmError extends AppError {
  readonly code: "LLM_TIMEOUT" | "LLM_RATE_LIMIT" | "LLM_INVALID_OUTPUT" | "LLM_UNAVAILABLE";

  constructor(
    code: "LLM_TIMEOUT" | "LLM_RATE_LIMIT" | "LLM_INVALID_OUTPUT" | "LLM_UNAVAILABLE",
    message: string,
    details?: unknown
  ) {
    super(message, 500, details);
    this.code = code;
  }
}
