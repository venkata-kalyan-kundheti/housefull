/**
 * scripts/seed.ts
 *
 * Idempotent seed script as specified in Section 9.10.
 * Populates theaters, films, and 7 days of synthetic shows.
 */

import { inArray } from "drizzle-orm";
import { getDb } from "../lib/db/client";
import * as schema from "../lib/db/schema";
import {
  DEMO_THEATERS,
  DEMO_FILMS,
  generateSyntheticShows,
  getReferenceT0,
} from "../lib/showtimes/synthetic";
import { isUnderfilled } from "../lib/domain/fill";
import { hoursUntil } from "../lib/time/now";

async function runSeed() {
  console.log("Starting Housefull database seeding...");
  const db = getDb();
  const t0 = getReferenceT0();
  console.log(`Reference instant T0: ${t0.toISOString()}`);

  // 1. Delete existing demo theaters by name (cascades to shows, briefs, campaigns, etc.)
  const theaterNames = DEMO_THEATERS.map((t) => t.name);
  await db
    .delete(schema.theaters)
    .where(inArray(schema.theaters.name, theaterNames));
  console.log("Deleted any existing demo theaters (cascading shows & briefs).");

  // 2. Insert demo films (upsert by title)
  const filmYearMap: Record<string, number> = {
    Inception: 2010,
    "Past Lives": 2023,
    RRR: 2022,
    Kantara: 2022,
  };

  const insertedFilms = await db
    .insert(schema.films)
    .values(
      DEMO_FILMS.map((title) => ({
        title,
        year: filmYearMap[title] ?? 2024,
      }))
    )
    .onConflictDoUpdate({
      target: schema.films.title,
      set: { title: schema.films.title },
    })
    .returning();

  const filmIds = insertedFilms.map((f) => f.id);
  console.log(`Seeded ${insertedFilms.length} demo films.`);

  // 3. Insert theaters
  const insertedTheaters = await db
    .insert(schema.theaters)
    .values(
      DEMO_THEATERS.map((t) => ({
        name: t.name,
        city: t.city,
        lat: t.lat,
        lon: t.lon,
        timeZone: t.timeZone,
      }))
    )
    .returning();
  console.log(`Seeded ${insertedTheaters.length} demo theaters.`);

  // 4. Generate & insert synthetic shows for each theater
  let totalShows = 0;
  for (const theater of insertedTheaters) {
    const syntheticShows = generateSyntheticShows({
      theaterId: theater.id,
      timeZone: theater.timeZone,
      filmIds,
      t0,
      seed: 42,
    });

    // Bulk insert shows in batches of 50
    const batchSize = 50;
    for (let i = 0; i < syntheticShows.length; i += batchSize) {
      const batch = syntheticShows.slice(i, i + batchSize);
      await db.insert(schema.shows).values(
        batch.map((s) => ({
          theaterId: s.theaterId,
          filmId: s.filmId,
          startsAt: new Date(s.startsAt),
          screen: s.screen,
          capacity: s.capacity,
          sold: s.sold,
          source: s.source,
        }))
      );
    }

    totalShows += syntheticShows.length;

    // Count flagged underfilled shows
    const underfilledCount = syntheticShows.filter((s) => {
      const h = hoursUntil(s.startsAt, t0);
      return isUnderfilled({
        sold: s.sold,
        capacity: s.capacity,
        hoursToStart: h,
      });
    }).length;

    console.log(
      `Theater "${theater.name}": seeded ${syntheticShows.length} shows. Currently underfilled: ${underfilledCount}`
    );
  }

  console.log(`\nSeed completed successfully! Total shows created: ${totalShows}`);
}

runSeed().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
