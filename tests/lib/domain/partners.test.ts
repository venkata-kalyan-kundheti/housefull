import { describe, it, expect } from "vitest";
import { assessPartners, PARTNER_CATEGORIES } from "@/lib/domain/partners";
import type { CompactPlace } from "@/lib/qloo/types";

function createTestPlace(overrides: Partial<CompactPlace> & { entityId: string; name: string }): CompactPlace {
  return {
    type: "place",
    subtype: null,
    popularity: 0.5,
    affinity: 0.8,
    tags: [],
    blurb: null,
    descriptors: [],
    lat: 40.7,
    lon: -74.0,
    address: "123 Test St",
    ...overrides,
  };
}

describe("assessPartners", () => {
  const cafeCategory = PARTNER_CATEGORIES.find((c) => c.key === "cafe")!;
  const theater = { lat: 40.758, lon: -73.9855 };

  it("marks name containing 'Roast' in cafe category as name_matches", () => {
    const places: CompactPlace[] = [
      createTestPlace({
        entityId: "STUB-P1",
        name: "Artisan Coffee Roasters",
        lat: 40.759,
        lon: -73.981,
        tags: [
          { id: "t1", name: "Coffee" },
          { id: "t2", name: "Bakery" },
          { id: "t3", name: "Espresso" },
          { id: "t4", name: "ExtraTag" },
        ],
      }),
    ];

    const results = assessPartners(places, cafeCategory, theater);
    expect(results).toHaveLength(1);
    expect(results[0]?.fit).toBe("name_matches");
    expect(results[0]?.tags).toHaveLength(3); // capped at 3 tags
    expect(results[0]?.tags).toEqual(["Coffee", "Bakery", "Espresso"]);
    expect(typeof results[0]?.distanceKm).toBe("number");
  });

  it("marks unrelated name as check_manually", () => {
    const places: CompactPlace[] = [
      createTestPlace({
        entityId: "STUB-P2",
        name: "Green Horizon Corner",
        lat: 40.76,
        lon: -73.98,
        tags: [{ id: "t1", name: "Outdoors" }],
      }),
    ];

    const results = assessPartners(places, cafeCategory, theater);
    expect(results).toHaveLength(1);
    expect(results[0]?.fit).toBe("check_manually");
  });

  it("deduplicates by entityId and keeps at most 5 places", () => {
    const places: CompactPlace[] = [
      createTestPlace({ entityId: "P1", name: "Roast One" }),
      createTestPlace({ entityId: "P1", name: "Roast One Duplicate" }),
      createTestPlace({ entityId: "P2", name: "Roast Two" }),
      createTestPlace({ entityId: "P3", name: "Roast Three" }),
      createTestPlace({ entityId: "P4", name: "Roast Four" }),
      createTestPlace({ entityId: "P5", name: "Roast Five" }),
      createTestPlace({ entityId: "P6", name: "Roast Six" }),
    ];

    const results = assessPartners(places, cafeCategory, theater);
    expect(results).toHaveLength(5);
    expect(results.map((r) => r.entityId)).toEqual(["P1", "P2", "P3", "P4", "P5"]);
  });

  it("sets distanceKm to null when coordinates are null or theater not provided", () => {
    const places: CompactPlace[] = [
      createTestPlace({ entityId: "P1", name: "City Cafe", lat: null, lon: null }),
    ];

    const res1 = assessPartners(places, cafeCategory, theater);
    expect(res1[0]?.distanceKm).toBeNull();

    const res2 = assessPartners(places, cafeCategory, null);
    expect(res2[0]?.distanceKm).toBeNull();
  });
});
