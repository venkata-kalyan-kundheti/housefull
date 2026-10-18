import { describe, it, expect } from "vitest";
import { normCdf, normInv } from "@/lib/stats/normal";

describe("lib/stats/normal.ts", () => {
  it("normInv matches Section 9B.1 test vectors to 1e-6 tolerance", () => {
    expect(normInv(0.975)).toBeCloseTo(1.959964, 6);
    expect(normInv(0.8)).toBeCloseTo(0.841621, 6);
    expect(normInv(0.9)).toBeCloseTo(1.281552, 6);
    expect(normInv(0.95)).toBeCloseTo(1.644854, 6);
    expect(normInv(0.5)).toBeCloseTo(0, 6);
  });

  it("normCdf matches Section 9B.1 test vectors to 1e-6 tolerance", () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 6);
    expect(normCdf(1.959964)).toBeCloseTo(0.975, 6);
    expect(normCdf(-1.959964)).toBeCloseTo(0.025, 6);
  });

  it("throws RangeError for invalid probabilities in normInv", () => {
    expect(() => normInv(0)).toThrow(RangeError);
    expect(() => normInv(1)).toThrow(RangeError);
    expect(() => normInv(-0.5)).toThrow(RangeError);
    expect(() => normInv(1.5)).toThrow(RangeError);
    expect(() => normInv(NaN)).toThrow(RangeError);
  });
});
