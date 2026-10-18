import { describe, it, expect } from "vitest";
import { analyze, wilsonInterval } from "@/lib/stats/twoProportion";
import { normInv } from "@/lib/stats/normal";

describe("lib/stats/twoProportion.ts", () => {
  const zCrit95 = normInv(1 - 0.05 / 2);

  it("matches test vector: control 100 of 2000, test 130 of 2000", () => {
    const res = analyze({
      control: { reached: 2000, converted: 100 },
      test: { reached: 2000, converted: 130 },
    });

    expect(res.controlRate).toBeCloseTo(0.05, 4);
    expect(res.testRate).toBeCloseTo(0.065, 4);
    expect(res.absoluteLift).toBeCloseTo(0.015, 4);
    expect(res.relativeLift).toBeCloseTo(0.3, 4);
    expect(res.z).toBeCloseTo(2.03759, 4);
    expect(res.pValue).toBeCloseTo(0.04159, 4);
    expect(res.diffCi[0]).toBeCloseTo(0.000579, 4);
    expect(res.diffCi[1]).toBeCloseTo(0.029421, 4);
    expect(res.verdict).toBe("positive");
  });

  it("matches test vector: control 50 of 1000, test 55 of 1000", () => {
    const res = analyze({
      control: { reached: 1000, converted: 50 },
      test: { reached: 1000, converted: 55 },
    });

    expect(res.absoluteLift).toBeCloseTo(0.005, 4);
    expect(res.z).toBeCloseTo(0.50129, 4);
    expect(res.pValue).toBeCloseTo(0.61617, 4);
    expect(res.diffCi[0]).toBeCloseTo(-0.014548, 4);
    expect(res.diffCi[1]).toBeCloseTo(0.024548, 4);
    expect(res.verdict).toBe("inconclusive");
  });

  it("matches test vector: Wilson interval for 100 of 2000", () => {
    const [lower, upper] = wilsonInterval(100, 2000, zCrit95);
    expect(lower).toBeCloseTo(0.041281, 4);
    expect(upper).toBeCloseTo(0.060444, 4);
  });

  it("matches test vector: Wilson interval for 0 of 50 clamps lower to 0", () => {
    const [lower, upper] = wilsonInterval(0, 50, zCrit95);
    expect(lower).toBe(0);
    expect(upper).toBeCloseTo(0.071348, 4);
  });

  it("matches test vector: Wilson interval for 50 of 50 clamps upper to 1", () => {
    const [lower, upper] = wilsonInterval(50, 50, zCrit95);
    expect(lower).toBeCloseTo(0.928652, 4);
    expect(upper).toBe(1);
  });

  it("matches test vector: control 0 of 100, test 0 of 100", () => {
    const res = analyze({
      control: { reached: 100, converted: 0 },
      test: { reached: 100, converted: 0 },
    });

    expect(res.z).toBe(0);
    expect(res.pValue).toBe(1);
    expect(res.relativeLift).toBeNull();
    expect(res.verdict).toBe("inconclusive");
  });

  it("detects underpowered experiments when requiredPerArm is set", () => {
    const res = analyze({
      control: { reached: 2000, converted: 100 },
      test: { reached: 2000, converted: 130 },
      requiredPerArm: 3000,
    });
    expect(res.underpowered).toBe(true);

    const adequatelyPowered = analyze({
      control: { reached: 3500, converted: 175 },
      test: { reached: 3500, converted: 220 },
      requiredPerArm: 3000,
    });
    expect(adequatelyPowered.underpowered).toBe(false);
  });

  it("validates inputs and throws RangeError with exact error messages", () => {
    expect(() =>
      analyze({
        control: { reached: 100, converted: 10 },
        test: { reached: 10, converted: 11 },
      })
    ).toThrow("Converted cannot be larger than reached.");

    expect(() =>
      analyze({
        control: { reached: 0, converted: 0 },
        test: { reached: 100, converted: 10 },
      })
    ).toThrow("Each group needs at least 1 person reached.");

    expect(() =>
      analyze({
        control: { reached: 100, converted: -1 },
        test: { reached: 100, converted: 10 },
      })
    ).toThrow("Converted cannot be negative.");
  });
});
