import type { FingerprintDomain } from "./fingerprint";
import type { HotspotResult } from "./geo";

export interface Segment {
  id: "s_music" | "s_screen" | "s_taste" | "s_local" | "s_general";
  label: string;
}

export interface GenerateSegmentsInput {
  fingerprint: FingerprintDomain[];
  hotspots: HotspotResult;
}

/**
 * Extracts the short label from a hotspot label (everything before the opening parenthesis).
 */
function toShortHotspotLabel(fullLabel: string): string {
  const parts = fullLabel.split("(");
  return (parts[0] ?? fullLabel).trim();
}

/**
 * Generates marketing segments for copywriting (at most 4 in fixed priority order).
 * If no specific segments apply, returns [ { id: "s_general", label: "Film lovers nearby" } ].
 */
export function generateSegments(input: GenerateSegmentsInput): Segment[] {
  const { fingerprint, hotspots } = input;
  const domainMap = new Map<string, FingerprintDomain>();
  for (const f of fingerprint) {
    domainMap.set(f.domain, f);
  }

  const artist = domainMap.get("artist");
  const movie = domainMap.get("movie");
  const tvShow = domainMap.get("tv_show");
  const brand = domainMap.get("brand");
  const destination = domainMap.get("destination");

  const segments: Segment[] = [];

  // 1. s_music: artist displayed
  if (artist?.displayed && artist.items.length > 0) {
    const names = artist.items.slice(0, 2).map((i) => i.name);
    const label = `Fans of ${names.join(", ")}`;
    segments.push({ id: "s_music", label });
  }

  // 2. s_screen: movie or tv_show displayed
  const screenItems: string[] = [];
  if (movie?.displayed) {
    for (const item of movie.items) {
      screenItems.push(item.name);
      if (screenItems.length === 2) break;
    }
  }
  if (tvShow?.displayed && screenItems.length < 2) {
    for (const item of tvShow.items) {
      screenItems.push(item.name);
      if (screenItems.length === 2) break;
    }
  }
  if (screenItems.length > 0) {
    segments.push({
      id: "s_screen",
      label: `Fans of ${screenItems.join(", ")}`,
    });
  }

  // 3. s_taste: brand or destination displayed
  const brandName =
    brand?.displayed && brand.items.length > 0 ? brand.items[0]?.name : null;
  const destName =
    destination?.displayed && destination.items.length > 0
      ? destination.items[0]?.name
      : null;

  const tasteItems: string[] = [];
  if (brandName) tasteItems.push(brandName);
  if (destName) tasteItems.push(destName);

  if (tasteItems.length > 0) {
    segments.push({
      id: "s_taste",
      label: `People who like ${tasteItems.join(", ")}`,
    });
  }

  // 4. s_local: hotspots status ok
  if (hotspots.status === "ok" && hotspots.hotspots.length > 0) {
    const shorts = hotspots.hotspots
      .slice(0, 2)
      .map((h) => toShortHotspotLabel(h.label));
    if (shorts.length > 0) {
      segments.push({
        id: "s_local",
        label: `Nearby areas: ${shorts.join(", ")}`,
      });
    }
  }

  // Fallback to s_general if none applied
  if (segments.length === 0) {
    return [{ id: "s_general", label: "Film lovers nearby" }];
  }

  return segments.slice(0, 4);
}
