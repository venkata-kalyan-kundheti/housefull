/**
 * lib/stats/sampleSize.ts
 *
 * Sample size calculation for two-proportion A/B testing (Section 9B.2).
 */

import { normInv } from "./normal";

export interface SampleSizeArgs {
  p1: number;
  p2: number;
  alpha?: number;
  power?: number;
}

/**
 * Calculates required sample size per arm for a two-proportion test (equal groups, two-sided).
 * Rounds up with Math.ceil.
 */
export function sampleSizePerArm(args: SampleSizeArgs): number {
  const { p1, p2, alpha = 0.05, power = 0.8 } = args;

  if (p1 <= 0 || p1 >= 1) {
    throw new RangeError(
      `Baseline conversion rate p1 must be between 0 and 1 exclusive. Received: ${p1}`
    );
  }
  if (p2 <= 0 || p2 >= 1) {
    throw new RangeError(
      `Target conversion rate p2 must be between 0 and 1 exclusive. Received: ${p2}`
    );
  }
  if (p1 === p2) {
    throw new RangeError("p1 and p2 must be different values.");
  }
  if (alpha <= 0 || alpha >= 0.5) {
    throw new RangeError(
      `Significance level alpha must be between 0 and 0.5 exclusive. Received: ${alpha}`
    );
  }
  if (power <= 0.5 || power >= 0.999) {
    throw new RangeError(
      `Statistical power must be between 0.5 and 0.999 exclusive. Received: ${power}`
    );
  }

  const pbar = (p1 + p2) / 2;
  const zA = normInv(1 - alpha / 2);
  const zB = normInv(power);

  const termA = zA * Math.sqrt(2 * pbar * (1 - pbar));
  const termB = zB * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2));
  const numerator = (termA + termB) ** 2;
  const denominator = (p2 - p1) ** 2;

  return Math.ceil(numerator / denominator);
}
