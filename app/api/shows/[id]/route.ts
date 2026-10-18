/**
 * app/api/shows/[id]/route.ts
 *
 * GET /api/shows/:id endpoint as specified in Section 14.4.
 */

import { type NextRequest } from "next/server";
import { z } from "zod";
import { getShowById } from "@/lib/db/repo";
import { checkRateLimit, getClientIp } from "@/lib/api/rateLimit";
import {
  jsonOk,
  jsonValidationFailed,
  jsonError,
  jsonRateLimited,
} from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idSchema = z.string().uuid("Show ID must be a valid UUID");

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
      [{ path: "id", message: "Show ID must be a valid UUID" }],
      "Invalid show ID"
    );
  }

  try {
    const show = await getShowById(parsed.data);
    if (!show) {
      return jsonError("SHOW_NOT_FOUND", "Show not found", 404);
    }

    return jsonOk(show);
  } catch {
    return jsonError(
      "INTERNAL",
      "Failed to retrieve show details. Please try again.",
      500
    );
  }
}
