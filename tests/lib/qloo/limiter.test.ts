import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RateLimiter } from "@/lib/qloo/limiter";

describe("lib/qloo/limiter.ts (Section 8.4, 19.4)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("10 acquires at rate 4 resolve at 0,0,0,0,250,500,750,1000,1250,1500 ms (tolerance 20 ms) in FIFO order", async () => {
    const limiter = new RateLimiter(4, 4);
    const start = Date.now();
    const results: { index: number; resolvedAt: number }[] = [];

    for (let i = 0; i < 10; i++) {
      void limiter.acquire().then(() => {
        results.push({ index: i, resolvedAt: Date.now() - start });
      });
    }

    // Flush initial tasks
    await vi.advanceTimersByTimeAsync(0);
    expect(results.map((r) => r.index)).toEqual([0, 1, 2, 3]);

    // Advance in steps to verify each resolution
    await vi.advanceTimersByTimeAsync(250);
    expect(results.map((r) => r.index)).toEqual([0, 1, 2, 3, 4]);

    await vi.advanceTimersByTimeAsync(250);
    expect(results.map((r) => r.index)).toEqual([0, 1, 2, 3, 4, 5]);

    await vi.advanceTimersByTimeAsync(250);
    expect(results.map((r) => r.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);

    await vi.advanceTimersByTimeAsync(250);
    expect(results.map((r) => r.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);

    await vi.advanceTimersByTimeAsync(250);
    expect(results.map((r) => r.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);

    await vi.advanceTimersByTimeAsync(250);
    expect(results.map((r) => r.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

    const expectedTimes = [0, 0, 0, 0, 250, 500, 750, 1000, 1250, 1500];
    results.forEach((r, idx) => {
      const diff = Math.abs(r.resolvedAt - expectedTimes[idx]!);
      expect(diff).toBeLessThanOrEqual(20);
    });
  });

  it("refill after idle never exceeds capacity", async () => {
    const limiter = new RateLimiter(4, 4);
    // Drain all 4 initial tokens
    for (let i = 0; i < 4; i++) {
      await limiter.acquire();
    }

    // Idle for 10 seconds (would generate 40 tokens if uncapped)
    await vi.advanceTimersByTimeAsync(10000);

    // Now test capacity: 4 should resolve immediately, 5th should block
    const resolved: number[] = [];
    for (let i = 0; i < 5; i++) {
      void limiter.acquire().then(() => resolved.push(i));
    }

    await vi.advanceTimersByTimeAsync(0);
    // Only 4 resolved because capacity is capped at 4
    expect(resolved).toEqual([0, 1, 2, 3]);

    // 5th resolves after 250ms
    await vi.advanceTimersByTimeAsync(250);
    expect(resolved).toEqual([0, 1, 2, 3, 4]);
  });
});
