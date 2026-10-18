/**
 * lib/qloo/limiter.ts
 *
 * Token bucket rate limiter with FIFO ordering as specified in Section 8.4.
 */

import { getConfig } from "../config";

export class RateLimiter {
  private readonly ratePerSec: number;
  private readonly capacity: number;
  private readonly nowFn: () => number;
  private readonly sleepFn: (ms: number) => Promise<void>;

  private tokens: number;
  private last: number;
  private queue: (() => void)[] = [];
  private draining = false;

  constructor(
    ratePerSec = 4,
    capacity = ratePerSec,
    nowFn: () => number = Date.now,
    sleepFn: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms))
  ) {
    this.ratePerSec = ratePerSec;
    this.capacity = capacity;
    this.nowFn = nowFn;
    this.sleepFn = sleepFn;

    this.tokens = capacity;
    this.last = this.nowFn();
  }

  async acquire(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
      void this.drain();
    });
  }

  private refill(): void {
    const current = this.nowFn();
    const elapsedSec = (current - this.last) / 1000;
    this.last = current;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSec * this.ratePerSec);
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;

    while (this.queue.length > 0) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        const resolveOldest = this.queue.shift();
        if (resolveOldest) {
          resolveOldest();
        }
      } else {
        const waitMs = Math.ceil(((1 - this.tokens) / this.ratePerSec) * 1000);
        await this.sleepFn(Math.max(1, waitMs));
      }
    }

    this.draining = false;
  }
}

let sharedLimiter: RateLimiter | null = null;

export function getRateLimiter(): RateLimiter {
  if (!sharedLimiter) {
    let rps = 4;
    try {
      rps = getConfig().QLOO_RPS;
    } catch {
      rps = 4;
    }
    sharedLimiter = new RateLimiter(rps);
  }
  return sharedLimiter;
}
