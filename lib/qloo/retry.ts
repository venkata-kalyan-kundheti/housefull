/**
 * lib/qloo/retry.ts
 *
 * Retry policy for Qloo API requests as specified in Section 8.5.
 */

export interface RetryAssessment {
  shouldRetry: boolean;
  delayMs: number;
}

export function assessRetry(
  status: number | null,
  errorCode: string | null,
  rateResetSeconds?: number | null
): RetryAssessment {
  // Never retry on 400, 401, 403, 404, or parse error
  if (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    status === 404 ||
    errorCode === "QLOO_PARSE" ||
    errorCode === "QLOO_AUTH" ||
    errorCode === "QLOO_FORBIDDEN" ||
    errorCode === "QLOO_BAD_REQUEST"
  ) {
    return { shouldRetry: false, delayMs: 0 };
  }

  // Rate limit 429
  if (status === 429 || errorCode === "QLOO_RATE_LIMIT") {
    let delayMs = 1000;
    if (rateResetSeconds !== undefined && rateResetSeconds !== null) {
      delayMs = Math.max(1000, Math.min(5000, rateResetSeconds * 1000));
    }
    return { shouldRetry: true, delayMs };
  }

  // Server errors (500, 502, 503, 504), network errors, timeouts
  if (
    (status !== null && status >= 500 && status <= 504) ||
    errorCode === "QLOO_SERVER" ||
    errorCode === "QLOO_NETWORK" ||
    errorCode === "QLOO_TIMEOUT"
  ) {
    return { shouldRetry: true, delayMs: 2000 };
  }

  return { shouldRetry: false, delayMs: 0 };
}
