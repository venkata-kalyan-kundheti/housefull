import { describe, it, expect } from "vitest";
import {
  ConfigError,
  ValidationError,
  NotFoundError,
  ConflictError,
  AuthError,
  RateLimitError,
  PipelineError,
  QlooAuthError,
  QlooForbiddenError,
  QlooBadRequestError,
  QlooRateLimitError,
  QlooServerError,
  QlooTimeoutError,
  QlooNetworkError,
  QlooParseError,
  BudgetExceededError,
  ReplayMissError,
  ParamGuardError,
  LlmError,
} from "@/lib/errors";

describe("Typed Errors (Section 17)", () => {
  it("instantiates ConfigError with correct code and status", () => {
    const err = new ConfigError("Missing vars");
    expect(err.code).toBe("CONFIG_INVALID");
    expect(err.status).toBe(500);
    expect(err.message).toBe("Missing vars");
  });

  it("instantiates ValidationError with 400 status", () => {
    const err = new ValidationError("Bad field");
    expect(err.code).toBe("VALIDATION_FAILED");
    expect(err.status).toBe(400);
  });

  it("instantiates NotFoundError with appropriate codes", () => {
    const err = new NotFoundError("SHOW_NOT_FOUND", "Show not found");
    expect(err.code).toBe("SHOW_NOT_FOUND");
    expect(err.status).toBe(404);
  });

  it("instantiates ConflictError with 409 status", () => {
    const err = new ConflictError();
    expect(err.code).toBe("SHOW_ALREADY_STARTED");
    expect(err.status).toBe(409);
  });

  it("instantiates AuthError with 401 status", () => {
    const err = new AuthError();
    expect(err.code).toBe("UNAUTHORIZED");
    expect(err.status).toBe(401);
  });

  it("instantiates RateLimitError with retryAfterSeconds", () => {
    const err = new RateLimitError(30);
    expect(err.code).toBe("RATE_LIMITED");
    expect(err.status).toBe(429);
    expect(err.retryAfterSeconds).toBe(30);
  });

  it("instantiates PipelineError with alternates", () => {
    const err = new PipelineError("FILM_UNRESOLVED", "Not found", [
      { name: "Alt Film", entityId: "uuid-123" },
    ]);
    expect(err.code).toBe("FILM_UNRESOLVED");
    expect(err.alternates).toHaveLength(1);
  });

  it("instantiates all Qloo and internal error types", () => {
    expect(new QlooAuthError().code).toBe("QLOO_AUTH");
    expect(new QlooForbiddenError().code).toBe("QLOO_FORBIDDEN");
    expect(new QlooBadRequestError("bad req").code).toBe("QLOO_BAD_REQUEST");
    expect(new QlooRateLimitError().code).toBe("QLOO_RATE_LIMIT");
    expect(new QlooServerError().code).toBe("QLOO_SERVER");
    expect(new QlooTimeoutError().code).toBe("QLOO_TIMEOUT");
    expect(new QlooNetworkError().code).toBe("QLOO_NETWORK");
    expect(new QlooParseError().code).toBe("QLOO_PARSE");
    expect(new BudgetExceededError().code).toBe("BUDGET_EXCEEDED");
    expect(new ReplayMissError().code).toBe("REPLAY_MISS");
    expect(new ParamGuardError("forbidden filter").code).toBe("PARAM_GUARD");
    expect(new LlmError("LLM_TIMEOUT", "timed out").code).toBe("LLM_TIMEOUT");
  });
});
