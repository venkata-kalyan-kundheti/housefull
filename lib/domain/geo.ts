import type { HeatCell } from "@/lib/qloo/types";

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";
const EARTH_RADIUS_KM = 6371.0088;

export interface GeohashDecoded {
  lat: number;
  lon: number;
  latErr: number;
  lonErr: number;
}

export interface Hotspot {
  id: string;
  geohash: string;
  lat: number;
  lon: number;
  distanceKm: number;
  meanAffinityRank: number;
  cellCount: number;
  label: string;
}

export type HotspotResult =
  | {
      status: "ok";
      precisionUsed: number;
      hotspots: Hotspot[];
      cellsInCatchment: number;
      cellsTotal: number;
    }
  | { status: "no_cells_in_catchment"; cellsTotal: number }
  | { status: "unavailable" };

/**
 * Decodes a geohash string into latitude, longitude, and half-width errors.
 * Base32 alphabet: 0123456789bcdefghjkmnpqrstuvwxyz
 * Throws RangeError on invalid character or empty string.
 */
export function geohashDecode(hash: string): GeohashDecoded {
  if (!hash || hash.length === 0) {
    throw new RangeError("Geohash cannot be empty");
  }

  let latMin = -90.0;
  let latMax = 90.0;
  let lonMin = -180.0;
  let lonMax = 180.0;
  let isLon = true;

  for (let i = 0; i < hash.length; i++) {
    const char = hash[i] ?? "";
    const idx = BASE32.indexOf(char);
    if (idx === -1) {
      throw new RangeError(`Invalid geohash character: "${char}"`);
    }

    for (let bitIdx = 4; bitIdx >= 0; bitIdx--) {
      const bit = (idx >> bitIdx) & 1;
      if (isLon) {
        const mid = (lonMin + lonMax) / 2;
        if (bit === 1) {
          lonMin = mid;
        } else {
          lonMax = mid;
        }
      } else {
        const mid = (latMin + latMax) / 2;
        if (bit === 1) {
          latMin = mid;
        } else {
          latMax = mid;
        }
      }
      isLon = !isLon;
    }
  }

  return {
    lat: (latMin + latMax) / 2,
    lon: (lonMin + lonMax) / 2,
    latErr: (latMax - latMin) / 2,
    lonErr: (lonMax - lonMin) / 2,
  };
}

/**
 * Great-circle distance between two points in km using Haversine formula.
 * Earth radius = 6371.0088 km.
 */
export function haversineKm(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number
): number {
  if (aLat === bLat && aLon === bLon) {
    return 0;
  }

  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const lat1 = (aLat * Math.PI) / 180;
  const lat2 = (bLat * Math.PI) / 180;

  const sinHalfDLat = Math.sin(dLat / 2);
  const sinHalfDLon = Math.sin(dLon / 2);

  const a =
    sinHalfDLat * sinHalfDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinHalfDLon * sinHalfDLon;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

export interface BuildHotspotsInput {
  cells: HeatCell[];
  theater: { lat: number; lon: number };
  radiusKm: number;
  topN?: number;
}

/**
 * Groups nearby heat cells into hotspots ordered by mean affinity rank.
 */
export function buildHotspots(input: BuildHotspotsInput): HotspotResult {
  const { cells, theater, radiusKm, topN = 8 } = input;
  const cellsTotal = cells.length;

  if (cellsTotal === 0) {
    return { status: "unavailable" };
  }

  const keptCells: Array<{ cell: HeatCell; distanceKm: number }> = [];

  for (const cell of cells) {
    const dist = haversineKm(theater.lat, theater.lon, cell.lat, cell.lon);
    if (dist <= radiusKm) {
      keptCells.push({ cell, distanceKm: dist });
    }
  }

  const cellsInCatchment = keptCells.length;
  if (cellsInCatchment === 0) {
    return { status: "no_cells_in_catchment", cellsTotal };
  }

  let minLen = Infinity;
  for (const { cell } of keptCells) {
    if (cell.geohash.length < minLen) {
      minLen = cell.geohash.length;
    }
  }

  const precisionUsed = Math.min(6, minLen);

  const groups = new Map<string, { totalAffinity: number; count: number }>();
  for (const { cell } of keptCells) {
    const prefix = cell.geohash.slice(0, precisionUsed);
    const existing = groups.get(prefix);
    if (existing) {
      existing.totalAffinity += cell.affinityRank;
      existing.count += 1;
    } else {
      groups.set(prefix, { totalAffinity: cell.affinityRank, count: 1 });
    }
  }

  const hotspotCandidates: Array<{
    geohash: string;
    lat: number;
    lon: number;
    distanceKm: number;
    meanAffinityRank: number;
    cellCount: number;
  }> = [];

  for (const [prefix, data] of groups.entries()) {
    const decoded = geohashDecode(prefix);
    const dist = haversineKm(theater.lat, theater.lon, decoded.lat, decoded.lon);
    hotspotCandidates.push({
      geohash: prefix,
      lat: decoded.lat,
      lon: decoded.lon,
      distanceKm: dist,
      meanAffinityRank: data.totalAffinity / data.count,
      cellCount: data.count,
    });
  }

  hotspotCandidates.sort((a, b) => {
    if (b.meanAffinityRank !== a.meanAffinityRank) {
      return b.meanAffinityRank - a.meanAffinityRank;
    }
    if (a.distanceKm !== b.distanceKm) {
      return a.distanceKm - b.distanceKm;
    }
    return a.geohash.localeCompare(b.geohash);
  });

  const selected = hotspotCandidates.slice(0, topN);
  const hotspots: Hotspot[] = selected.map((c, idx) => ({
    id: `hs_${idx + 1}`,
    geohash: c.geohash,
    lat: c.lat,
    lon: c.lon,
    distanceKm: c.distanceKm,
    meanAffinityRank: c.meanAffinityRank,
    cellCount: c.cellCount,
    label: `Area near ${c.lat.toFixed(3)}, ${c.lon.toFixed(3)} (${c.distanceKm.toFixed(1)} km from the theater)`,
  }));

  return {
    status: "ok",
    precisionUsed,
    hotspots,
    cellsInCatchment,
    cellsTotal,
  };
}
