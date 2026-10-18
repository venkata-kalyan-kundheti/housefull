import { describe, it, expect } from "vitest";
import {
  compactSearch,
  compactEntities,
  compactPlaces,
  compactHeatmap,
  compactDemographics,
  compactTags,
} from "@/lib/qloo/compact";

describe("lib/qloo/compact.ts (Section 8.8, 8.11)", () => {
  it("compactSearch drops entries without entity_id or name and handles missing results", () => {
    expect(compactSearch(null)).toEqual([]);
    expect(compactSearch({})).toEqual([]);
    expect(compactSearch({ results: [] })).toEqual([]);

    const raw = {
      results: [
        { entity_id: "ID-1", name: "Valid Film", types: ["urn:entity:movie"] },
        { entity_id: "", name: "No ID" },
        { entity_id: "ID-2", name: "" },
        { entity_id: "ID-3" }, // missing name
      ],
    };

    const compacted = compactSearch(raw);
    expect(compacted).toHaveLength(1);
    expect(compacted[0]?.name).toBe("Valid Film");
    expect(compacted[0]?.entityId).toBe("ID-1");
  });

  it("compactEntities de-duplicates by entityId and sorts by affinity descending", () => {
    const raw = {
      results: {
        entities: [
          {
            entity_id: "E-1",
            name: "Low Affinity",
            query: { affinity: 0.2 },
          },
          {
            entity_id: "E-2",
            name: "High Affinity",
            query: { affinity: 0.9 },
          },
          {
            entity_id: "E-1",
            name: "Duplicate E-1",
            query: { affinity: 0.99 },
          },
          {
            entity_id: "E-3",
            name: "Null Affinity",
            query: { affinity: "not-a-number" },
          },
        ],
      },
    };

    const compacted = compactEntities(raw);
    expect(compacted).toHaveLength(3);
    // E-2 (0.9) must come first, then E-1 (0.2), then E-3 (null)
    expect(compacted[0]?.entityId).toBe("E-2");
    expect(compacted[1]?.entityId).toBe("E-1");
    expect(compacted[2]?.entityId).toBe("E-3");
    expect(compacted[2]?.affinity).toBeNull();
  });

  it("compactEntities collapses whitespace and truncates blurb to 160 characters", () => {
    const longDesc =
      "This is a very long descriptive sentence that will definitely exceed the one hundred and sixty character threshold set in the specification rules for entity blurb compaction. It will be neatly truncated with an ellipsis.";
    const raw = {
      results: {
        entities: [
          {
            entity_id: "E-LONG",
            name: "Long Entity",
            properties: {
              short_descriptions: [{ value: `  Lots   of    spaces   \n\n ${longDesc} ` }],
            },
          },
        ],
      },
    };

    const compacted = compactEntities(raw);
    const blurb = compacted[0]?.blurb;
    expect(blurb).toBeDefined();
    expect(blurb!.length).toBeLessThanOrEqual(160);
    expect(blurb!.endsWith("…")).toBe(true);
    expect(blurb!).not.toContain("   ");
  });

  it("compactPlaces extracts coordinates in priority order and handles missing coords", () => {
    const raw = {
      results: {
        entities: [
          {
            entity_id: "P-1",
            name: "Direct Lat/Lon",
            type: "urn:entity:place",
            properties: { latitude: 40.75, longitude: -73.98, address: "123 Main" },
          },
          {
            entity_id: "P-2",
            name: "Geocode Lat/Lon",
            type: "urn:entity:place",
            properties: { geocode: { latitude: 17.38, longitude: 78.48 } },
          },
          {
            entity_id: "P-3",
            name: "No Coords",
            type: "urn:entity:place",
            properties: {},
          },
        ],
      },
    };

    const compacted = compactPlaces(raw);
    expect(compacted[0]?.lat).toBe(40.75);
    expect(compacted[0]?.address).toBe("123 Main");
    expect(compacted[1]?.lat).toBe(17.38);
    expect(compacted[2]?.lat).toBeNull();
    expect(compacted[2]?.lon).toBeNull();
  });

  it("compactHeatmap drops cells with invalid geohash and caps at 6000 cells", () => {
    const cells = [];
    // Generate 6005 cells
    for (let i = 0; i < 6005; i++) {
      cells.push({
        location: { latitude: 40.0, longitude: -73.0, geohash: "dr5ru7" },
        query: { affinity_rank: i, affinity: 0.5 },
      });
    }

    // Add bad geohash cell
    cells.push({
      location: { latitude: 40.0, longitude: -73.0, geohash: "bad#geohash!" },
      query: { affinity_rank: 99999 },
    });

    const raw = { results: { heatmap: cells } };
    const compacted = compactHeatmap(raw);

    // Bad geohash cell was dropped and capped to 6000
    expect(compacted).toHaveLength(6000);
    // Highest affinity ranks preserved
    expect(compacted[0]?.affinityRank).toBe(6004);
  });

  it("compactDemographics returns null if any age or gender field is missing or non-finite", () => {
    const valid = {
      results: {
        demographics: [
          {
            query: {
              age: {
                "24_and_younger": 0.1,
                "25_to_29": 0.2,
                "30_to_34": -0.1,
                "35_to_44": -0.2,
                "45_to_54": 0.0,
                "55_and_older": -0.1,
              },
              gender: { male: 0.05, female: -0.05 },
            },
          },
        ],
      },
    };
    expect(compactDemographics(valid)).not.toBeNull();

    // Missing gender
    const missingGender = {
      results: {
        demographics: [
          {
            query: {
              age: valid.results.demographics[0]?.query.age,
              gender: { male: 0.05 }, // missing female
            },
          },
        ],
      },
    };
    expect(compactDemographics(missingGender)).toBeNull();

    // Missing age key
    const missingAgeKey = {
      results: {
        demographics: [
          {
            query: {
              age: { "24_and_younger": 0.1 },
              gender: { male: 0.05, female: -0.05 },
            },
          },
        ],
      },
    };
    expect(compactDemographics(missingAgeKey)).toBeNull();
  });

  it("compactTags searches anywhere in structure and handles unexpected shapes safely", () => {
    expect(compactTags(null)).toEqual([]);
    expect(compactTags("unexpected string")).toEqual([]);

    const complex = {
      nested: {
        deeper: [
          { id: "urn:tag:cafe", name: "Coffee Shop" },
          { id: "urn:tag:book_store" }, // name fallback
          { id: "not_a_urn_tag" }, // ignored
          { id: "urn:tag:cafe", name: "Duplicate Cafe" }, // de-duplicated
        ],
      },
    };

    const tags = compactTags(complex);
    expect(tags).toHaveLength(2);
    expect(tags[0]?.id).toBe("urn:tag:cafe");
    expect(tags[0]?.name).toBe("Coffee Shop");
    expect(tags[1]?.id).toBe("urn:tag:book_store");
    expect(tags[1]?.name).toBe("urn:tag:book_store");
  });
});
