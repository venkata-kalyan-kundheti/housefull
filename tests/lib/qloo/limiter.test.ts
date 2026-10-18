import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RateLimiter } from "@/lib/qloo/limiter";

describe("lib/qloo/limiter.ts (Section 8.4)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves 10 simultaneous calls with 4 immediate and one every 250ms in FIFO order", async () => {
    const limiter = new RateLimiter(4, 4);
    const resolvedOrder: number[] = [];

    for (let i = 0; i < 10; i++) {
      void limiter.acquire().then(() => {
        resolvedOrder.push(i);
      });
    }

    // Microtasks flush -> initial capacity (4) resolves immediately
    await vi.advanceTimersByTimeAsync(0);
    expect(resolvedOrder).toEqual([0, 1, 2, 3]);

    // Advance 250ms -> 5th item resolves
    await vi.advanceTimersByTimeAsync(250);
    expect(resolvedOrder).toEqual([0, 1, 2, 3, 4]);

    // Advance 250ms -> 6th item resolves
    await vi.advanceTimersByTimeAsync(250);
    expect(resolvedOrder).toEqual([0, 1, 2, 3, 4, 5]);

    // Advance 1000ms -> remaining 4 items resolve
    await vi.advanceTimersByTimeAsync(1000);
    expect(resolvedOrder).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});
