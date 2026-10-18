/**
 * app/api/campaigns/[id]/route.ts
 *
 * GET /api/campaigns/:id endpoint as specified in Section 14.8.
 */

import { type NextRequest } from "next/server";
import { z } from "zod";
import { getCampaignById } from "@/lib/db/repo";
import { checkRateLimit, getClientIp } from "@/lib/api/rateLimit";
import {
  jsonOk,
  jsonValidationFailed,
  jsonError,
  jsonRateLimited,
} from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idSchema = z.string().uuid("Campaign ID must be a valid UUID");

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const ip = getClientIp(request.headers);
  const rateResult = checkRateLimit(ip, "general");
  if (!rateResult.allowed) {
    return jsonRateLimited(rateResult.retryAfterSeconds);
  }

  const { id } = await context.params;

  const parsed = idSchema.safeParse(id);
  if (!parsed.success) {
    return jsonValidationFailed(
      [{ path: "id", message: "Campaign ID must be a valid UUID" }],
      "Invalid campaign ID"
    );
  }

  try {
    const campaignData = await getCampaignById(parsed.data);
    if (!campaignData) {
      return jsonError("CAMPAIGN_NOT_FOUND", "Campaign not found", 404);
    }

    return jsonOk(campaignData);
  } catch {
    return jsonError(
      "INTERNAL",
      "Failed to retrieve campaign details. Please try again.",
      500
    );
  }
}
