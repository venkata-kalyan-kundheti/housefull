/**
 * lib/domain/demographics.ts
 *
 * Human-readable demographic skew description as specified in Section 9.4.
 */

import type { DemographicsSkew, AgeBand } from "../qloo/types";

export const AGE_LABELS: Record<AgeBand, string> = {
  "24_and_younger": "ages 24 and younger",
  "25_to_29": "ages 25 to 29",
  "30_to_34": "ages 30 to 34",
  "35_to_44": "ages 35 to 44",
  "45_to_54": "ages 45 to 54",
  "55_and_older": "ages 55 and older",
};

export const AGE_BANDS_ORDER: readonly AgeBand[] = [
  "24_and_younger",
  "25_to_29",
  "30_to_34",
  "35_to_44",
  "45_to_54",
  "55_and_older",
] as const;

export function skewLabel(v: number): string {
  const abs = Math.abs(v);
  if (abs < 0.15) {
    return "about average";
  }
  if (abs < 0.4) {
    return v > 0 ? "leans toward" : "leans away from";
  }
  return v > 0 ? "skews strongly toward" : "skews strongly away from";
}

export function describeSkew(d: DemographicsSkew): string[] {
  const lines: string[] = [];

  // 1. Strongest positive age band
  let strongestPosBand: AgeBand | null = null;
  let maxPosVal = -Infinity;

  // 2. Strongest negative age band
  let strongestNegBand: AgeBand | null = null;
  let maxNegVal = Infinity;

  for (const band of AGE_BANDS_ORDER) {
    const val = d.age[band];
    if (val !== undefined && Number.isFinite(val)) {
      if (val > maxPosVal) {
        maxPosVal = val;
        strongestPosBand = band;
      }
      if (val < maxNegVal) {
        maxNegVal = val;
        strongestNegBand = band;
      }
    }
  }

  if (strongestPosBand && maxPosVal >= 0.15) {
    lines.push(`${skewLabel(maxPosVal)} ${AGE_LABELS[strongestPosBand]}`);
  }

  if (strongestNegBand && maxNegVal <= -0.15) {
    lines.push(`${skewLabel(maxNegVal)} ${AGE_LABELS[strongestNegBand]}`);
  }

  // 3. Gender line
  const maleVal = d.gender.male;
  if (Number.isFinite(maleVal) && Math.abs(maleVal) >= 0.15) {
    const absMale = Math.abs(maleVal);
    const towardGroup = maleVal > 0 ? "men" : "women";
    const intensity = absMale >= 0.4 ? "skews strongly toward" : "leans toward";
    lines.push(`${intensity} ${towardGroup}`);
  }

  if (lines.length === 0) {
    return ["No strong age or gender skew for this film in this area."];
  }

  return lines;
}
