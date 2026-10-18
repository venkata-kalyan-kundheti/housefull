/**
 * lib/domain/resolveFilm.ts
 *
 * Film title resolution against Qloo search results as specified in Section 9.1.
 */

import { normalizeTitle } from "./text";
import type { CompactSearchResult } from "../qloo/types";

export type ResolveOutcome =
  | {
      resolution: "exact" | "alternate";
      chosen: CompactSearchResult;
      alternates: CompactSearchResult[];
      warnings: string[];
    }
  | {
      resolution: "unresolved";
      alternates: CompactSearchResult[];
      warnings: string[];
    };

interface ScoredCandidate {
  candidate: CompactSearchResult;
  baseScore: number;
  totalScore: number;
  originalIndex: number;
}

export function resolveFilm(
  input: { title: string; year?: number },
  results: CompactSearchResult[]
): ResolveOutcome {
  const warnings: string[] = [];

  if (!results || results.length === 0) {
    return {
      resolution: "unresolved",
      alternates: [],
      warnings,
    };
  }

  // 1. Candidates = results whose types array contains a string ending in :movie
  let candidates = results.filter((r) =>
    r.types.some((t) => t.endsWith(":movie") || t === "movie")
  );

  if (candidates.length === 0) {
    candidates = results;
    warnings.push("type_unverified");
  }

  const normInput = normalizeTitle(input.title);

  // 2. Score each candidate
  const scored: ScoredCandidate[] = candidates.map((cand, idx) => {
    const normName = normalizeTitle(cand.name);
    let baseScore = 0;

    if (normName === normInput) {
      baseScore = 100;
    } else if (normName.startsWith(normInput)) {
      baseScore = 60;
    } else {
      // Check if it contains the input as whole words
      const wordsRegex = new RegExp(`\\b${normInput.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
      if (wordsRegex.test(normName)) {
        baseScore = 30;
      } else {
        baseScore = 0;
      }
    }

    let totalScore = baseScore + (cand.popularity ?? 0) * 10;

    if (input.year && cand.disambiguation && cand.disambiguation.includes(String(input.year))) {
      totalScore += 20;
    }

    return {
      candidate: cand,
      baseScore,
      totalScore,
      originalIndex: idx,
    };
  });

  // 3. Sort by score descending; ties keep original order
  scored.sort((a, b) => {
    if (b.totalScore !== a.totalScore) {
      return b.totalScore - a.totalScore;
    }
    return a.originalIndex - b.originalIndex;
  });

  const top = scored[0];
  if (!top || top.baseScore === 0) {
    return {
      resolution: "unresolved",
      alternates: [],
      warnings,
    };
  }

  // Check if two or more candidates are exact matches
  const exactMatches = scored.filter((s) => s.baseScore === 100);
  if (exactMatches.length >= 2) {
    warnings.push("multiple_exact_matches");
  }

  // 4. Take top candidate
  let resolution: "exact" | "alternate";
  if (top.baseScore === 100) {
    resolution = "exact";
  } else {
    resolution = "alternate";
    warnings.push("no_exact_title_match");
  }

  // 5. Alternates = next 4 candidates by score (excluding chosen one) that scored at least 30
  const alternates = scored
    .slice(1)
    .filter((s) => s.baseScore >= 30)
    .slice(0, 4)
    .map((s) => s.candidate);

  return {
    resolution,
    chosen: top.candidate,
    alternates,
    warnings,
  };
}
