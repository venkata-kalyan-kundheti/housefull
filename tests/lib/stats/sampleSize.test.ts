import { describe, it, expect } from "vitest";
import { sampleSizePerArm } from "@/lib/stats/sampleSize";

describe("lib/stats/sampleSize.ts", () => {
  it("matches Section 9B.2 test vector: 0.05 to 0.07 -> 2213", () => {
    expect(sampleSizePerArm({ p1: 0.05, p2: 0.07, alpha: 0.05, power: 0.8 })).toBe(2213);
  });

  it("matches Section 9B.2 test vector: 0.10 to 0.12 -> 3841", () => {
    expect(sampleSizePerArm({ p1: 0.1, p2: 0.12, alpha: 0.05, power: 0.8 })).toBe(3841);
  });

  it("matches Section 9B.2 test vector: 0.02 to 0.03 -> 3826", () => {
    expect(sampleSizePerArm({ p1: 0.02, p2: 0.03, alpha: 0.05, power: 0.8 })).toBe(3826);
  });

  it("matches Section 9B.2 test vector: 0.20 to 0.25 -> 1094", () => {
    expect(sampleSizePerArm({ p1: 0.2, p2: 0.25, alpha: 0.05, power: 0.8 })).toBe(1094);
  });

  it("uses default alpha=0.05 and power=0.8 when omitted", () => {
    expect(sampleSizePerArm({ p1: 0.05, p2: 0.07 })).toBe(2213);
  });

  it("throws RangeError on invalid parameters", () => {
    expect(() => sampleSizePerArm({ p1: 0.05, p2: 0.05 })).toThrow(RangeError);
    expect(() => sampleSizePerArm({ p1: 0, p2: 0.05 })).toThrow(RangeError);
    expect(() => sampleSizePerArm({ p1: 0.05, p2: 1 })).toThrow(RangeError);
    expect(() => sampleSizePerArm({ p1: 0.05, p2: 0.1, alpha: 0.6 })).toThrow(RangeError);
    expect(() => sampleSizePerArm({ p1: 0.05, p2: 0.1, power: 0.4 })).toThrow(RangeError);
  });
});
