import type { FingerprintDomain } from "./fingerprint";
import type { HotspotResult } from "./geo";
import type { PartnerCategoryKey } from "./partners";

export type ChannelType =
  | "music_community"
  | "title_interest_targets"
  | "brand_collab"
  | "travel_community"
  | "book_club_or_store"
  | "comic_shop"
  | "podcast_sponsorship"
  | "geo_focus";

export interface ChannelCandidate {
  id: string;
  type: ChannelType;
  title: string;
  items: string[];
  evidenceCallIds: string[];
  suggestedPartnerCategory: PartnerCategoryKey | null;
}

export interface GenerateChannelCandidatesInput {
  fingerprint: FingerprintDomain[];
  hotspots: HotspotResult;
  hasComicSignal?: boolean;
  heatmapCallId?: string;
}

/**
 * Checks if any book item has tags mentioning "comic" (case-insensitive).
 */
export function detectComicSignal(fingerprint: FingerprintDomain[]): boolean {
  const bookDomain = fingerprint.find((f) => f.domain === "book");
  if (!bookDomain) {
    return false;
  }
  return bookDomain.items.some((item) =>
    item.tags.some((tag) => tag.toLowerCase().includes("comic"))
  );
}

/**
 * Generates deterministic channel candidates from evidence according to Section 9.7 rulebook.
 */
export function generateChannelCandidates(
  input: GenerateChannelCandidatesInput
): ChannelCandidate[] {
  const { fingerprint, hotspots, heatmapCallId } = input;
  const domainMap = new Map<string, FingerprintDomain>();
  for (const f of fingerprint) {
    domainMap.set(f.domain, f);
  }

  const artist = domainMap.get("artist");
  const movie = domainMap.get("movie");
  const tvShow = domainMap.get("tv_show");
  const brand = domainMap.get("brand");
  const destination = domainMap.get("destination");
  const book = domainMap.get("book");
  const podcast = domainMap.get("podcast");

  const hasComic =
    input.hasComicSignal ?? detectComicSignal(fingerprint);

  const candidates: ChannelCandidate[] = [];

  // 1. artist displayed
  if (artist?.displayed && artist.items.length > 0) {
    candidates.push({
      id: "ch_music_community",
      type: "music_community",
      title: "Fans of these artists",
      items: artist.items.slice(0, 4).map((i) => i.name),
      evidenceCallIds: [artist.callId],
      suggestedPartnerCategory: null,
    });
  }

  // 2. movie or tv_show displayed
  const screenDisplayed = (movie?.displayed && movie.items.length > 0) || (tvShow?.displayed && tvShow.items.length > 0);
  if (screenDisplayed) {
    const movieItems = movie?.displayed ? movie.items.slice(0, 3).map((i) => i.name) : [];
    const tvItems = tvShow?.displayed ? tvShow.items.slice(0, 3).map((i) => i.name) : [];
    const combined = [...movieItems, ...tvItems].slice(0, 6);
    const callIds: string[] = [];
    if (movie?.displayed && movie.callId) callIds.push(movie.callId);
    if (tvShow?.displayed && tvShow.callId) callIds.push(tvShow.callId);

    candidates.push({
      id: "ch_title_interest_targets",
      type: "title_interest_targets",
      title: "Fans of similar titles",
      items: combined,
      evidenceCallIds: callIds,
      suggestedPartnerCategory: null,
    });
  }

  // 3. brand displayed
  if (brand?.displayed && brand.items.length > 0) {
    candidates.push({
      id: "ch_brand_collab",
      type: "brand_collab",
      title: "Brands this audience likes",
      items: brand.items.slice(0, 3).map((i) => i.name),
      evidenceCallIds: [brand.callId],
      suggestedPartnerCategory: null,
    });
  }

  // 4. destination displayed
  if (destination?.displayed && destination.items.length > 0) {
    candidates.push({
      id: "ch_travel_community",
      type: "travel_community",
      title: "Places this audience likes to visit",
      items: destination.items.slice(0, 3).map((i) => i.name),
      evidenceCallIds: [destination.callId],
      suggestedPartnerCategory: null,
    });
  }

  // 5. book displayed
  if (book?.displayed && book.items.length > 0) {
    candidates.push({
      id: "ch_book_club_or_store",
      type: "book_club_or_store",
      title: "Books this audience reads",
      items: book.items.slice(0, 3).map((i) => i.name),
      evidenceCallIds: [book.callId],
      suggestedPartnerCategory: "book_store",
    });
  }

  // 6. book displayed and hasComicSignal
  if (book?.displayed && hasComic) {
    const comicBooks = book.items
      .filter((item) =>
        item.tags.some((tag) => tag.toLowerCase().includes("comic"))
      )
      .slice(0, 3)
      .map((i) => i.name);

    candidates.push({
      id: "ch_comic_shop",
      type: "comic_shop",
      title: "Comic and graphic-novel fans",
      items: comicBooks,
      evidenceCallIds: [book.callId],
      suggestedPartnerCategory: "comic_book_store",
    });
  }

  // 7. podcast displayed
  if (podcast?.displayed && podcast.items.length > 0) {
    candidates.push({
      id: "ch_podcast_sponsorship",
      type: "podcast_sponsorship",
      title: "Podcasts this audience follows",
      items: podcast.items.slice(0, 3).map((i) => i.name),
      evidenceCallIds: [podcast.callId],
      suggestedPartnerCategory: null,
    });
  }

  // 8. hotspots status ok
  if (hotspots.status === "ok" && hotspots.hotspots.length > 0) {
    const topHotspots = hotspots.hotspots.slice(0, 3).map((h) => h.label);
    candidates.push({
      id: "ch_geo_focus",
      type: "geo_focus",
      title: "Neighbourhoods to focus on",
      items: topHotspots,
      evidenceCallIds: heatmapCallId ? [heatmapCallId] : [],
      suggestedPartnerCategory: "cafe",
    });
  }

  return candidates;
}

/**
 * Deterministically collects partner categories to query based on candidates.
 * Collects distinct suggestedPartnerCategory values in candidate order.
 * Appends 'movie_theater' last if fewer than 3 collected and includeCinemaPeers is true.
 * Caps at 3 categories.
 */
export function collectPartnerCategories(
  candidates: ChannelCandidate[],
  options?: { includeCinemaPeers?: boolean }
): PartnerCategoryKey[] {
  const result: PartnerCategoryKey[] = [];
  const seen = new Set<PartnerCategoryKey>();

  for (const cand of candidates) {
    if (cand.suggestedPartnerCategory && !seen.has(cand.suggestedPartnerCategory)) {
      seen.add(cand.suggestedPartnerCategory);
      result.push(cand.suggestedPartnerCategory);
    }
  }

  if (options?.includeCinemaPeers && result.length < 3 && !seen.has("movie_theater")) {
    seen.add("movie_theater");
    result.push("movie_theater");
  }

  return result.slice(0, 3);
}
