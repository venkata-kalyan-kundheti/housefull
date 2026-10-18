import { describe, it, expect } from "vitest";
import { expectedProgress, projectedFill, isUnderfilled } from "@/lib/domain/fill";

describe("lib/domain/fill.ts (Section 9.8)", () => {
  it("computes expectedProgress matching Section 9.8 test vectors", () => {
    expect(expectedProgress(100)).toBeCloseTo(0.1, 6);
    expect(expectedProgress(72)).toBeCloseTo(0.1, 6);
    expect(expectedProgress(48)).toBeCloseTo(0.225, 6);
    expect(expectedProgress(24)).toBeCloseTo(0.35, 6);
    expect(expectedProgress(12)).toBeCloseTo(0.578571, 6);
    expect(expectedProgress(3)).toBeCloseTo(0.75, 6);
    expect(expectedProgress(1.5)).toBeCloseTo(0.875, 6);
    expect(expectedProgress(0)).toBeCloseTo(1.0, 6);
    expect(expectedProgress(-5)).toBeCloseTo(1.0, 6);
  });

  it("computes projectedFill matching Section 9.8 test vectors", () => {
    // 10 / 100 / 24 -> 0.285714
    expect(projectedFill(10, 100, 24)).toBeCloseTo(0.285714, 6);
    // 30 / 100 / 24 -> 0.857143
    expect(projectedFill(30, 100, 24)).toBeCloseTo(0.857143, 6);
    // 5 / 200 / 48 -> 0.111111
    expect(projectedFill(5, 200, 48)).toBeCloseTo(0.111111, 6);
    // 50 / 100 / 3 -> 0.666667
    expect(projectedFill(50, 100, 3)).toBeCloseTo(0.666667, 6);
    // 0 / 0 / 24 -> 0
    expect(projectedFill(0, 0, 24)).toBe(0);
    // clamping sold > capacity
    expect(projectedFill(150, 100, 24)).toBe(1);
    // negative sold treated as 0
    expect(projectedFill(-10, 100, 24)).toBe(0);
  });

  it("evaluates isUnderfilled correctly", () => {
    // (10 / 100 / 24) is true
    expect(isUnderfilled({ sold: 10, capacity: 100, hoursToStart: 24 })).toBe(true);
    // (30 / 100 / 24) is false (0.857 >= 0.5)
    expect(isUnderfilled({ sold: 30, capacity: 100, hoursToStart: 24 })).toBe(false);
    // (5 / 200 / 80) is false (too far ahead > 72h)
    expect(isUnderfilled({ sold: 5, capacity: 200, hoursToStart: 80 })).toBe(false);
    // (5 / 200 / 0.5) is false (too close < 1h)
    expect(isUnderfilled({ sold: 5, capacity: 200, hoursToStart: 0.5 })).toBe(false);
    // (50 / 100 / 3) is false (0.6667 >= 0.5)
    expect(isUnderfilled({ sold: 50, capacity: 100, hoursToStart: 3 })).toBe(false);
  });
});
