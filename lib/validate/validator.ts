/**
 * lib/validate/validator.ts
 *
 * Full brief validation suite implementing rules V1 through V12 (Section 12).
 */

import { checkClaimFilters } from "./claimFilter";
import { findUnknownNames } from "./knownNames";

export type ValidationSeverity = "error" | "regenerate-once" | "warn";

export interface ValidationIssue {
  rule:
    | "V1"
    | "V2"
    | "V3"
    | "V4"
    | "V5"
    | "V6"
    | "V7"
    | "V8"
    | "V9"
    | "V10"
    | "V11"
    | "V12";
  severity: ValidationSeverity;
  message: string;
  snippet?: string;
}

export interface ValidationResult {
  valid: boolean;
  canRegenerate: boolean;
  issues: ValidationIssue[];
}

/**
 * Checks if more than 20% of letters are outside the Latin script (V12).
 */
export function checkLatinScript(text: string): boolean {
  const letters = text.match(/\p{L}/gu);
  if (!letters || letters.length === 0) {
    return true; // No letters to violate
  }

  // Basic Latin and Latin Extended unicode ranges
  const latinRegex = /[a-zA-Z\u00C0-\u024F]/;
  let nonLatinCount = 0;

  for (const char of letters) {
    if (!latinRegex.test(char)) {
      nonLatinCount++;
    }
  }

  const nonLatinRatio = nonLatinCount / letters.length;
  return nonLatinRatio <= 0.2;
}

/**
 * Validates copy variants for forbidden digits outside allowedTokens (V4).
 */
export function checkCopyDigits(
  variant: string,
  allowedTokens: string[]
): boolean {
  let cleaned = variant;
  for (const token of allowedTokens) {
    if (token) {
      cleaned = cleaned.replaceAll(token, "");
    }
  }
  return !/\d/.test(cleaned);
}

/**
 * Validates prose for V3, V5, V9, V10, V12.
 */
export function validateProse(
  text: string,
  allowedNames: string[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // V12: Script check
  if (!checkLatinScript(text)) {
    issues.push({
      rule: "V12",
      severity: "regenerate-once",
      message: "More than 20% of letters are outside Latin script",
      snippet: text.slice(0, 60),
    });
  }

  // V5, V9, V10: Claim, exclusion, contact
  const claimMatches = checkClaimFilters(text);
  for (const match of claimMatches) {
    issues.push({
      rule: match.rule,
      severity: "regenerate-once",
      message: `Violated ${match.rule} pattern: ${match.pattern}`,
      snippet: match.snippet,
    });
  }

  // V3: Known names
  const unknownNames = findUnknownNames(text, allowedNames);
  for (const unk of unknownNames) {
    issues.push({
      rule: "V3",
      severity: "regenerate-once",
      message: `Unknown capitalized name: ${unk.run}`,
      snippet: unk.snippet,
    });
  }

  return issues;
}

/**
 * Validates channel ranking output (V2, prose checks).
 */
export function validateChannelsOutput(
  output: {
    ranked: Array<{ id: string; priority: number; rationale: string }>;
    dropped: Array<{ id: string; reason: string }>;
  },
  candidateIds: string[],
  allowedNames: string[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const candidateSet = new Set(candidateIds);
  const seenIds = new Set<string>();

  const allItems = [...output.ranked, ...output.dropped];

  for (const item of allItems) {
    if (!candidateSet.has(item.id)) {
      issues.push({
        rule: "V2",
        severity: "error",
        message: `Channel id "${item.id}" is not in candidates`,
        snippet: item.id,
      });
    }

    if (seenIds.has(item.id)) {
      issues.push({
        rule: "V2",
        severity: "error",
        message: `Duplicate channel id "${item.id}"`,
        snippet: item.id,
      });
    }
    seenIds.add(item.id);
  }

  // Check rationales and reasons
  for (const item of output.ranked) {
    issues.push(...validateProse(item.rationale, allowedNames));
  }
  for (const item of output.dropped) {
    issues.push(...validateProse(item.reason, allowedNames));
  }

  return issues;
}

/**
 * Validates copy output (V4, V7, V11, prose checks).
 */
export function validateCopyOutput(
  output: {
    segments: Array<{ segmentId: string; variants: string[] }>;
  },
  expectedSegmentIds: string[],
  allowedNames: string[],
  allowedTokens: string[],
  filmTitle?: string,
  showtimeText?: string
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const expectedSet = new Set(expectedSegmentIds);
  const receivedIds = output.segments.map((s) => s.segmentId);

  // V7: Segment IDs must match exactly
  if (
    receivedIds.length !== expectedSegmentIds.length ||
    !receivedIds.every((id) => expectedSet.has(id))
  ) {
    issues.push({
      rule: "V7",
      severity: "error",
      message: "Copy segment IDs do not match expected segments exactly",
    });
  }

  for (const seg of output.segments) {
    // V7: 3 variants must be pairwise different (case-insensitive)
    const lowerVariants = seg.variants.map((v) => v.toLowerCase().trim());
    if (new Set(lowerVariants).size !== seg.variants.length) {
      issues.push({
        rule: "V7",
        severity: "error",
        message: `Variants for segment "${seg.segmentId}" are not pairwise distinct`,
      });
    }

    for (const variant of seg.variants) {
      // V4: Digits outside allowed tokens
      if (!checkCopyDigits(variant, allowedTokens)) {
        issues.push({
          rule: "V4",
          severity: "regenerate-once",
          message: "Variant contains forbidden digits outside allowed tokens",
          snippet: variant.slice(0, 60),
        });
      }

      // V11: Warn only if missing film title or showtime text
      if (filmTitle && !variant.toLowerCase().includes(filmTitle.toLowerCase())) {
        issues.push({
          rule: "V11",
          severity: "warn",
          message: "Variant does not mention film title",
          snippet: variant.slice(0, 60),
        });
      }
      if (
        showtimeText &&
        !variant.toLowerCase().includes(showtimeText.toLowerCase())
      ) {
        issues.push({
          rule: "V11",
          severity: "warn",
          message: "Variant does not mention showtime text",
          snippet: variant.slice(0, 60),
        });
      }

      // General prose checks (V3, V5, V9, V10, V12)
      issues.push(...validateProse(variant, allowedNames));
    }
  }

  return issues;
}

/**
 * Validates summary output (prose checks).
 */
export function validateSummaryOutput(
  summaryText: string,
  allowedNames: string[]
): ValidationIssue[] {
  return validateProse(summaryText, allowedNames);
}
