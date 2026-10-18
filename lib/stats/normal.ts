/**
 * lib/stats/normal.ts
 *
 * Normal distribution cumulative distribution function and inverse CDF
 * as specified in Section 9B.1.
 */

// Acklam's rational approximation coefficients for normInv
const A = [
  -3.969683028665376e1,
  2.209460984245205e2,
  -2.759285104469687e2,
  1.38357751867269e2,
  -3.066479806614716e1,
  2.506628277459239,
];

const B = [
  -5.447609879822406e1,
  1.615858368580409e2,
  -1.556989798598866e2,
  6.680131188771972e1,
  -1.328068155288572e1,
];

const C = [
  -7.784894002430293e-3,
  -3.223964580411365e-1,
  -2.400758277161838,
  -2.549732539343734,
  4.374664141464968,
  2.938163982698783,
];

const D = [
  7.784695709041462e-3,
  3.224671290700398e-1,
  2.445134137142996,
  3.754408661907416,
];

const P_LOW = 0.02425;
const P_HIGH = 1 - P_LOW;

// Abramowitz & Stegun 7.1.26 coefficients for normCdf
const P_COEFF = 0.2316419;
const B1 = 0.31938153;
const B2 = -0.356563782;
const B3 = 1.781477937;
const B4 = -1.821255978;
const B5 = 1.330274429;
const ONE_OVER_SQRT_2PI = 1 / Math.sqrt(2 * Math.PI);

/**
 * Standard normal cumulative distribution function.
 * Accurate to about 1.5e-7 (Abramowitz & Stegun 7.1.26).
 */
export function normCdf(x: number): number {
  if (x === 0) {
    return 0.5;
  }

  const absX = Math.abs(x);
  const t = 1 / (1 + P_COEFF * absX);
  const phi = ONE_OVER_SQRT_2PI * Math.exp(-0.5 * absX * absX);
  const poly = ((((B5 * t + B4) * t + B3) * t + B2) * t + B1) * t;
  const cdfPositive = 1 - phi * poly;

  return x > 0 ? cdfPositive : 1 - cdfPositive;
}

/**
 * Inverse standard normal cumulative distribution function (quantile function).
 * Accurate to 1e-6 (Acklam's rational approximation).
 * Throws RangeError if p <= 0 or p >= 1.
 */
export function normInv(p: number): number {
  if (p <= 0 || p >= 1 || Number.isNaN(p)) {
    throw new RangeError(
      `p must be strictly between 0 and 1 (exclusive). Received: ${p}`
    );
  }

  if (p === 0.5) {
    return 0;
  }

  if (p < P_LOW) {
    // Lower tail
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((C[0]! * q + C[1]!) * q + C[2]!) * q + C[3]!) * q + C[4]!) * q +
        C[5]!) /
      ((((D[0]! * q + D[1]!) * q + D[2]!) * q + D[3]!) * q + 1)
    );
  }

  if (p > P_HIGH) {
    // Upper tail
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(
      (((((C[0]! * q + C[1]!) * q + C[2]!) * q + C[3]!) * q + C[4]!) * q +
        C[5]!) /
      ((((D[0]! * q + D[1]!) * q + D[2]!) * q + D[3]!) * q + 1)
    );
  }

  // Central region
  const q = p - 0.5;
  const r = q * q;
  const num =
    (((((A[0]! * r + A[1]!) * r + A[2]!) * r + A[3]!) * r + A[4]!) * r +
      A[5]!) *
    q;
  const den =
    ((((B[0]! * r + B[1]!) * r + B[2]!) * r + B[3]!) * r + B[4]!) * r + 1;
  return num / den;
}
