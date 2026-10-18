import { describe, it, expect } from "vitest";
import {
  generateSyntheticShows,
  DEMO_THEATERS,
  DEMO_FILMS,
} from "@/lib/showtimes/synthetic";
import { isUnderfilled } from "@/lib/domain/fill";
import { hoursUntil } from "@/lib/time/now";

describe("lib/showtimes/synthetic.ts (Section 9.10)", () => {
  const dummyFilmIds = DEMO_FILMS.map((_, i) => `film-uuid-${i + 1}`);

  it("generates 84 shows per theater (7 days * 3 screens * 4 slots)", () => {
    const t0 = new Date("2026-10-24T10:00:00.000Z");
    const shows = generateSyntheticShows({
      theaterId: "theater-nyc",
      timeZone: "America/New_York",
      filmIds: dummyFilmIds,
      t0,
      seed: 42,
    });

    expect(shows).toHaveLength(84);
    for (const show of shows) {
      expect(show.sold).toBeGreaterThanOrEqual(0);
      expect(show.sold).toBeLessThanOrEqual(show.capacity);
      expect(show.source).toBe("synthetic");
    }
  });

  it("produces at least 3 flagged underfilled shows per demo theater (Section 9.10 acceptance)", () => {
    const t0 = new Date("2026-10-24T10:00:00.000Z");

    for (const theater of DEMO_THEATERS) {
      const shows = generateSyntheticShows({
        theaterId: `theater-${theater.city.toLowerCase()}`,
        timeZone: theater.timeZone,
        filmIds: dummyFilmIds,
        t0,
        seed: 42,
      });

      const underfilledShows = shows.filter((s) => {
        const h = hoursUntil(s.startsAt, t0);
        return isUnderfilled({
          sold: s.sold,
          capacity: s.capacity,
          hoursToStart: h,
        });
      });

      expect(underfilledShows.length).toBeGreaterThanOrEqual(3);
    }
  });
});
