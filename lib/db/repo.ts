/**
 * lib/db/repo.ts
 *
 * Database query helpers using Drizzle ORM and typed models.
 */

import { eq, and, gte, lte, asc, desc, sql } from "drizzle-orm";
import { getDb } from "./client";
import * as schema from "./schema";
import { hoursUntil, formatLocal, now } from "../time/now";
import { projectedFill, isUnderfilled } from "../domain/fill";

export interface ShowView {
  id: string;
  filmTitle: string;
  theaterId: string;
  theaterName: string;
  city: string;
  timeZone: string;
  startsAtIso: string;
  startsAtLocal: string;
  screen: number;
  capacity: number;
  sold: number;
  hoursToStart: number;
  projectedFill: number;
  underfilled: boolean;
  source: "synthetic" | "csv";
  latestBriefId: string | null;
}

export interface ShowDetailsView extends ShowView {
  theater: {
    lat: number;
    lon: number;
  };
}

/**
 * Checks database connectivity with "select 1".
 */
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Lists all registered theaters.
 */
export async function listTheaters() {
  const db = getDb();
  return db.select().from(schema.theaters).orderBy(asc(schema.theaters.name));
}

/**
 * Lists all registered films.
 */
export async function listFilms() {
  const db = getDb();
  return db.select().from(schema.films).orderBy(asc(schema.films.title));
}

/**
 * Queries shows matching criteria, joins metadata, computes fill progress and underfilled flag.
 * Excludes shows that have already started (hoursToStart <= 0).
 */
export async function listShows(args: {
  theaterId?: string;
  fromIso: string;
  toIso: string;
  underfilledOnly?: boolean;
}): Promise<ShowView[]> {
  const db = getDb();
  const currentNow = now();
  const fromDate = new Date(args.fromIso);
  const toDate = new Date(args.toIso);

  const conditions = [
    gte(schema.shows.startsAt, fromDate),
    lte(schema.shows.startsAt, toDate),
  ];

  if (args.theaterId) {
    conditions.push(eq(schema.shows.theaterId, args.theaterId));
  }

  // Join shows with theaters and films
  const rows = await db
    .select({
      show: schema.shows,
      theater: schema.theaters,
      film: schema.films,
    })
    .from(schema.shows)
    .innerJoin(schema.theaters, eq(schema.shows.theaterId, schema.theaters.id))
    .innerJoin(schema.films, eq(schema.shows.filmId, schema.films.id))
    .where(and(...conditions))
    .orderBy(asc(schema.shows.startsAt));

  // Find latest briefs for these shows
  const showIds = rows.map((r) => r.show.id);
  const latestBriefMap = new Map<string, string>();

  if (showIds.length > 0) {
    // Select latest brief per show
    const briefRows = await db
      .select({
        id: schema.briefs.id,
        showId: schema.briefs.showId,
      })
      .from(schema.briefs)
      .where(sql`${schema.briefs.showId} IN ${showIds}`)
      .orderBy(desc(schema.briefs.createdAt));

    for (const b of briefRows) {
      if (!latestBriefMap.has(b.showId)) {
        latestBriefMap.set(b.showId, b.id);
      }
    }
  }

  const showViews: ShowView[] = [];

  for (const { show, theater, film } of rows) {
    const startsAtIso = show.startsAt.toISOString();
    const h = hoursUntil(startsAtIso, currentNow);

    // Section 14.3: Shows that have already started are excluded
    if (h <= 0) continue;

    const projFill = projectedFill(show.sold, show.capacity, h);
    const underfilled = isUnderfilled({
      sold: show.sold,
      capacity: show.capacity,
      hoursToStart: h,
    });

    if (args.underfilledOnly && !underfilled) {
      continue;
    }

    const startsAtLocal = formatLocal(startsAtIso, theater.timeZone);

    showViews.push({
      id: show.id,
      filmTitle: film.title,
      theaterId: theater.id,
      theaterName: theater.name,
      city: theater.city,
      timeZone: theater.timeZone,
      startsAtIso,
      startsAtLocal,
      screen: show.screen,
      capacity: show.capacity,
      sold: show.sold,
      hoursToStart: Number(h.toFixed(2)),
      projectedFill: Number(projFill.toFixed(4)),
      underfilled,
      source: show.source,
      latestBriefId: latestBriefMap.get(show.id) ?? null,
    });
  }

  // Ensure sorted by startsAtIso ascending
  showViews.sort((a, b) => a.startsAtIso.localeCompare(b.startsAtIso));

  return showViews;
}

/**
 * Gets detailed show info including theater coordinates and latest brief.
 */
export async function getShowById(id: string): Promise<ShowDetailsView | null> {
  const db = getDb();
  const currentNow = now();

  const rows = await db
    .select({
      show: schema.shows,
      theater: schema.theaters,
      film: schema.films,
    })
    .from(schema.shows)
    .innerJoin(schema.theaters, eq(schema.shows.theaterId, schema.theaters.id))
    .innerJoin(schema.films, eq(schema.shows.filmId, schema.films.id))
    .where(eq(schema.shows.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const { show, theater, film } = row;
  const startsAtIso = show.startsAt.toISOString();
  const h = hoursUntil(startsAtIso, currentNow);
  const projFill = projectedFill(show.sold, show.capacity, h);
  const underfilled = isUnderfilled({
    sold: show.sold,
    capacity: show.capacity,
    hoursToStart: h,
  });
  const startsAtLocal = formatLocal(startsAtIso, theater.timeZone);

  // Look up latest brief
  const latestBrief = await db
    .select({ id: schema.briefs.id })
    .from(schema.briefs)
    .where(eq(schema.briefs.showId, show.id))
    .orderBy(desc(schema.briefs.createdAt))
    .limit(1);

  return {
    id: show.id,
    filmTitle: film.title,
    theaterId: theater.id,
    theaterName: theater.name,
    city: theater.city,
    timeZone: theater.timeZone,
    startsAtIso,
    startsAtLocal,
    screen: show.screen,
    capacity: show.capacity,
    sold: show.sold,
    hoursToStart: Number(h.toFixed(2)),
    projectedFill: Number(projFill.toFixed(4)),
    underfilled,
    source: show.source,
    latestBriefId: latestBrief[0]?.id ?? null,
    theater: {
      lat: theater.lat,
      lon: theater.lon,
    },
  };
}
