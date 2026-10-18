/**
 * lib/stats/twoProportion.ts
 *
 * Two-proportion statistical analysis for A/B testing (Section 9B.3).
 */

import { normCdf, normInv } from "./normal";

export interface ArmData {
  reached: number;
  converted: number;
}

export interface AnalyzeArgs {
  control: ArmData;
  test: ArmData;
  alpha?: number;
  requiredPerArm?: number;
}

export interface Analysis {
  controlRate: number;
  testRate: number;
  absoluteLift: number;
  relativeLift: number | null; // null when controlRate is 0
  z: number;
  pValue: number; // two-sided, pooled variance
  diffCi: [number, number]; // 95% Wald interval for (test - control), unpooled
  controlCi: [number, number];
  testCi: [number, number]; // Wilson intervals
  underpowered: boolean;
  verdict: "positive" | "negative" | "inconclusive";
}

/**
 * Calculates Wilson score interval for a single proportion.
 * Result is clamped to [0, 1].
 */
export function wilsonInterval(
  converted: number,
  reached: number,
  zCrit: number
): [number, number] {
  const p = converted / reached;
  const n = reached;
  const z2 = zCrit * zCrit;

  const denominator = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denominator;
  const halfWidth =
    (zCrit * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denominator;

  let lower = centre - halfWidth;
  let upper = centre + halfWidth;

  if (lower <= 0 || Math.abs(lower) < 1e-12) {
    lower = 0;
  }
  if (upper >= 1 || Math.abs(upper - 1) < 1e-12) {
    upper = 1;
  }

  return [lower, upper];
}

/**
 * Validates inputs and computes two-proportion hypothesis test and confidence intervals.
 */
export function analyze(args: AnalyzeArgs): Analysis {
  const { control, test, alpha = 0.05, requiredPerArm } = args;

  // Validation according to Section 9B.3 exact error messages
  if (
    !Number.isInteger(control.reached) ||
    control.reached < 1 ||
    !Number.isInteger(test.reached) ||
    test.reached < 1
  ) {
    throw new RangeError("Each group needs at least 1 person reached.");
  }

  if (
    !Number.isInteger(control.converted) ||
    control.converted < 0 ||
    !Number.isInteger(test.converted) ||
    test.converted < 0
  ) {
    throw new RangeError("Converted cannot be negative.");
  }

  if (control.converted > control.reached || test.converted > test.reached) {
    throw new RangeError("Converted cannot be larger than reached.");
  }

  const x1 = control.converted;
  const n1 = control.reached;
  const x2 = test.converted;
  const n2 = test.reached;

  const controlRate = x1 / n1;
  const testRate = x2 / n2;
  const absoluteLift = testRate - controlRate;
  const relativeLift = controlRate === 0 ? null : absoluteLift / controlRate;

  const pooledP = (x1 + x2) / (n1 + n2);
  const pooledVar = pooledP * (1 - pooledP) * (1 / n1 + 1 / n2);

  let z = 0;
  let pValue = 1;

  if (pooledVar > 0) {
    z = absoluteLift / Math.sqrt(pooledVar);
    pValue = 2 * (1 - normCdf(Math.abs(z)));
  }

  const zCrit = normInv(1 - alpha / 2);

  // Wald unpooled difference interval
  const seDiff = Math.sqrt(
    (controlRate * (1 - controlRate)) / n1 + (testRate * (1 - testRate)) / n2
  );
  const diffCi: [number, number] = [
    absoluteLift - zCrit * seDiff,
    absoluteLift + zCrit * seDiff,
  ];

  // Wilson score intervals
  const controlCi = wilsonInterval(x1, n1, zCrit);
  const testCi = wilsonInterval(x2, n2, zCrit);

  const underpowered =
    typeof requiredPerArm === "number" &&
    (n1 < requiredPerArm || n2 < requiredPerArm);

  let verdict: "positive" | "negative" | "inconclusive" = "inconclusive";
  if (pValue < alpha && diffCi[0] > 0) {
    verdict = "positive";
  } else if (pValue < alpha && diffCi[1] < 0) {
    verdict = "negative";
  }

  return {
    controlRate,
    testRate,
    absoluteLift,
    relativeLift,
    z,
    pValue,
    diffCi,
    controlCi,
    testCi,
    underpowered,
    verdict,
  };
}
