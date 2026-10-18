export interface ConfidenceInput {
  resolution: "exact" | "alternate";
  coreDomainsWithData: number; // count of core domains that have at least 3 items with non-null affinity (0..5)
  geographyOk: boolean;
  demographicsOk: boolean;
  anyPartners: boolean; // at least one partner group with at least one place
  qlooCallCount: number;
}

export interface ConfidenceResult {
  level: "high" | "medium" | "low";
  score: number;
  max: 12;
  reasons: string[];
}

/**
 * Computes the brief confidence score, level, and human-readable reasons (Section 12.6).
 */
export function computeConfidence(input: ConfidenceInput): ConfidenceResult {
  const {
    resolution,
    coreDomainsWithData,
    geographyOk,
    demographicsOk,
    anyPartners,
    qlooCallCount,
  } = input;

  const resolutionScore = resolution === "exact" ? 3 : 1;
  const clampedDomains = Math.max(0, Math.min(5, coreDomainsWithData));
  const geoScore = geographyOk ? 2 : 0;
  const demoScore = demographicsOk ? 1 : 0;
  const partnerScore = anyPartners ? 1 : 0;

  const score = resolutionScore + clampedDomains + geoScore + demoScore + partnerScore;

  let level: "high" | "medium" | "low";
  if (score >= 10) {
    level = "high";
  } else if (score >= 6) {
    level = "medium";
  } else {
    level = "low";
  }

  const reasons: string[] = [];

  // 1. Alternate film
  if (resolution === "alternate") {
    reasons.push("The film was matched approximately, so check the title.");
  }

  // 2. Fewer than 5 core domains
  if (clampedDomains < 5) {
    reasons.push(
      `Only ${clampedDomains} of 5 core taste areas returned enough results.`
    );
  }

  // 3. No geography
  if (!geographyOk) {
    reasons.push("No high-affinity areas were found near the theater.");
  }

  // 4. No demographics
  if (!demographicsOk) {
    reasons.push("Audience age and gender data was unavailable.");
  }

  // 5. No partners
  if (!anyPartners) {
    reasons.push("No partner venues were found.");
  }

  // 6. Always last
  reasons.push(`Based on ${qlooCallCount} Qloo calls.`);

  return {
    level,
    score,
    max: 12,
    reasons,
  };
}
