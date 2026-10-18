/**
 * lib/qloo/compact.ts
 *
 * Pure compaction functions for Qloo responses as specified in Section 8.8.
 * Never throws, tolerates any shape, and produces clean Compact types.
 */

import type {
  CompactEntity,
  CompactPlace,
  CompactSearchResult,
  CompactTag,
  HeatCell,
  DemographicsSkew,
  AgeBand,
} from "./types";

export const COMPACTION_VERSION = 1;

const GEOHASH_CHARS_REGEX = /^[0123456789bcdefghjkmnpqrstuvwxyz]+$/;

function isFiniteNumber(val: unknown): val is number {
  return typeof val === "number" && Number.isFinite(val);
}

function isNonEmptyString(val: unknown): val is string {
  return typeof val === "string" && val.trim().length > 0;
}

/**
 * Compacts /search responses.
 */
export function compactSearch(raw: unknown): CompactSearchResult[] {
  if (!raw || typeof raw !== "object") return [];
  const body = raw as { results?: unknown };
  if (!Array.isArray(body.results)) return [];

  const results: CompactSearchResult[] = [];

  for (const item of body.results) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;

    const entityId = entry.entity_id;
    const name = entry.name;
    if (!isNonEmptyString(entityId) || !isNonEmptyString(name)) {
      continue;
    }

    const types: string[] = [];
    if (Array.isArray(entry.types)) {
      for (const t of entry.types) {
        if (typeof t === "string") types.push(t);
      }
    }

    const popularity = isFiniteNumber(entry.popularity) ? entry.popularity : null;
    let disambiguation: string | null = null;
    if (isNonEmptyString(entry.disambiguation)) {
      disambiguation = entry.disambiguation.trim().slice(0, 120);
    }

    results.push({
      entityId: entityId.trim(),
      name: name.trim(),
      types,
      popularity,
      disambiguation,
    });
  }

  return results;
}

/**
 * Extracts up to 8 CompactTags from an entity's raw tag array.
 */
function extractTags(rawTags: unknown): CompactTag[] {
  if (!Array.isArray(rawTags)) return [];
  const tags: CompactTag[] = [];

  for (const t of rawTags) {
    if (!t || typeof t !== "object") continue;
    const tagObj = t as Record<string, unknown>;
    if (isNonEmptyString(tagObj.id)) {
      const id = tagObj.id.trim();
      const name = isNonEmptyString(tagObj.name) ? tagObj.name.trim() : id;
      tags.push({ id, name });
      if (tags.length === 8) break;
    }
  }

  return tags;
}

/**
 * Extracts and formats the 160-char blurb from entity properties.
 */
function extractBlurb(properties: unknown): string | null {
  if (!properties || typeof properties !== "object") return null;
  const props = properties as Record<string, unknown>;

  let textToUse: string | null = null;

  if (Array.isArray(props.short_descriptions) && props.short_descriptions.length > 0) {
    const firstDesc = props.short_descriptions[0];
    if (firstDesc && typeof firstDesc === "object" && "value" in firstDesc) {
      const val = (firstDesc as { value?: unknown }).value;
      if (isNonEmptyString(val)) {
        textToUse = val;
      }
    }
  }

  if (!textToUse && isNonEmptyString(props.description)) {
    textToUse = props.description;
  }

  if (!textToUse) return null;

  // Collapse whitespace
  const collapsed = textToUse.replace(/\s+/g, " ").trim();
  if (collapsed.length <= 160) {
    return collapsed;
  }
  return collapsed.slice(0, 159).trim() + "…";
}

/**
 * Extracts up to 3 adjectives_for_fans for artists.
 */
function extractDescriptors(properties: unknown, type: unknown): string[] {
  if (type !== "urn:entity:artist" && type !== "artist") return [];
  if (!properties || typeof properties !== "object") return [];
  const props = properties as Record<string, unknown>;

  if (!Array.isArray(props.adjectives_for_fans)) return [];

  const descriptors: string[] = [];
  for (const item of props.adjectives_for_fans) {
    if (isNonEmptyString(item)) {
      descriptors.push(item.trim());
      if (descriptors.length === 3) break;
    }
  }

  return descriptors;
}

/**
 * Compacts domain entity insights.
 */
