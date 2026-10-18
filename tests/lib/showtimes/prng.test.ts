import { describe, it, expect } from "vitest";
import { mulberry32 } from "@/lib/showtimes/prng";

describe("lib/showtimes/prng.ts (Section 9.10)", () => {
  it("matches test vectors for mulberry32(42) to tolerance 1e-9", () => {
    const rng = mulberry32(42);
    expect(rng()).toBeCloseTo(0.6011037519, 9);
    expect(rng()).toBeCloseTo(0.448290559, 9);
    expect(rng()).toBeCloseTo(0.8524657935, 9);
  });

  it("yields identical sequences given identical seed", () => {
    const rng1 = mulberry32(12345);
    const rng2 = mulberry32(12345);
    for (let i = 0; i < 20; i++) {
      expect(rng1()).toBe(rng2());
    }
  });
});
