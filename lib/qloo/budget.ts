/**
 * lib/qloo/budget.ts
 *
 * Per-run request budget tracker as specified in Section 8.7.
 */

import type { BudgetTracker } from "./types";

export class Budget implements BudgetTracker {
  private count: number;
  private readonly limit: number;

  constructor(limit = 16) {
    this.limit = limit;
    this.count = 0;
  }

  remaining(): number {
    return Math.max(0, this.limit - this.count);
  }

  tryConsume(): boolean {
    if (this.count < this.limit) {
      this.count++;
      return true;
    }
    return false;
  }
}
