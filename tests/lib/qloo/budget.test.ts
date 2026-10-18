import { describe, it, expect } from "vitest";
import { Budget } from "@/lib/qloo/budget";

describe("lib/qloo/budget.ts (Section 8.7)", () => {
  it("tracks and consumes budget up to the limit", () => {
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
});