export function compactEntities(raw: unknown, take = 10): CompactEntity[] {
  if (!raw || typeof raw !== "object") return [];
  const body = raw as { results?: { entities?: unknown } };
  const rawEntities = body.results?.entities;
  if (!Array.isArray(rawEntities)) return [];

  const entities: CompactEntity[] = [];
  const seenIds = new Set<string>();

  for (const item of rawEntities) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;

    const entityId = entry.entity_id;
    const name = entry.name;
    if (!isNonEmptyString(entityId) || !isNonEmptyString(name)) {
      continue;
    }

    const trimmedId = entityId.trim();
    if (seenIds.has(trimmedId)) {
      continue; // De-duplicate by entityId (keep the first)
    }
    seenIds.add(trimmedId);

    const type = typeof entry.type === "string" ? entry.type : null;
    const subtype = typeof entry.subtype === "string" ? entry.subtype : null;
    const popularity = isFiniteNumber(entry.popularity) ? entry.popularity : null;

    let affinity: number | null = null;
    if (entry.query && typeof entry.query === "object") {
      const q = entry.query as { affinity?: unknown };
      if (isFiniteNumber(q.affinity)) {
        affinity = q.affinity;
      }
    }

    const tags = extractTags(entry.tags);
    const blurb = extractBlurb(entry.properties);
    const descriptors = extractDescriptors(entry.properties, entry.type);

    entities.push({
      entityId: trimmedId,
      name: name.trim(),
      type,
      subtype,
      popularity,
      affinity,
      tags,
      blurb,
      descriptors,
    });
  }

  // Sort by affinity descending, null last; ties keep original order
  entities.sort((a, b) => {
    if (a.affinity === null && b.affinity === null) return 0;
    if (a.affinity === null) return 1;
    if (b.affinity === null) return -1;
    return b.affinity - a.affinity;
  });

  return entities.slice(0, take);
}

/**
 * Compacts place insights (adds coordinates and address).
 */
export function compactPlaces(raw: unknown, take = 8): CompactPlace[] {
  const baseEntities = compactEntities(raw, take * 2); // fetch slightly more to slice after place props
  if (!raw || typeof raw !== "object") return [];
  const body = raw as { results?: { entities?: unknown } };
  const rawEntities = body.results?.entities;
  if (!Array.isArray(rawEntities)) return [];

  const rawMap = new Map<string, Record<string, unknown>>();
  for (const item of rawEntities) {
    if (item && typeof item === "object") {
      const entry = item as Record<string, unknown>;
      if (isNonEmptyString(entry.entity_id)) {
        rawMap.set(entry.entity_id.trim(), entry);
      }
    }
  }

  const places: CompactPlace[] = [];

  for (const entity of baseEntities) {
    const rawEntry = rawMap.get(entity.entityId);
    let lat: number | null = null;
    let lon: number | null = null;
    let address: string | null = null;

    if (rawEntry && rawEntry.properties && typeof rawEntry.properties === "object") {
      const props = rawEntry.properties as Record<string, unknown>;

      // 1. properties.latitude and properties.longitude
      if (isFiniteNumber(props.latitude) && isFiniteNumber(props.longitude)) {
        lat = props.latitude;
        lon = props.longitude;
      }
      // 2. properties.geocode.latitude and longitude
      else if (
        props.geocode &&
        typeof props.geocode === "object" &&
        isFiniteNumber((props.geocode as Record<string, unknown>).latitude) &&
        isFiniteNumber((props.geocode as Record<string, unknown>).longitude)
      ) {
        lat = (props.geocode as Record<string, unknown>).latitude as number;
        lon = (props.geocode as Record<string, unknown>).longitude as number;
      }
      // 3. properties.location.lat and lng / lon
      else if (props.location && typeof props.location === "object") {
        const loc = props.location as Record<string, unknown>;
        const lLat = loc.lat;
        const lLon = loc.lon ?? loc.lng;
        if (isFiniteNumber(lLat) && isFiniteNumber(lLon)) {
          lat = lLat;
          lon = lLon;
        }
      }

      if (isNonEmptyString(props.address)) {
        address = props.address.trim();
      }
    }

    places.push({
      ...entity,
      lat,
      lon,
      address,
    });

    if (places.length === take) break;
  }

  return places;
}

/**
 * Compacts heatmap responses.
 */
