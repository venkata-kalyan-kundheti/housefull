import { describe, it, expect } from "vitest";
import {
  generateChannelCandidates,
  collectPartnerCategories,
  detectComicSignal,
} from "@/lib/domain/channels";
import { generateSegments } from "@/lib/domain/segments";
import type { FingerprintDomain } from "@/lib/domain/fingerprint";
import type { HotspotResult } from "@/lib/domain/geo";

describe("channels and segments", () => {
  const dummyHotspotsOk: HotspotResult = {
    status: "ok",
    precisionUsed: 6,
    cellsInCatchment: 5,
    cellsTotal: 10,
    hotspots: [
      {
        id: "hs_1",
        geohash: "dr5ru1",
        lat: 40.759,
        lon: -73.981,
        distanceKm: 0.5,
        meanAffinityRank: 0.9,
        cellCount: 3,
        label: "Area near 40.759, -73.981 (0.5 km from the theater)",
      },
      {
        id: "hs_2",
        geohash: "dr5ru2",
        lat: 40.76,
        lon: -73.98,
        distanceKm: 1.2,
        meanAffinityRank: 0.85,
        cellCount: 2,
        label: "Area near 40.760, -73.980 (1.2 km from the theater)",
      },
    ],
  };

  const emptyHotspots: HotspotResult = { status: "unavailable" };

  it("handles empty/undisplayed domains with zero candidates and s_general segment", () => {
    const candidates = generateChannelCandidates({
      fingerprint: [],
      hotspots: emptyHotspots,
    });
    expect(candidates).toEqual([]);

    const segments = generateSegments({
      fingerprint: [],
      hotspots: emptyHotspots,
    });
    expect(segments).toEqual([
      { id: "s_general", label: "Film lovers nearby" },
    ]);
  });

  it("fires candidate rules in stable order and caps item counts", () => {
    const fingerprint: FingerprintDomain[] = [
      {
        domain: "artist",
        callId: "call-art",
        strong: true,
        displayed: true,
        items: [
          { entityId: "A1", name: "Artist 1", affinity: 0.9, tags: [], why: "" },
          { entityId: "A2", name: "Artist 2", affinity: 0.8, tags: [], why: "" },
          { entityId: "A3", name: "Artist 3", affinity: 0.8, tags: [], why: "" },
          { entityId: "A4", name: "Artist 4", affinity: 0.7, tags: [], why: "" },
          { entityId: "A5", name: "Artist 5", affinity: 0.6, tags: [], why: "" },
        ],
      },
      {
        domain: "movie",
        callId: "call-mov",
        strong: true,
        displayed: true,
        items: [
          { entityId: "M1", name: "Movie 1", affinity: 0.9, tags: [], why: "" },
          { entityId: "M2", name: "Movie 2", affinity: 0.8, tags: [], why: "" },
          { entityId: "M3", name: "Movie 3", affinity: 0.7, tags: [], why: "" },
          { entityId: "M4", name: "Movie 4", affinity: 0.6, tags: [], why: "" },
        ],
      },
      {
        domain: "brand",
        callId: "call-brd",
        strong: true,
        displayed: true,
        items: [
          { entityId: "B1", name: "Brand 1", affinity: 0.9, tags: [], why: "" },
        ],
      },
      {
        domain: "book",
        callId: "call-bk",
        strong: true,
        displayed: true,
        items: [
          { entityId: "BK1", name: "Book 1", affinity: 0.8, tags: ["Novel"], why: "" },
          { entityId: "BK2", name: "Comic Book", affinity: 0.8, tags: ["Comic", "Graphic Novel"], why: "" },
        ],
      },
    ];

    expect(detectComicSignal(fingerprint)).toBe(true);

    const candidates = generateChannelCandidates({
      fingerprint,
      hotspots: dummyHotspotsOk,
      heatmapCallId: "call-heat",
    });

    const types = candidates.map((c) => c.type);
    expect(types).toEqual([
      "music_community",
      "title_interest_targets",
      "brand_collab",
      "book_club_or_store",
      "comic_shop",
      "geo_focus",
    ]);

    // Check artist items capped at 4
    const musicCand = candidates.find((c) => c.type === "music_community")!;
    expect(musicCand.items).toHaveLength(4);
    expect(musicCand.items).toEqual(["Artist 1", "Artist 2", "Artist 3", "Artist 4"]);

    // Check comic shop items only contains comic tagged books
    const comicCand = candidates.find((c) => c.type === "comic_shop")!;
    expect(comicCand.items).toEqual(["Comic Book"]);
    expect(comicCand.suggestedPartnerCategory).toBe("comic_book_store");

    // Collect partner categories
    const partnerCats = collectPartnerCategories(candidates, {
      includeCinemaPeers: true,
    });
    // Distinct suggested categories: book_store, comic_book_store, cafe (already 3, so cinema not appended)
    expect(partnerCats).toEqual(["book_store", "comic_book_store", "cafe"]);

    // Check segments
    const segments = generateSegments({
      fingerprint,
      hotspots: dummyHotspotsOk,
    });

    expect(segments.map((s) => s.id)).toEqual([
      "s_music",
      "s_screen",
      "s_taste",
      "s_local",
    ]);
    expect(segments[0]?.label).toBe("Fans of Artist 1, Artist 2");
    expect(segments[1]?.label).toBe("Fans of Movie 1, Movie 2");
    expect(segments[2]?.label).toBe("People who like Brand 1");
    expect(segments[3]?.label).toBe("Nearby areas: Area near 40.759, -73.981, Area near 40.760, -73.980");
  });

  it("appends movie_theater when includeCinemaPeers is true and fewer than 3 categories found", () => {
    const candidates = generateChannelCandidates({
      fingerprint: [
        {
          domain: "book",
          callId: "call-bk",
          strong: true,
          displayed: true,
          items: [
            { entityId: "BK1", name: "Classic Novel", affinity: 0.8, tags: ["Fiction"], why: "" },
          ],
        },
      ],
      hotspots: emptyHotspots,
    });

    const partnerCats = collectPartnerCategories(candidates, {
      includeCinemaPeers: true,
    });
    expect(partnerCats).toEqual(["book_store", "movie_theater"]);
  });
});
