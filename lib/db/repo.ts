/**
 * lib/db/repo.ts
 *
 * Database query helpers using Drizzle ORM and typed models.
 */

import { randomUUID } from "node:crypto";
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

/**
 * Gets a brief by ID.
 */
export async function getBriefById(
  id: string
): Promise<{ id: string; showId: string; content: unknown; createdAt: Date } | null> {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.briefs.id,
      showId: schema.briefs.showId,
      content: schema.briefs.content,
      createdAt: schema.briefs.createdAt,
    })
    .from(schema.briefs)
    .where(eq(schema.briefs.id, id))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Gets a cached brief matching showId, inputHash, and mode.
 */
export async function getBriefByHashAndMode(
  showId: string,
  inputHash: string,
  mode: "live" | "replay"
): Promise<{ id: string; content: unknown } | null> {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.briefs.id,
      content: schema.briefs.content,
    })
    .from(schema.briefs)
    .where(
      and(
        eq(schema.briefs.showId, showId),
        eq(schema.briefs.inputHash, inputHash),
        eq(schema.briefs.mode, mode)
      )
    )
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Saves a new brief to the briefs table.
 */
export async function saveBrief(params: {
  id: string;
  showId: string;
  inputHash: string;
  mode: "live" | "replay";
  confidenceLevel: "high" | "medium" | "low";
  content: unknown;
}): Promise<void> {
  const db = getDb();
  await db.insert(schema.briefs).values({
    id: params.id,
    showId: params.showId,
    inputHash: params.inputHash,
    mode: params.mode,
    confidenceLevel: params.confidenceLevel,
    content: params.content,
  });
}

/**
 * Creates a new pipeline execution run record (Section 13).
 */
export async function createRun(params: {
  id: string;
  showId: string;
  status: "running" | "finished" | "failed";
}): Promise<void> {
  const db = getDb();
  await db.insert(schema.runs).values({
    id: params.id,
    showId: params.showId,
    status: params.status,
    events: [],
  });
}

/**
 * Updates a pipeline run record with status, events, and end timestamp.
 */
export async function updateRun(
  id: string,
  updates: {
    status: "running" | "finished" | "failed";
    errorCode?: string | null;
    events: unknown;
    finishedAt?: Date;
  }
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.runs)
    .set({
      status: updates.status,
      errorCode: updates.errorCode ?? null,
      events: updates.events,
      finishedAt: updates.finishedAt ?? new Date(),
    })
    .where(eq(schema.runs.id, id));
}

export interface CreateCampaignParams {
  id?: string;
  briefId: string;
  selectedChannelIds: string[];
  selectedCopy?: Array<{ segmentId: string; variantIndex: number }>;
  offerText?: string | null;
  offerSlug: string;
}

export async function createCampaign(params: CreateCampaignParams) {
  const db = getDb();
  const campaignId = params.id ?? randomUUID();

  // Compute default experiment
  const baseline = 0.05;
  const mdeAbs = 0.02;
  const alpha = 0.05;
  const power = 0.8;
  const { sampleSizePerArm } = await import("../stats/sampleSize");
  const nPerArm = sampleSizePerArm({
    p1: baseline,
    p2: baseline + mdeAbs,
    alpha,
    power,
  });

  const experimentId = randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(schema.campaigns).values({
      id: campaignId,
      briefId: params.briefId,
      selectedChannelIds: params.selectedChannelIds,
      selectedCopy: params.selectedCopy ?? [],
      offerText: params.offerText ?? null,
      offerSlug: params.offerSlug,
    });

    await tx.insert(schema.experiments).values({
      id: experimentId,
      campaignId,
      baseline,
      mdeAbs,
      alpha,
      power,
      nPerArm,
      splitMethod: "list_split",
      baselineIsDefault: true,
      results: null,
    });
  });

  return {
    campaign: {
      id: campaignId,
      briefId: params.briefId,
      offerSlug: params.offerSlug,
      offerText: params.offerText ?? null,
      selectedChannelIds: params.selectedChannelIds,
      selectedCopy: params.selectedCopy ?? [],
      createdAt: new Date().toISOString(),
    },
    experiment: {
      id: experimentId,
      baseline,
      mdeAbs,
      alpha,
      power,
      nPerArm,
      totalPeople: 2 * nPerArm,
      baselineIsDefault: true,
      splitMethod: "list_split" as const,
      results: null,
    },
  };
}

