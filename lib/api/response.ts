/**
 * lib/api/response.ts
 *
 * Helpers for standard HTTP responses conforming to Section 14.1.
 * Enforces Cache-Control: no-store on all API endpoints.
 */

import { NextResponse } from "next/server";

export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export function jsonError(
  code: string,
  message: string,
  status = 500,
  details?: unknown
): NextResponse {
  const body: {
    error: {
      code: string;
      message: string;
      details?: unknown;
    };
  } = {
    error: {
      code,
      message,
    },
  };

  if (details !== undefined) {
    body.error.details = details;
  }

  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export function jsonValidationFailed(
  details: { path: string; message: string }[],
  message = "Request validation failed"
): NextResponse {
  return jsonError("VALIDATION_FAILED", message, 400, details);
}

export function jsonRateLimited(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests. Please try again later.",
      },
    },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(retryAfterSeconds),
      },
    }
  );
}
