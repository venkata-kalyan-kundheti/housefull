import type { CompactPlace } from "@/lib/qloo/types";
import { haversineKm } from "@/lib/domain/geo";

export const PARTNER_CATEGORIES = [
  {
    key: "book_store",
    tag: "urn:tag:category:place:book_store",
    label: "Bookstore",
    nameHints: [
      "book",
      "bookstore",
      "books",
      "bookshop",
      "crossword",
      "kinokuniya",
      "library",
    ],
  },
  {
    key: "comic_book_store",
    tag: "urn:tag:category:place:comic_book_store",
    label: "Comic shop",
    nameHints: ["comic", "comics", "manga"],
  },
  {
    key: "movie_theater",
    tag: "urn:tag:category:place:movie_theater",
    label: "Cinema",
    nameHints: [
      "cinema",
      "cinemas",
      "theater",
      "theatre",
      "multiplex",
      "pvr",
      "film",
      "movie",
    ],
  },
  {
    key: "cafe",
    tag: "urn:tag:category:place:cafe",
    label: "Café",
    nameHints: [
      "cafe",
      "café",
      "coffee",
      "roast",
      "espresso",
      "bakery",
      "tea",
    ],
  },
] as const;

export type PartnerCategory = (typeof PARTNER_CATEGORIES)[number];
export type PartnerCategoryKey = PartnerCategory["key"];

export interface Partner {
  entityId: string;
  name: string;
  tags: string[];
  lat: number | null;
  lon: number | null;
  distanceKm: number | null;
  fit: "name_matches" | "check_manually";
}

/**
 * Assesses and standardizes partner venues for a specific category.
 * - Deduplicates by entityId
 * - Caps at 5 venues
 * - Sets fit to "name_matches" if name includes any category nameHint, else "check_manually"
 * - Computes distanceKm from theater if coordinates available
 * - Takes up to 3 tags
 */
export function assessPartners(
  places: CompactPlace[],
  category: PartnerCategory,
  theater?: { lat: number; lon: number } | null
): Partner[] {
  const seenEntityIds = new Set<string>();
  const results: Partner[] = [];

  for (const place of places) {
    if (seenEntityIds.has(place.entityId)) {
      continue;
    }
    seenEntityIds.add(place.entityId);

    const lowerName = place.name.toLowerCase();
    const hasNameMatch = category.nameHints.some((hint) =>
      lowerName.includes(hint.toLowerCase())
    );
    const fit: "name_matches" | "check_manually" = hasNameMatch
      ? "name_matches"
      : "check_manually";

    let distanceKm: number | null = null;
    if (
      theater &&
      typeof place.lat === "number" &&
      typeof place.lon === "number"
    ) {
      distanceKm = haversineKm(theater.lat, theater.lon, place.lat, place.lon);
    }

    results.push({
      entityId: place.entityId,
      name: place.name,
      tags: place.tags.slice(0, 3).map((t) => t.name),
      lat: place.lat,
      lon: place.lon,
      distanceKm,
      fit,
    });

    if (results.length >= 5) {
      break;
    }
  }

  return results;
}
