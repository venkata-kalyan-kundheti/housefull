/**
 * lib/qloo/rawSchemas.ts
 *
 * Zod schemas for raw Qloo API responses as specified in Section 7.4.
 * All fields are optional/tolerant so unknown or evolving shapes never crash the parser.
 */

import { z } from "zod";

export const RawTagSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  type: z.string().optional(),
});

export const RawSearchResultSchema = z.object({
  entity_id: z.string().optional(),
  name: z.string().optional(),
  types: z.array(z.string()).optional(),
  properties: z.record(z.unknown()).optional(),
  popularity: z.number().optional(),
  disambiguation: z.string().optional(),
  tags: z.array(RawTagSchema).optional(),
});

export const RawSearchResponseSchema = z.object({
  success: z.boolean().optional(),
  results: z.array(RawSearchResultSchema).optional(),
  errors: z
    .array(
      z.object({
        message: z.string().optional(),
        subtype: z.string().optional(),
      })
    )
    .optional(),
});

export const RawEntitySchema = z.object({
  entity_id: z.string().optional(),
  name: z.string().optional(),
  type: z.string().optional(),
  subtype: z.string().optional(),
  popularity: z.number().optional(),
  disambiguation: z.string().optional(),
  properties: z.record(z.unknown()).optional(),
  tags: z.array(RawTagSchema).optional(),
  query: z
    .object({
      affinity: z.number().optional(),
      measurements: z
        .object({
          audience_growth: z.number().optional(),
        })
        .optional(),
    })
    .optional(),
});

export const RawInsightsResponseSchema = z.object({
  success: z.boolean().optional(),
  query: z.record(z.unknown()).optional(),
  results: z
    .object({
      entities: z.array(RawEntitySchema).optional(),
      heatmap: z
        .array(
          z.object({
            location: z
              .object({
                latitude: z.number().optional(),
                longitude: z.number().optional(),
                geohash: z.string().optional(),
              })
              .optional(),
            query: z
              .object({
                affinity: z.number().optional(),
                affinity_rank: z.number().optional(),
                popularity: z.number().optional(),
              })
              .passthrough()
              .optional(),
          })
        )
        .optional(),
      demographics: z
        .array(
          z.object({
            entity_id: z.string().optional(),
            query: z
              .object({
                age: z
                  .object({
                    "24_and_younger": z.number().optional(),
                    "25_to_29": z.number().optional(),
                    "30_to_34": z.number().optional(),
                    "35_to_44": z.number().optional(),
                    "45_to_54": z.number().optional(),
                    "55_and_older": z.number().optional(),
                  })
                  .optional(),
                gender: z
                  .object({
                    male: z.number().optional(),
                    female: z.number().optional(),
                  })
                  .optional(),
              })
              .optional(),
          })
        )
        .optional(),
    })
    .optional(),
  errors: z
    .array(
      z.object({
        message: z.string().optional(),
        subtype: z.string().optional(),
      })
    )
    .optional(),
});

export type RawSearchResult = z.infer<typeof RawSearchResultSchema>;
export type RawEntity = z.infer<typeof RawEntitySchema>;
