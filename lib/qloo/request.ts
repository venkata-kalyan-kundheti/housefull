/**
 * lib/qloo/request.ts
 *
 * Low-level HTTP request execution against the Qloo API as specified in Section 8.3.
 */

import { getConfig, redactSecrets } from "../config";
import {
  ConfigError,
  QlooAuthError,
  QlooForbiddenError,
  QlooBadRequestError,
  QlooRateLimitError,
  QlooServerError,
  QlooTimeoutError,
  QlooNetworkError,
  QlooParseError,
  type AppError,
} from "../errors";

export interface RateLimitHeaders {
  secondLimit: number | null;
  secondRemaining: number | null;
  secondReset: number | null;
  monthLimit: number | null;
  monthRemaining: number | null;
  monthReset: number | null;
}

export interface RawFetchResponse {
  ok: boolean;
  status: number;
  data: unknown;
  rateLimits: RateLimitHeaders;
  latencyMs: number;
  error?: AppError;
}

export function buildSortedUrl(endpoint: string, params: Record<string, string>): URL {
  const config = getConfig();
  let base = config.QLOO_API_URL;
  if (!base.endsWith("/")) {
    base += "/";
  }

  const cleanEndpoint = endpoint.startsWith("/") ? endpoint.slice(1) : endpoint;
  const fullUrl = new URL(cleanEndpoint, base);

  if (fullUrl.hostname !== "hackathon.api.qloo.com") {
    throw new ConfigError("QLOO_API_URL host must be exactly hackathon.api.qloo.com");
  }

  // Sort keys alphabetically
  const sortedKeys = Object.keys(params).sort();
  for (const key of sortedKeys) {
    fullUrl.searchParams.set(key, params[key]!);
  }

  return fullUrl;
}

function parseHeaderNum(headers: Headers, name: string): number | null {
  const val = headers.get(name);
  if (!val) return null;
  const num = Number.parseFloat(val);
  return Number.isFinite(num) ? num : null;
}

export async function executeFetch(
  endpoint: string,
  params: Record<string, string>,
  fetchImpl: typeof fetch = fetch
): Promise<RawFetchResponse> {
  const config = getConfig();
  const url = buildSortedUrl(endpoint, params);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout
  const startedAt = Date.now();

  try {
    const res = await fetchImpl(url.toString(), {
      method: "GET",
      headers: {
        "X-Api-Key": config.QLOO_API_KEY || "",
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startedAt;

    const rateLimits: RateLimitHeaders = {
      secondLimit: parseHeaderNum(res.headers, "x-second-ratelimit-limit"),
      secondRemaining: parseHeaderNum(res.headers, "x-second-ratelimit-remaining"),
      secondReset: parseHeaderNum(res.headers, "x-second-ratelimit-reset"),
      monthLimit: parseHeaderNum(res.headers, "x-month-ratelimit-limit"),
      monthRemaining: parseHeaderNum(res.headers, "x-month-ratelimit-remaining"),
      monthReset: parseHeaderNum(res.headers, "x-month-ratelimit-reset"),
    };

    const text = await res.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      const snippet = redactSecrets(text.slice(0, 200));
      return {
        ok: false,
        status: res.status,
        data: null,
        rateLimits,
        latencyMs,
        error: new QlooParseError(`Non-JSON response: ${snippet}`),
      };
    }

    // Check HTTP status errors
    if (res.status === 401) {
      return {
        ok: false,
        status: 401,
        data: body,
        rateLimits,
        latencyMs,
        error: new QlooAuthError(),
      };
    }

    if (res.status === 403) {
      return {
        ok: false,
        status: 403,
        data: body,
        rateLimits,
        latencyMs,
        error: new QlooForbiddenError(),
      };
    }

    if (res.status === 429) {
      return {
        ok: false,
        status: 429,
        data: body,
        rateLimits,
        latencyMs,
        error: new QlooRateLimitError(),
      };
    }

    if (res.status >= 500) {
      return {
        ok: false,
        status: res.status,
        data: body,
        rateLimits,
        latencyMs,
        error: new QlooServerError(`Qloo server error HTTP ${res.status}`),
      };
    }

    if (res.status === 400) {
      const msg = extractErrorMessage(body);
      return {
        ok: false,
        status: 400,
        data: body,
        rateLimits,
        latencyMs,
        error: new QlooBadRequestError(msg, body),
      };
    }

    // Check body success === false
    if (
      body &&
      typeof body === "object" &&
      "success" in body &&
      (body as { success?: boolean }).success === false
    ) {
      const msg = extractErrorMessage(body);
      return {
        ok: false,
        status: res.status,
        data: body,
        rateLimits,
        latencyMs,
        error: new QlooBadRequestError(msg, body),
      };
    }

    return {
      ok: true,
      status: res.status,
      data: body,
      rateLimits,
      latencyMs,
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startedAt;
    const rateLimits: RateLimitHeaders = {
      secondLimit: null,
      secondRemaining: null,
      secondReset: null,
      monthLimit: null,
      monthRemaining: null,
      monthReset: null,
    };

    if (err instanceof Error && err.name === "AbortError") {
      return {
        ok: false,
        status: 0,
        data: null,
        rateLimits,
        latencyMs,
        error: new QlooTimeoutError("Request to Qloo API timed out after 20000ms"),
      };
    }

    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: 0,
      data: null,
      rateLimits,
      latencyMs,
      error: new QlooNetworkError(`Network error connecting to Qloo: ${redactSecrets(message)}`),
    };
  }
}

function extractErrorMessage(body: unknown): string {
  if (body && typeof body === "object" && "errors" in body) {
    const errors = (body as { errors?: { message?: string }[] }).errors;
    if (Array.isArray(errors) && errors.length > 0 && errors[0]?.message) {
      return redactSecrets(errors[0].message);
    }
  }
  return "Qloo API returned a bad request error";
}
