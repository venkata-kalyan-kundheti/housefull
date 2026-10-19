/**
 * lib/validate/knownNames.ts
 *
 * Known-name set and V3 validation rule according to Section 12.2.
 */

export const STOPWORDS = new Set([
  "I",
  "Qloo",
  "Housefull",
  "Monday",
  "Mon",
  "Tuesday",
  "Tue",
  "Wednesday",
  "Wed",
  "Thursday",
  "Thu",
  "Friday",
  "Fri",
  "Saturday",
  "Sat",
  "Sunday",
  "Sun",
  "January",
  "Jan",
  "February",
  "Feb",
  "March",
  "Mar",
  "April",
  "Apr",
  "May",
  "June",
  "Jun",
  "July",
  "Jul",
  "August",
  "Aug",
  "September",
  "Sep",
  "October",
  "Oct",
  "November",
  "Nov",
  "December",
  "Dec",
]);

export interface KnownNameContext {
  filmTitle?: string;
  theaterName?: string;
  city?: string;
  fingerprintNames?: string[];
  channelTitles?: string[];
  segmentLabels?: string[];
  partnerNames?: string[];
  hotspotLabels?: string[];
  allowedTokens?: string[];
}

/**
 * Builds the lowercase allowedNames set from context data.
 */
export function buildAllowedNames(ctx: KnownNameContext): string[] {
  const names: string[] = [];

  const add = (str?: string | null) => {
    if (str && str.trim()) {
      names.push(str.trim().toLowerCase());
    }
  };

  add(ctx.filmTitle);
  add(ctx.theaterName);
  add(ctx.city);

  ctx.fingerprintNames?.forEach(add);
  ctx.channelTitles?.forEach(add);
  ctx.segmentLabels?.forEach(add);
  ctx.partnerNames?.forEach(add);

  ctx.hotspotLabels?.forEach((label) => {
    add(label);
    const short = label.split("(")[0]?.trim();
    if (short) add(short);
  });

  ctx.allowedTokens?.forEach((token) => {
    add(token);
    token
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 0)
      .forEach(add);
  });

  return Array.from(new Set(names));
}

export interface UnknownNameViolation {
  rule: "V3";
  run: string;
  snippet: string;
}

const WORD_RUN_REGEX = /^[A-Z][A-Za-z'’-]*$/;

/**
 * Checks text for unknown capitalized entity names (V3).
 */
export function findUnknownNames(
  prose: string,
  allowedNames: string[]
): UnknownNameViolation[] {
  const violations: UnknownNameViolation[] = [];
  // Split on sentence boundaries
  const sentences = prose.split(/(?<=[.!?])\s+/);

  for (const sentence of sentences) {
    const rawTokens = sentence.trim().split(/\s+/).filter((t) => t.length > 0);
    if (rawTokens.length <= 1) {
      continue;
    }

    // Ignore the first word of the sentence
    const candidateTokens = rawTokens.slice(1);

    let currentRun: string[] = [];

    const evaluateRun = (run: string[]) => {
      if (run.length === 0) return;

      // Skip if every word in the run is in STOPWORDS
      const allStopwords = run.every((w) => STOPWORDS.has(w));
      if (allStopwords) {
        return;
      }

      const runText = run.join(" ");
      const lowerRun = runText.toLowerCase();

      // Check if lowerRun is a substring of any allowed name
      const isKnown = allowedNames.some((allowed) => allowed.includes(lowerRun));
      if (!isKnown) {
        violations.push({
          rule: "V3",
          run: runText,
          snippet: runText.slice(0, 60),
        });
      }
    };

    for (const rawWord of candidateTokens) {
      // Check if word has clause-separating punctuation at the end
      const endsWithClausePunctuation = /[,;:—–]$/.test(rawWord);
      // Strip surrounding punctuation
      const cleanWord = rawWord.replace(/^[^A-Za-z'’-]+|[^A-Za-z'’-]+$/g, "");

      if (cleanWord.length >= 2 && WORD_RUN_REGEX.test(cleanWord)) {
        currentRun.push(cleanWord);
        if (endsWithClausePunctuation) {
          evaluateRun(currentRun);
          currentRun = [];
        }
      } else {
        if (currentRun.length > 0) {
          evaluateRun(currentRun);
          currentRun = [];
        }
      }
    }

    if (currentRun.length > 0) {
      evaluateRun(currentRun);
    }
  }

  return violations;
}
