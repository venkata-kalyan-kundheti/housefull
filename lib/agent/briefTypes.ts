/**
 * lib/agent/briefTypes.ts
 *
 * TasteBrief interface and related types (Section 10.6).
 */

import { z } from "zod";
import type { FingerprintDomain } from "@/lib/domain/fingerprint";
import type { Hotspot } from "@/lib/domain/geo";
import type { ChannelType } from "@/lib/domain/channels";
import type { Partner } from "@/lib/domain/partners";
import type { AgeBand, QlooCallRecord } from "@/lib/qloo/types";

export const TasteBriefSchema = z.object({
  version: z.literal(1),
  id: z.string(),
  generatedAt: z.string(),
  mode: z.enum(["live", "replay"]),
  dataBadges: z.object({
    showtimes: z.enum(["synthetic", "csv"]),
    qloo: z.enum(["live", "recorded"]),
  }),
  show: z.object({
    id: z.string(),
    filmTitle: z.string(),
    theaterName: z.string(),
    city: z.string(),
    timeZone: z.string(),
    startsAtIso: z.string(),
    startsAtLocal: z.string(),
    capacity: z.number(),
    sold: z.number(),
    hoursToStart: z.number(),
    projectedFill: z.number(),
    underfilled: z.boolean(),
  }),
  film: z.object({
    title: z.string(),
    qlooEntityId: z.string(),
    resolution: z.enum(["exact", "alternate"]),
    alternates: z.array(z.object({ name: z.string(), entityId: z.string() })),
    warnings: z.array(z.string()),
    callId: z.string().optional(),
  }),
  fingerprint: z.array(z.any()),
  audience: z
    .object({
      age: z.record(z.string(), z.number()),
      gender: z.object({ male: z.number(), female: z.number() }),
      lines: z.array(z.string()),
      callId: z.string(),
    })
    .nullable(),
  geography: z.union([
    z.object({
      status: z.literal("ok"),
      radiusKm: z.number(),
      theaterLat: z.number(),
      theaterLon: z.number(),
      precisionUsed: z.number(),
      cellsInCatchment: z.number(),
      cellsTotal: z.number(),
      hotspots: z.array(z.any()),
      callId: z.string().optional(),
    }),
    z.object({
      status: z.enum(["no_cells_in_catchment", "unavailable"]),
      radiusKm: z.number(),
      cellsTotal: z.number().optional(),
    }),
  ]),
  channels: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      title: z.string(),
      items: z.array(z.string()),
      priority: z.number().nullable(),
      rationale: z.string().nullable(),
      evidenceCallIds: z.array(z.string()),
      suggestedPartnerCategory: z.string().nullable(),
    })
  ),
  partners: z.array(
    z.object({
      categoryKey: z.string(),
      categoryLabel: z.string(),
      callId: z.string(),
      places: z.array(z.any()),
    })
  ),
  segments: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
    })
  ),
  copy: z.array(
    z.object({
      segmentId: z.string(),
      variants: z.tuple([z.string(), z.string(), z.string()]),
    })
  ),
  summary: z.string().nullable(),
  confidence: z.object({
    level: z.enum(["high", "medium", "low"]),
    score: z.number(),
    max: z.literal(12),
    reasons: z.array(z.string()),
  }),
  limitations: z.array(z.string()),
  evidence: z.object({
    calls: z.array(z.any()),
  }),
  llmCalls: z.array(
    z.object({
      purpose: z.string(),
      latencyMs: z.number(),
      ok: z.boolean(),
    })
  ),
});

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
