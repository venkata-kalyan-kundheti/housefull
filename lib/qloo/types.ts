/**
 * lib/qloo/types.ts
 *
 * Types for the Qloo client, compact data models, and call records.
 * As specified in Sections 8.1, 8.8, 8.9.
 */

import type { AppError } from "../errors";

export type Domain =
  | "artist"
  | "brand"
  | "movie"
  | "tv_show"
  | "destination"
  | "book"
  | "podcast";

export const CORE_DOMAINS: readonly Domain[] = [
  "artist",
  "brand",
  "movie",
  "tv_show",
  "destination",
] as const;

export const OPTIONAL_DOMAINS: readonly Domain[] = [
  "book",
  "podcast",
] as const;

export const domainUrn = (d: Domain) => `urn:entity:${d}` as const;

export interface CompactTag {
  id: string;
  name: string;
}

export interface CompactEntity {
  entityId: string;
  name: string;
  type: string | null;
  subtype: string | null;
  popularity: number | null;
  affinity: number | null;
  tags: CompactTag[]; // at most 8
  blurb: string | null; // at most 160 chars
  descriptors: string[]; // at most 3
}

export interface CompactPlace extends CompactEntity {
  lat: number | null;
  lon: number | null;
  address: string | null;
}

export interface CompactSearchResult {
  entityId: string;
  name: string;
  types: string[];
  popularity: number | null;
  disambiguation: string | null;
}

export interface HeatCell {
  lat: number;
  lon: number;
  geohash: string;
  affinityRank: number;
  affinity: number | null;
  popularity: number | null;
}

export type AgeBand =
  | "24_and_younger"
  | "25_to_29"
  | "30_to_34"
  | "35_to_44"
  | "45_to_54"
  | "55_and_older";

export interface DemographicsSkew {
  age: Record<AgeBand, number>;
  gender: {
    male: number;
    female: number;
  };
}

export interface QlooCallRecord {
  id: string; // "call_01", "call_02", ...
  endpoint: string;
  params: Record<string, string>;
  status: number | null;
  latencyMs: number;
  cached: boolean;
  attempts: number;
  resultCount: number;
  error: { code: string; message: string } | null;
  startedAt: string; // ISO
  rateRemainingMonth: number | null;
}

export interface BudgetTracker {
  remaining(): number;
  tryConsume(): boolean;
}

export interface TraceSink {
  emit(event: unknown): void;
}

export interface QlooContext {
  runId: string;
  budget: BudgetTracker;
  trace?: TraceSink;
  mode: "live" | "replay";
  callCounter?: { nextId(): string };
}

export type QlooResult<T> =
  | { ok: true; data: T; call: QlooCallRecord }
  | { ok: false; error: AppError; call: QlooCallRecord };
