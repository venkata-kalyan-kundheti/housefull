import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { assessRetry } from "@/lib/qloo/retry";
import { searchEntities, CallCounter } from "@/lib/qloo/client";
import { resetLimiterForTest } from "@/lib/qloo/limiter";
import { Budget } from "@/lib/qloo/budget";
import * as cacheModule from "@/lib/qloo/cache";
import * as configModule from "@/lib/config";
import type { QlooContext } from "@/lib/qloo/types";

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

  describe("client retry policy execution", () => {
    let ctx: QlooContext;

    beforeEach(() => {
      vi.useFakeTimers();
      vi.restoreAllMocks();
      resetLimiterForTest();
      vi.spyOn(configModule, "getConfig").mockReturnValue({
        QLOO_API_KEY: "test-qloo-key",
        QLOO_API_URL: "https://hackathon.api.qloo.com",
        APP_MODE: "live",
        QLOO_RPS: 4,
        QLOO_CACHE_TTL_HOURS: 168,
      } as ReturnType<typeof configModule.getConfig>);

      vi.spyOn(cacheModule, "getCachedQloo").mockResolvedValue(null);
      vi.spyOn(cacheModule, "setCachedQloo").mockResolvedValue();

      ctx = {
        runId: "run-retry-test",
        budget: new Budget(16),
        mode: "live",
        callCounter: new CallCounter(),
      };
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("429 then 200 succeeds with attempts: 2", async () => {
      let callCount = 0;
      const fakeFetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return new Response(JSON.stringify({ error: "rate limit" }), {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "x-second-ratelimit-reset": "1",
            },
          });
        }
        return new Response(
          JSON.stringify({
            success: true,
            results: [{ entity_id: "ID-1", name: "Inception" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      });

      const promise = searchEntities(ctx, "Inception", {
        fetchImpl: fakeFetch,
      });

      // Advance timers for the 1000ms 429 delay
      await vi.advanceTimersByTimeAsync(1100);
      const res = await promise;

      expect(res.ok).toBe(true);
      expect(res.call.attempts).toBe(2);
      expect(fakeFetch).toHaveBeenCalledTimes(2);
    });

    it("500 twice fails with attempts: 2", async () => {
      const fakeFetch = vi.fn().mockImplementation(async () => {
        return new Response(JSON.stringify({ error: "internal server error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      });

      const promise = searchEntities(ctx, "Inception", {
        fetchImpl: fakeFetch,
      });

      // Advance timers for the 2000ms 500 delay
      await vi.advanceTimersByTimeAsync(2100);
      const res = await promise;

      expect(res.ok).toBe(false);
      expect(res.call.attempts).toBe(2);
      expect(fakeFetch).toHaveBeenCalledTimes(2);
    });

    it("400 is not retried", async () => {
      const fakeFetch = vi.fn().mockImplementation(async () => {
        return new Response(
          JSON.stringify({
            success: false,
            errors: [{ message: "bad request" }],
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      });

      const res = await searchEntities(ctx, "Inception", {
        fetchImpl: fakeFetch,
      });

      expect(res.ok).toBe(false);
      expect(res.call.attempts).toBe(1);
      expect(fakeFetch).toHaveBeenCalledTimes(1);
    });

    it("timeout then 200 succeeds with attempts: 2", async () => {
      let callCount = 0;
      const fakeFetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          const abortError = new Error("The operation was aborted due to timeout");
          abortError.name = "AbortError";
          throw abortError;
        }
        return new Response(
          JSON.stringify({
            success: true,
            results: [{ entity_id: "ID-1", name: "Inception" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      });

      const promise = searchEntities(ctx, "Inception", {
        fetchImpl: fakeFetch,
      });

      // Advance timers for the 2000ms timeout retry delay
      await vi.advanceTimersByTimeAsync(2100);
      const res = await promise;

      expect(res.ok).toBe(true);
      expect(res.call.attempts).toBe(2);
      expect(fakeFetch).toHaveBeenCalledTimes(2);
    });
  });
});
