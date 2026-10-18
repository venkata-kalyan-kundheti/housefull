import { z } from "zod";

export const PlannerOut = z.object({
  actions: z
    .array(
      z.object({
        tool: z.literal("find_partners"),
        category: z.enum([
          "book_store",
          "comic_book_store",
          "movie_theater",
          "cafe",
        ]),
        reason: z.string().max(160),
      })
    )
    .max(2),
});
export type PlannerOutType = z.infer<typeof PlannerOut>;

export const ChannelsOut = z.object({
  ranked: z
    .array(
      z.object({
        id: z.string(),
        priority: z.number().int().min(1).max(5),
        rationale: z.string().min(10).max(220),
      })
    )
    .max(8),
  dropped: z
    .array(
      z.object({
        id: z.string(),
        reason: z.string().max(160),
      })
    )
    .max(8),
});
export type ChannelsOutType = z.infer<typeof ChannelsOut>;

export const CopyOut = z.object({
  segments: z
    .array(
      z.object({
        segmentId: z.string(),
        variants: z.array(z.string().min(20).max(280)).length(3),
      })
    )
    .min(1)
    .max(4),
});
export type CopyOutType = z.infer<typeof CopyOut>;

export const SummaryOut = z.object({
  summary: z.string().min(40).max(600),
});
export type SummaryOutType = z.infer<typeof SummaryOut>;
