import { describe, it, expect } from "vitest";
import { assessRetry } from "@/lib/qloo/retry";

describe("lib/qloo/retry.ts (Section 8.5)", () => {
  it("does not retry 400, 401, 403, 404, or QLOO_PARSE", () => {
    expect(assessRetry(400, "QLOO_BAD_REQUEST").shouldRetry).toBe(false);
    expect(assessRetry(401, "QLOO_AUTH").shouldRetry).toBe(false);
    expect(assessRetry(403, "QLOO_FORBIDDEN").shouldRetry).toBe(false);
    expect(assessRetry(404, null).shouldRetry).toBe(false);
    expect(assessRetry(200, "QLOO_PARSE").shouldRetry).toBe(false);
  });

  it("retries 429 and clamps reset delay between 1000ms and 5000ms", () => {
    // Missing reset header -> 1000ms default
    const resNoHeader = assessRetry(429, "QLOO_RATE_LIMIT", null);
    expect(resNoHeader.shouldRetry).toBe(true);
    expect(resNoHeader.delayMs).toBe(1000);

    // Reset of 0.5s -> clamped to 1000ms
    const resShort = assessRetry(429, "QLOO_RATE_LIMIT", 0.5);
    expect(resShort.shouldRetry).toBe(true);
    expect(resShort.delayMs).toBe(1000);

    // Reset of 3s -> 3000ms
    const resMid = assessRetry(429, "QLOO_RATE_LIMIT", 3);
    expect(resMid.shouldRetry).toBe(true);
    expect(resMid.delayMs).toBe(3000);

    // Reset of 10s -> clamped to 5000ms
    const resLong = assessRetry(429, "QLOO_RATE_LIMIT", 10);
    expect(resLong.shouldRetry).toBe(true);
    expect(resLong.delayMs).toBe(5000);
  });

  it("retries 5xx, network, and timeout errors with 2000ms delay", () => {
    expect(assessRetry(500, "QLOO_SERVER")).toEqual({
      shouldRetry: true,
      delayMs: 2000,
    });
    expect(assessRetry(503, "QLOO_SERVER")).toEqual({
      shouldRetry: true,
      delayMs: 2000,
    });
    expect(assessRetry(null, "QLOO_NETWORK")).toEqual({
      shouldRetry: true,
      delayMs: 2000,
    });
    expect(assessRetry(null, "QLOO_TIMEOUT")).toEqual({
      shouldRetry: true,
      delayMs: 2000,
    });
  });
});
