/**
 * lib/validate/claimFilter.ts
 *
 * Claim, exclusion, and contact information regex filters according to Section 12.3.
 */

export const CLAIM_PATTERNS: RegExp[] = [
  /\bguarantee(d|s)?\b/i,
  /\bwill\s+(increase|boost|raise|double|triple|fill|sell|drive|generate|bring|attract)\b/i,
  /\b(proven|proves?|ensures?)\b/i,
  /\b\d+(\.\d+)?\s?%/,
  /\bsell(s|ing)?\s+out\b/i,
  /\bsold[-\s]?out\b/i,
  /\b(definitely|certainly|surely|100\s?percent)\b/i,
  /\bmore\s+(tickets|seats|sales|bookings|revenue|footfall)\b/i,
];

export const EXCLUSION_PATTERNS: RegExp[] = [
  /\b(only|exclusively|just)\s+(for\s+)?(men|women|males|females|boys|girls|young|youth|old|older|seniors|millennials|gen\s?z)\b/i,
  /\b(exclude|excluding|avoid\s+targeting|skip)\s+(men|women|males|females|older|younger|seniors|young)\b/i,
];

export const CONTACT_PATTERNS: RegExp[] = [
  /@[A-Za-z0-9._-]+\.[A-Za-z]{2,}/,
  /https?:\/\//i,
  /\bwww\./i,
  /\+?\d[\d\s().-]{8,}\d/,
];

export interface ViolationMatch {
  rule: "V5" | "V9" | "V10";
  pattern: string;
  snippet: string;
}

/**
 * Scans text for claim, exclusion, and contact violations.
 */
export function checkClaimFilters(text: string): ViolationMatch[] {
  const violations: ViolationMatch[] = [];

  for (const pattern of CLAIM_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      violations.push({
        rule: "V5",
        pattern: pattern.source,
        snippet: match[0].slice(0, 60),
      });
    }
  }

  for (const pattern of EXCLUSION_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      violations.push({
        rule: "V9",
        pattern: pattern.source,
        snippet: match[0].slice(0, 60),
      });
    }
  }

  for (const pattern of CONTACT_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      violations.push({
        rule: "V10",
        pattern: pattern.source,
        snippet: match[0].slice(0, 60),
      });
    }
  }

  return violations;
}
