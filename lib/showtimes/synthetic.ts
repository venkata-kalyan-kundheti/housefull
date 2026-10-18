/**
 * lib/showtimes/synthetic.ts
 *
 * Synthetic showtimes generator as specified in Section 9.10.
 */

import { mulberry32 } from "./prng";
import { expectedProgress } from "../domain/fill";
import { hoursUntil, now } from "../time/now";
import type { ShowtimeRecord, ShowtimeSource } from "./source";

export interface DemoTheater {
  name: string;
  city: string;
  lat: number;
  lon: number;
  timeZone: string;
}

export const DEMO_THEATERS: readonly DemoTheater[] = [
  {
    name: "Housefull Demo Cinema NYC",
    city: "New York",
    lat: 40.758,
    lon: -73.9855,
    timeZone: "America/New_York",
  },
  {
    name: "Housefull Demo Cinema Hyderabad",
    city: "Hyderabad",
    lat: 17.385,
    lon: 78.4867,
    timeZone: "Asia/Kolkata",
  },
  {
    name: "Housefull Demo Cinema Mumbai",
    city: "Mumbai",
    lat: 19.076,
    lon: 72.8777,
    timeZone: "Asia/Kolkata",
  },
] as const;

export const DEMO_FILMS = [
  "Inception",
  "Past Lives",
  "RRR",
  "Kantara",
] as const;

export const SCREEN_CONFIGS = [
  { screen: 1, capacity: 80 },
  { screen: 2, capacity: 120 },
  { screen: 3, capacity: 200 },
] as const;

export const DAILY_SLOTS = [
  { hour: 11, minute: 0, isDaytime: true },
  { hour: 14, minute: 30, isDaytime: true },
  { hour: 18, minute: 0, isDaytime: false },
  { hour: 21, minute: 15, isDaytime: false },
] as const;

export function localToUtcIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): string {
  const targetUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  });

  const parts = dtf.formatToParts(new Date(targetUtc));
  const p: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      p[part.type] = Number.parseInt(part.value, 10);
    }
  }

  const localTimeInTz = Date.UTC(
    p.year ?? year,
    (p.month ?? month) - 1,
    p.day ?? day,
    p.hour ?? hour,
    p.minute ?? minute,
    p.second ?? 0
  );

  const offsetMs = targetUtc - localTimeInTz;
  return new Date(targetUtc + offsetMs).toISOString();
}

/**
 * Returns reference instant T0 rounded down to the hour.
 */
export function getReferenceT0(customNow?: Date): Date {
  const base = customNow ?? now();
  const t0 = new Date(base);
  t0.setMinutes(0, 0, 0);
  return t0;
}

export function generateSyntheticShows(args: {
  theaterId: string;
  timeZone: string;
  filmIds: string[];
  t0?: Date;
  seed?: number;
}): ShowtimeRecord[] {
  const { theaterId, timeZone, filmIds, t0 = getReferenceT0(), seed = 42 } = args;
  const rng = mulberry32(seed);

  const shows: ShowtimeRecord[] = [];

  // Determine local date parts at T0 in the theater's timezone
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const parts = dtf.formatToParts(t0);
  const p: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      p[part.type] = Number.parseInt(part.value, 10);
    }
  }

  const startYear = p.year ?? t0.getUTCFullYear();
  const startMonth = p.month ?? t0.getUTCMonth() + 1;
  const startDay = p.day ?? t0.getUTCDate();

  // Generate shows for next 7 days (days 0 to 6)
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    // Determine the calendar date for (startDay + dayOffset)
    const baseDate = new Date(Date.UTC(startYear, startMonth - 1, startDay + dayOffset));
    const curYear = baseDate.getUTCFullYear();
    const curMonth = baseDate.getUTCMonth() + 1;
    const curDay = baseDate.getUTCDate();
    const dayOfWeek = baseDate.getUTCDay(); // 0 is Sunday, 6 is Saturday
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    for (const screenConfig of SCREEN_CONFIGS) {
      for (const slot of DAILY_SLOTS) {
        const startsAtIso = localToUtcIso(
          curYear,
          curMonth,
          curDay,
          slot.hour,
          slot.minute,
          timeZone
        );

        // Pick film deterministically
        const filmIndex = Math.floor(rng() * filmIds.length);
        const filmId = filmIds[filmIndex] || filmIds[0] || "film-unknown";

        // Draw finalFill
        let finalFill: number;
        if (isWeekend) {
          // Weekend slots: uniform in 0.45 to 0.95
          finalFill = 0.45 + rng() * (0.95 - 0.45);
        } else if (slot.isDaytime) {
          // Weekday daytime slots: uniform in 0.15 to 0.55
          finalFill = 0.15 + rng() * (0.55 - 0.15);
        } else {
          // Weekday evening slots: uniform in 0.55 to 0.95
          finalFill = 0.55 + rng() * (0.95 - 0.55);
        }

        const h = hoursUntil(startsAtIso, t0);
        const progress = expectedProgress(h);
        const rawSold = Math.round(screenConfig.capacity * finalFill * progress);
        const sold = Math.max(0, Math.min(rawSold, screenConfig.capacity));

        shows.push({
          theaterId,
          filmId,
          startsAt: startsAtIso,
          screen: screenConfig.screen,
          capacity: screenConfig.capacity,
          sold,
          source: "synthetic",
        });
      }
    }
  }

  return shows;
}

export class SyntheticShowtimeSource implements ShowtimeSource {
  readonly kind = "synthetic" as const;
  private readonly filmIds: string[];
  private readonly timeZone: string;
  private readonly t0?: Date;
  private readonly seed?: number;

  constructor(options: {
    filmIds: string[];
    timeZone: string;
    t0?: Date;
    seed?: number;
  }) {
    this.filmIds = options.filmIds;
    this.timeZone = options.timeZone;
    this.t0 = options.t0;
    this.seed = options.seed;
  }

  async listShows(args: {
    theaterId: string;
    fromIso: string;
    toIso: string;
  }): Promise<ShowtimeRecord[]> {
    const all = generateSyntheticShows({
      theaterId: args.theaterId,
      timeZone: this.timeZone,
      filmIds: this.filmIds,
      t0: this.t0,
      seed: this.seed,
    });

    const fromTime = Date.parse(args.fromIso);
    const toTime = Date.parse(args.toIso);

    return all.filter((s) => {
      const t = Date.parse(s.startsAt);
      return t >= fromTime && t <= toTime;
    });
  }
}
