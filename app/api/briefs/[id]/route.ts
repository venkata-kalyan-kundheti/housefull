/**
 * app/api/briefs/[id]/route.ts
 *
 * GET /api/briefs/:id endpoint as specified in Section 14.6.
 */

import { type NextRequest } from "next/server";
import { z } from "zod";
import { getBriefById } from "@/lib/db/repo";
import { checkRateLimit, getClientIp } from "@/lib/api/rateLimit";
import {
  jsonOk,
  jsonValidationFailed,
  jsonError,
  jsonRateLimited,
} from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idSchema = z.string().uuid("Brief ID must be a valid UUID");

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
      [{ path: "id", message: "Brief ID must be a valid UUID" }],
      "Invalid brief ID"
    );
  }

  try {
    const brief = await getBriefById(parsed.data);
    if (!brief) {
      return jsonError("BRIEF_NOT_FOUND", "Brief not found", 404);
    }

    return jsonOk(brief.content);
  } catch {
    return jsonError(
      "INTERNAL",
      "Failed to retrieve brief. Please try again.",
      500
    );
  }
}