export function compactHeatmap(raw: unknown): HeatCell[] {
  if (!raw || typeof raw !== "object") return [];
  const body = raw as { results?: { heatmap?: unknown } };
  const rawCells = body.results?.heatmap;
  if (!Array.isArray(rawCells)) return [];

  const validCells: HeatCell[] = [];

  for (const item of rawCells) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;

    const loc = entry.location;
    const query = entry.query;
    if (!loc || typeof loc !== "object" || !query || typeof query !== "object") {
      continue;
    }

    const locObj = loc as Record<string, unknown>;
    const queryObj = query as Record<string, unknown>;

    const lat = locObj.latitude;
    const lon = locObj.longitude;
    const geohash = locObj.geohash;
    const affinityRank = queryObj.affinity_rank;

    if (
      !isFiniteNumber(lat) ||
      !isFiniteNumber(lon) ||
      !isFiniteNumber(affinityRank) ||
      !isNonEmptyString(geohash) ||
      !GEOHASH_CHARS_REGEX.test(geohash)
    ) {
      continue;
    }

    const affinity = isFiniteNumber(queryObj.affinity) ? queryObj.affinity : null;
    const popularity = isFiniteNumber(queryObj.popularity) ? queryObj.popularity : null;

    validCells.push({
      lat,
      lon,
      geohash,
      affinityRank,
      affinity,
      popularity,
    });
  }

  // If more than 6,000 cells remain, keep the 6,000 with the highest affinityRank
  if (validCells.length > 6000) {
    validCells.sort((a, b) => b.affinityRank - a.affinityRank);
    return validCells.slice(0, 6000);
  }

  return validCells;
}

/**
 * Compacts demographics responses.
 * Requires all 6 age keys and both gender keys to be finite numbers.
 */
export function compactDemographics(raw: unknown): DemographicsSkew | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as { results?: { demographics?: unknown } };
  const rawDemoList = body.results?.demographics;
  if (!Array.isArray(rawDemoList) || rawDemoList.length === 0) return null;

  const first = rawDemoList[0];
  if (!first || typeof first !== "object") return null;
  const entry = first as Record<string, unknown>;

  if (!entry.query || typeof entry.query !== "object") return null;
  const q = entry.query as Record<string, unknown>;

  if (!q.age || typeof q.age !== "object" || !q.gender || typeof q.gender !== "object") {
    return null;
  }

  const age = q.age as Record<string, unknown>;
  const gender = q.gender as Record<string, unknown>;

  const ageKeys: AgeBand[] = [
    "24_and_younger",
    "25_to_29",
    "30_to_34",
    "35_to_44",
    "45_to_54",
    "55_and_older",
  ];

  for (const k of ageKeys) {
    if (!isFiniteNumber(age[k])) {
      return null;
    }
  }

  if (!isFiniteNumber(gender.male) || !isFiniteNumber(gender.female)) {
    return null;
  }

  return {
    age: {
      "24_and_younger": age["24_and_younger"] as number,
      "25_to_29": age["25_to_29"] as number,
      "30_to_34": age["30_to_34"] as number,
      "35_to_44": age["35_to_44"] as number,
      "45_to_54": age["45_to_54"] as number,
      "55_and_older": age["55_and_older"] as number,
    },
    gender: {
      male: gender.male as number,
      female: gender.female as number,
    },
  };
}

/**
 * Compacts tags by finding any arrays of objects having string `id` starting with urn:tag:.
 */
export function compactTags(raw: unknown, take = 10): CompactTag[] {
  if (!raw || typeof raw !== "object") return [];

  const foundTags: CompactTag[] = [];
  const seenIds = new Set<string>();

  function search(obj: unknown) {
    if (!obj || typeof obj !== "object") return;

    if (Array.isArray(obj)) {
      for (const item of obj) {
        if (item && typeof item === "object") {
          const t = item as Record<string, unknown>;
          if (typeof t.id === "string" && t.id.startsWith("urn:tag:")) {
            const id = t.id.trim();
            if (!seenIds.has(id)) {
              seenIds.add(id);
              const name = isNonEmptyString(t.name) ? t.name.trim() : id;
              foundTags.push({ id, name });
              if (foundTags.length >= take) return;
            }
          }
        }
        search(item);
        if (foundTags.length >= take) return;
      }
    } else {
      for (const val of Object.values(obj as Record<string, unknown>)) {
        search(val);
        if (foundTags.length >= take) return;
      }
    }
  }

  search(raw);
  return foundTags.slice(0, take);
}
