/**
 * app/api/shows/route.ts
 *
 * GET /api/shows endpoint as specified in Section 14.3.
 */

import { type NextRequest } from "next/server";
import { z } from "zod";
import { now } from "@/lib/time/now";
import { listShows } from "@/lib/db/repo";
import { checkRateLimit, getClientIp } from "@/lib/api/rateLimit";
import {
  jsonOk,
  jsonValidationFailed,
  jsonRateLimited,
  jsonError,
} from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z
  .object({
    theaterId: z.string().uuid("theaterId must be a valid UUID").optional(),
    from: z
      .string()
      .refine((val) => !Number.isNaN(Date.parse(val)), "from must be a valid ISO date")
      .optional(),
    to: z
      .string()
      .refine((val) => !Number.isNaN(Date.parse(val)), "to must be a valid ISO date")
      .optional(),
    underfilledOnly: z
      .enum(["true", "false"])
      .optional()
      .transform((val) => val === "true"),
  })
  .superRefine((data, ctx) => {
    const fromTime = data.from ? Date.parse(data.from) : now().getTime();
    const toTime = data.to
      ? Date.parse(data.to)
      : fromTime + 7 * 24 * 60 * 60 * 1000;

    if (fromTime >= toTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["from"],
        message: "'from' must be strictly earlier than 'to'",
      });
    }

    const windowMs = toTime - fromTime;
    const maxWindowMs = 14 * 24 * 60 * 60 * 1000;
    if (windowMs > maxWindowMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["to"],
        message: "The query window cannot exceed 14 days",
      });
    }
  });

export async function GET(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const rateResult = checkRateLimit(ip, "general");
  if (!rateResult.allowed) {
    return jsonRateLimited(rateResult.retryAfterSeconds);
  }

  const { searchParams } = new URL(request.url);
  const queryObj = {
    theaterId: searchParams.get("theaterId") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    underfilledOnly: searchParams.get("underfilledOnly") ?? undefined,
  };

  const parsed = querySchema.safeParse(queryObj);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    return jsonValidationFailed(details);
  }

  const currentNow = now();
  const fromIso = parsed.data.from ?? currentNow.toISOString();
  const fromTime = Date.parse(fromIso);
  const defaultTo = new Date(fromTime + 7 * 24 * 60 * 60 * 1000).toISOString();
  const toIso = parsed.data.to ?? defaultTo;

  try {
    const shows = await listShows({
      theaterId: parsed.data.theaterId,
      fromIso,
      toIso,
      underfilledOnly: parsed.data.underfilledOnly,
    });

    return jsonOk({
      now: currentNow.toISOString(),
      shows,
    });
  } catch {
    return jsonError(
      "INTERNAL",
      "Failed to retrieve shows. Please try again.",
      500
    );
  }
}
