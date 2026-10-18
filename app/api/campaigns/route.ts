/**
 * app/api/campaigns/route.ts
 *
 * POST /api/campaigns endpoint as specified in Section 14.7.
 */

import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { getBriefById, createCampaign } from "@/lib/db/repo";
import { checkRateLimit, getClientIp } from "@/lib/api/rateLimit";
import {
  jsonValidationFailed,
  jsonError,
  jsonRateLimited,
} from "@/lib/api/response";
import { CONTACT_PATTERNS } from "@/lib/validate/claimFilter";
import type { TasteBrief } from "@/lib/agent/briefTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const campaignBodySchema = z.object({
  briefId: z.string().uuid("briefId must be a valid UUID"),
  selectedChannelIds: z
    .array(z.string())
    .min(1, "At least 1 channel must be selected")
    .max(6, "At most 6 channels may be selected"),
  selectedCopy: z
    .array(
      z.object({
        segmentId: z.string(),
        variantIndex: z.union([z.literal(0), z.literal(1), z.literal(2)]),
      })
    )
    .optional(),
  offerText: z.string().max(120, "offerText must be 120 characters or less").optional(),
});

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const rateResult = checkRateLimit(ip, "general");
  if (!rateResult.allowed) {
    return jsonRateLimited(rateResult.retryAfterSeconds);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("BAD_REQUEST", "Request body must be valid JSON", 400);
  }

  const parsed = campaignBodySchema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    }));
    return jsonValidationFailed(issues, "Invalid campaign parameters");
  }

  const { briefId, selectedChannelIds, selectedCopy, offerText } = parsed.data;

  // Check unique channel ids
  if (new Set(selectedChannelIds).size !== selectedChannelIds.length) {
    return jsonValidationFailed(
      [{ path: "selectedChannelIds", message: "Duplicate channel IDs are not allowed" }],
      "Duplicate channels"
    );
  }

  // Validate offerText if present
  let cleanOfferText: string | null = null;
  if (offerText !== undefined && offerText !== null) {
    cleanOfferText = offerText.replace(/[\x00-\x1F\x7F]/g, "").trim();
    for (const pat of CONTACT_PATTERNS) {
      if (pat.test(cleanOfferText)) {
        return jsonValidationFailed(
          [
            {
              path: "offerText",
              message: "Offer text must not contain contact information or links",
            },
          ],
          "Contact patterns rejected"
        );
      }
    }
  }

  // Load brief to verify existence and validate channel & segment references
  const briefRow = await getBriefById(briefId);
  if (!briefRow) {
    return jsonError("BRIEF_NOT_FOUND", "Referenced brief does not exist", 404);
  }

  const briefContent = briefRow.content as TasteBrief;
  const validChannelIds = new Set(briefContent.channels.map((c) => c.id));
  for (const chId of selectedChannelIds) {
    if (!validChannelIds.has(chId)) {
      return jsonValidationFailed(
        [{ path: "selectedChannelIds", message: `Channel id "${chId}" does not exist in brief` }],
        "Invalid channel reference"
      );
    }
  }

  if (selectedCopy && selectedCopy.length > 0) {
    const validSegmentIds = new Set(briefContent.segments.map((s) => s.id));
    const seenSegments = new Set<string>();

    for (const sc of selectedCopy) {
      if (!validSegmentIds.has(sc.segmentId)) {
        return jsonValidationFailed(
          [
            {
              path: "selectedCopy",
              message: `Segment "${sc.segmentId}" does not exist in brief`,
            },
          ],
          "Invalid segment reference"
        );
      }
      if (seenSegments.has(sc.segmentId)) {
        return jsonValidationFailed(
          [
            {
              path: "selectedCopy",
              message: `Duplicate copy choice for segment "${sc.segmentId}"`,
            },
          ],
          "Duplicate segment selection"
        );
      }
      seenSegments.add(sc.segmentId);
    }
  }

  // Generate unique slug
  const offerSlug = `offer-${randomBytes(6).toString("hex")}`;

  try {
    const result = await createCampaign({
      briefId,
      selectedChannelIds,
      selectedCopy,
      offerText: cleanOfferText,
      offerSlug,
    });

    return NextResponse.json(result, {
      status: 201,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return jsonError("INTERNAL", "Failed to create campaign", 500);
  }
}
