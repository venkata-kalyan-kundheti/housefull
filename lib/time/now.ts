/**
 * lib/time/now.ts
 *
 * Deterministic time utilities honoring DEMO_FIXED_NOW.
 * As specified in Section 9.9.
 */

import { getConfig } from "../config";
import { log } from "../log";

/**
 * Returns DEMO_FIXED_NOW when configured, otherwise the current date/time.
 */
export function now(): Date {
  try {
    const config = getConfig();
    if (config.DEMO_FIXED_NOW) {
      return new Date(config.DEMO_FIXED_NOW);
    }
  } catch {
    // Config not loaded or invalid; fall back to real time
  }
  return new Date();
}

/**
 * Calculates hours until a given ISO start time relative to `at` (defaults to now()).
 * Throws RangeError if startsAtIso is not a valid date string.
 */
export function hoursUntil(startsAtIso: string, at: Date = now()): number {
  const timestamp = Date.parse(startsAtIso);
  if (Number.isNaN(timestamp)) {
    throw new RangeError(`Invalid ISO date string: ${startsAtIso}`);
  }
  const startsAt = new Date(timestamp);
  return (startsAt.getTime() - at.getTime()) / (1000 * 60 * 60);
}

/**
 * Formats an ISO string in a given time zone, e.g. "Fri 24 Oct, 7:30 pm".
 * Edge cases: invalid ISO throws RangeError; an invalid time zone falls back to UTC and logs a warning.
 */
export function formatLocal(iso: string, timeZone: string): string {
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) {
    throw new RangeError(`Invalid ISO date string: ${iso}`);
  }
  const date = new Date(timestamp);

  let targetTz = timeZone;
  try {
    // Test if timezone is valid
    Intl.DateTimeFormat(undefined, { timeZone: targetTz });
  } catch {
    log.warn(`Invalid time zone "${timeZone}". Falling back to UTC.`);
    targetTz = "UTC";
  }

  const formatter = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: targetTz,
  });

  // Normalize narrow no-break space (U+202F) to normal space
  return formatter.format(date).replace(/\u202F/g, " ");
}