export async function getCampaignById(id: string) {
  const db = getDb();

  const campaignRows = await db
    .select({
      campaign: schema.campaigns,
      brief: schema.briefs,
      show: schema.shows,
      film: schema.films,
    })
    .from(schema.campaigns)
    .innerJoin(schema.briefs, eq(schema.campaigns.briefId, schema.briefs.id))
    .innerJoin(schema.shows, eq(schema.briefs.showId, schema.shows.id))
    .innerJoin(schema.films, eq(schema.shows.filmId, schema.films.id))
    .where(eq(schema.campaigns.id, id))
    .limit(1);

  const row = campaignRows[0];
  if (!row) return null;

  const experimentRows = await db
    .select()
    .from(schema.experiments)
    .where(eq(schema.experiments.campaignId, id))
    .limit(1);

  const exp = experimentRows[0];
  if (!exp) return null;

  const briefContent = row.brief.content as {
    film?: { title: string; qlooEntityId: string };
    show?: unknown;
  };

  return {
    campaign: {
      id: row.campaign.id,
      briefId: row.campaign.briefId,
      offerSlug: row.campaign.offerSlug,
      offerText: row.campaign.offerText,
      selectedChannelIds: row.campaign.selectedChannelIds as string[],
      selectedCopy: row.campaign.selectedCopy as Array<{
        segmentId: string;
        variantIndex: number;
      }>,
      createdAt: row.campaign.createdAt.toISOString(),
    },
    experiment: {
      id: exp.id,
      baseline: exp.baseline,
      mdeAbs: exp.mdeAbs,
      alpha: exp.alpha,
      power: exp.power,
      nPerArm: exp.nPerArm,
      totalPeople: 2 * exp.nPerArm,
      baselineIsDefault: exp.baselineIsDefault,
      splitMethod: exp.splitMethod,
      results: exp.results as Record<string, unknown> | null,
    },
    brief: {
      id: row.brief.id,
      film: {
        title: row.film.title,
        qlooEntityId: briefContent?.film?.qlooEntityId ?? "",
      },
      show: briefContent?.show ?? { id: row.show.id },
    },
  };
}

export async function updateExperimentPlan(
  id: string,
  params: { baseline: number; mdeAbs: number; alpha?: number; power?: number }
) {
  const db = getDb();
  const alpha = params.alpha ?? 0.05;
  const power = params.power ?? 0.8;

  const { sampleSizePerArm } = await import("../stats/sampleSize");
  const nPerArm = sampleSizePerArm({
    p1: params.baseline,
    p2: params.baseline + params.mdeAbs,
    alpha,
    power,
  });

  const updatedRows = await db
    .update(schema.experiments)
    .set({
      baseline: params.baseline,
      mdeAbs: params.mdeAbs,
      alpha,
      power,
      nPerArm,
      baselineIsDefault: false,
      updatedAt: new Date(),
    })
    .where(eq(schema.experiments.id, id))
    .returning();

  const exp = updatedRows[0];
  if (!exp) return null;

  return {
    id: exp.id,
    baseline: exp.baseline,
    mdeAbs: exp.mdeAbs,
    alpha: exp.alpha,
    power: exp.power,
    nPerArm: exp.nPerArm,
    totalPeople: 2 * exp.nPerArm,
    baselineIsDefault: exp.baselineIsDefault,
    splitMethod: exp.splitMethod,
    results: exp.results as Record<string, unknown> | null,
  };
}

export async function saveExperimentResults(
  id: string,
  results: {
    control: { reached: number; converted: number };
    test: { reached: number; converted: number };
    analysis: unknown;
  }
) {
  const db = getDb();

  const updatedRows = await db
    .update(schema.experiments)
    .set({
      results,
      updatedAt: new Date(),
    })
    .where(eq(schema.experiments.id, id))
    .returning();

  return updatedRows[0] ?? null;
}

export async function getOfferBySlug(slug: string) {
  const db = getDb();

  const rows = await db
    .select({
      campaign: schema.campaigns,
      brief: schema.briefs,
      show: schema.shows,
      theater: schema.theaters,
      film: schema.films,
    })
    .from(schema.campaigns)
    .innerJoin(schema.briefs, eq(schema.campaigns.briefId, schema.briefs.id))
    .innerJoin(schema.shows, eq(schema.briefs.showId, schema.shows.id))
    .innerJoin(schema.theaters, eq(schema.shows.theaterId, schema.theaters.id))
    .innerJoin(schema.films, eq(schema.shows.filmId, schema.films.id))
    .where(eq(schema.campaigns.offerSlug, slug))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    filmTitle: row.film.title,
    theaterName: row.theater.name,
    city: row.theater.city,
    startsAtLocal: formatLocal(row.show.startsAt.toISOString(), row.theater.timeZone),
    offerText: row.campaign.offerText,
    campaignId: row.campaign.id,
  };
}

export async function incrementOfferClaim(campaignId: string, src: string) {
  const db = getDb();

  await db
    .insert(schema.offerClaims)
    .values({
      campaignId,
      src,
      count: 1,
    })
    .onConflictDoUpdate({
      target: [schema.offerClaims.campaignId, schema.offerClaims.src],
      set: {
        count: sql`${schema.offerClaims.count} + 1`,
      },
    });
}



