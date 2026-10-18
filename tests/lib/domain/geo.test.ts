import { describe, it, expect } from "vitest";
import { geohashDecode, haversineKm, buildHotspots } from "@/lib/domain/geo";
import type { HeatCell } from "@/lib/qloo/types";

describe("geohashDecode", () => {
  it("decodes test vector ezs42 with 1e-9 tolerance", () => {
    const res = geohashDecode("ezs42");
    expect(res.lat).toBeCloseTo(42.60498046875, 9);
    expect(res.lon).toBeCloseTo(-5.60302734375, 9);
  });

  it("decodes test vector dr5ru", () => {
    const res = geohashDecode("dr5ru");
    expect(res.lat).toBeCloseTo(40.75927734375, 9);
    expect(res.lon).toBeCloseTo(-73.98193359375, 9);
  });

  it("decodes test vector tepfc", () => {
    const res = geohashDecode("tepfc");
    expect(res.lat).toBeCloseTo(17.38037109375, 9);
    expect(res.lon).toBeCloseTo(78.46435546875, 9);
  });

  it("decodes test vector dr5r", () => {
    const res = geohashDecode("dr5r");
    expect(res.lat).toBeCloseTo(40.693359375, 9);
    expect(res.lon).toBeCloseTo(-74.00390625, 9);
  });

  it("throws RangeError on invalid character 'a'", () => {
    expect(() => geohashDecode("a")).toThrow(RangeError);
  });

  it("throws RangeError on empty string", () => {
    expect(() => geohashDecode("")).toThrow(RangeError);
  });
});

describe("haversineKm", () => {
  it("computes 1 degree longitude at equator to 111.19508 km (tolerance 0.001)", () => {
    const dist = haversineKm(0, 0, 0, 1);
    expect(dist).toBeCloseTo(111.19508, 3);
  });

  it("computes NYC distance vector to 9.12395 km (tolerance 0.001)", () => {
    const dist = haversineKm(40.758, -73.9855, 40.6892, -74.0445);
    expect(dist).toBeCloseTo(9.12395, 3);
  });

  it("computes London to Paris vector to 343.5565 km (tolerance 0.01)", () => {
    const dist = haversineKm(51.5074, -0.1278, 48.8566, 2.3522);
    expect(dist).toBeCloseTo(343.5565, 2);
  });

  it("returns 0 for identical coordinates", () => {
    expect(haversineKm(40.758, -73.9855, 40.758, -73.9855)).toBe(0);
  });
});

describe("buildHotspots", () => {
  const theater = { lat: 40.758, lon: -73.9855 };

  it("returns unavailable for empty cells", () => {
    const res = buildHotspots({ cells: [], theater, radiusKm: 15 });
    expect(res).toEqual({ status: "unavailable" });
  });

  it("returns no_cells_in_catchment when all cells are outside radius", () => {
    const farCells: HeatCell[] = [
      { geohash: "u4pru", lat: 51.5074, lon: -0.1278, affinityRank: 0.9, affinity: null, popularity: null },
    ];
    const res = buildHotspots({ cells: farCells, theater, radiusKm: 10 });
    expect(res).toEqual({ status: "no_cells_in_catchment", cellsTotal: 1 });
  });

  it("groups cells by prefix min(6, minLen) and calculates mean affinity", () => {
    // dr5ru is in Times Square NYC
    const cells: HeatCell[] = [
      { geohash: "dr5ru1", lat: 40.759, lon: -73.981, affinityRank: 0.8, affinity: 0.8, popularity: null },
      { geohash: "dr5ru2", lat: 40.7592, lon: -73.9815, affinityRank: 0.9, affinity: 0.9, popularity: null },
      { geohash: "dr5rt1", lat: 40.755, lon: -73.986, affinityRank: 0.7, affinity: 0.7, popularity: null },
    ];
    const res = buildHotspots({ cells, theater, radiusKm: 10 });
    expect(res.status).toBe("ok");
    if (res.status === "ok") {
      expect(res.cellsTotal).toBe(3);
      expect(res.cellsInCatchment).toBe(3);
      expect(res.precisionUsed).toBe(6);
      expect(res.hotspots.length).toBe(3);
      expect(res.hotspots[0]?.id).toBe("hs_1");
    }
  });

  it("breaks ties deterministically by distance then geohash", () => {
    const c1Decoded = geohashDecode("dr5rt");
    const c2Decoded = geohashDecode("dr5ru");
    const cells: HeatCell[] = [
      { geohash: "dr5rt", lat: c1Decoded.lat, lon: c1Decoded.lon, affinityRank: 0.8, affinity: null, popularity: null },
      { geohash: "dr5ru", lat: c2Decoded.lat, lon: c2Decoded.lon, affinityRank: 0.8, affinity: null, popularity: null },
    ];
    const res = buildHotspots({ cells, theater, radiusKm: 20 });
    expect(res.status).toBe("ok");
    if (res.status === "ok") {
      expect(res.precisionUsed).toBe(5);
      expect(res.hotspots[0]?.meanAffinityRank).toBe(0.8);
      expect(res.hotspots[1]?.meanAffinityRank).toBe(0.8);
      expect(res.hotspots[0]?.distanceKm).toBeLessThanOrEqual(res.hotspots[1]!.distanceKm);
    }
  });

  it("includes cells exactly on the radius boundary", () => {
    const dist = haversineKm(theater.lat, theater.lon, 40.759, -73.981);
    const cells: HeatCell[] = [
      { geohash: "dr5ru", lat: 40.759, lon: -73.981, affinityRank: 0.85, affinity: null, popularity: null },
    ];
    const res = buildHotspots({ cells, theater, radiusKm: dist });
    expect(res.status).toBe("ok");
  });
});
