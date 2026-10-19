import { describe, it, expect, vi, beforeEach } from "vitest";
import { Budget } from "@/lib/qloo/budget";
import { searchEntities, CallCounter } from "@/lib/qloo/client";
import { resetLimiterForTest } from "@/lib/qloo/limiter";
import * as cacheModule from "@/lib/qloo/cache";
import * as configModule from "@/lib/config";
import type { QlooContext } from "@/lib/qloo/types";

describe("lib/qloo/budget.ts (Section 8.7 & 19.4)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetLimiterForTest();
    vi.spyOn(configModule, "getConfig").mockReturnValue({
      QLOO_API_KEY: "test-qloo-key",
      QLOO_API_URL: "https://hackathon.api.qloo.com",
      APP_MODE: "live",
      QLOO_RPS: 4,
      QLOO_CACHE_TTL_HOURS: 168,
    } as ReturnType<typeof configModule.getConfig>);
  });

  it("limit respected: consumes budget up to the limit and then rejects", () => {
    const budget = new Budget(3);
    expect(budget.remaining()).toBe(3);

    expect(budget.tryConsume()).toBe(true);
    expect(budget.remaining()).toBe(2);

    expect(budget.tryConsume()).toBe(true);
    expect(budget.remaining()).toBe(1);

    expect(budget.tryConsume()).toBe(true);
    expect(budget.remaining()).toBe(0);

    // Exceeded
    expect(budget.tryConsume()).toBe(false);
    expect(budget.remaining()).toBe(0);
  });

  it("retries do not consume extra budget", async () => {
    vi.useFakeTimers();
    vi.spyOn(cacheModule, "getCachedQloo").mockResolvedValue(null);
    vi.spyOn(cacheModule, "setCachedQloo").mockResolvedValue();

    let callCount = 0;
    const fakeFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(JSON.stringify({ error: "server error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
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

    const budget = new Budget(10);
    const ctx: QlooContext = {
      runId: "run-budget-retry",
      budget,
      mode: "live",
      callCounter: new CallCounter(),
    };

    const initialBudget = budget.remaining();
    const promise = searchEntities(ctx, "Inception", { fetchImpl: fakeFetch });

    // Advance timers for 2000ms 500 retry delay
    await vi.advanceTimersByTimeAsync(2100);
    const res = await promise;

    expect(res.ok).toBe(true);
    expect(res.call.attempts).toBe(2);
    // Despite 2 attempts (1 initial + 1 retry), only 1 budget token was consumed
    expect(budget.remaining()).toBe(initialBudget - 1);

    vi.useRealTimers();
  });

  it("cached calls do not consume budget", async () => {
    vi.spyOn(cacheModule, "getCachedQloo").mockResolvedValue({
      payload: [{ entityId: "CACHED-1", name: "Inception", types: [] }],
      status: 200,
      resultCount: 1,
      fetchedAt: new Date(),
    });

    const budget = new Budget(5);
    const ctx: QlooContext = {
      runId: "run-budget-cached",
      budget,
      mode: "live",
      callCounter: new CallCounter(),
    };

    const initialBudget = budget.remaining();
    const res = await searchEntities(ctx, "Inception", { fetchImpl: vi.fn() });

    expect(res.ok).toBe(true);
    expect(res.call.cached).toBe(true);
    // Cached call consumes 0 budget tokens
    expect(budget.remaining()).toBe(initialBudget);
  });
});
