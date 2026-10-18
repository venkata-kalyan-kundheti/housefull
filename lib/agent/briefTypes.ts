/**
 * lib/agent/briefTypes.ts
 *
 * TasteBrief interface and related types (Section 10.6).
 */

import type { FingerprintDomain } from "@/lib/domain/fingerprint";
import type { Hotspot } from "@/lib/domain/geo";
import type { ChannelType } from "@/lib/domain/channels";
import type { Partner } from "@/lib/domain/partners";
import type { AgeBand, QlooCallRecord } from "@/lib/qloo/types";

export interface TasteBriefShow {
  id: string;
  filmTitle: string;
  theaterName: string;
  city: string;
  timeZone: string;
  startsAtIso: string;
  startsAtLocal: string;
  capacity: number;
  sold: number;
  hoursToStart: number;
  projectedFill: number;
  underfilled: boolean;
}

export interface TasteBriefFilm {
  title: string;
  qlooEntityId: string;
  resolution: "exact" | "alternate";
  alternates: { name: string; entityId: string }[];
  warnings: string[];
}

export type TasteBriefGeography =
  | {
      status: "ok";
      radiusKm: number;
      theaterLat: number;
      theaterLon: number;
      precisionUsed: number;
      cellsInCatchment: number;
      cellsTotal: number;
      hotspots: Hotspot[];
      callId: string;
    }
  | {
      status: "no_cells_in_catchment" | "unavailable";
      radiusKm: number;
      cellsTotal?: number;
    };

export interface TasteBriefChannel {
  id: string;
  type: ChannelType;
  title: string;
  items: string[];
  priority: number | null;
  rationale: string | null;
  evidenceCallIds: string[];
  suggestedPartnerCategory: string | null;
}

export interface TasteBriefPartnerGroup {
  categoryKey: string;
  categoryLabel: string;
  callId: string;
  places: Partner[];
}

export interface TasteBriefAudience {
  age: Record<AgeBand, number>;
  gender: { male: number; female: number };
  lines: string[];
  callId: string;
}

export interface TasteBriefConfidence {
  level: "high" | "medium" | "low";
  score: number;
  max: 12;
  reasons: string[];
}

export interface TasteBriefLlmCall {
  purpose: string;
  latencyMs: number;
  ok: boolean;
}

export interface TasteBrief {
  version: 1;
  id: string;
  generatedAt: string;
  mode: "live" | "replay";
  dataBadges: { showtimes: "synthetic" | "csv"; qloo: "live" | "recorded" };
  show: TasteBriefShow;
  film: TasteBriefFilm;
  fingerprint: FingerprintDomain[];
  audience: TasteBriefAudience | null;
  geography: TasteBriefGeography;
  channels: TasteBriefChannel[];
  partners: TasteBriefPartnerGroup[];
  segments: { id: string; label: string }[];
  copy: { segmentId: string; variants: [string, string, string] }[];
  summary: string | null;
  confidence: TasteBriefConfidence;
  limitations: string[];
  evidence: { calls: QlooCallRecord[] };
  llmCalls: TasteBriefLlmCall[];
}

export interface RunInput {
  showId: string;
  radiusKm?: number;
  filmEntityIdOverride?: string;
  force?: boolean;
}
