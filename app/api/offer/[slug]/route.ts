/**
 * app/api/offer/[slug]/route.ts
 *
 * GET /api/offer/:slug — public endpoint as specified in Section 14.12.
 * Returns filmTitle, theaterName, city, startsAtLocal, offerText.
 * No brief, channel, or evidence data is exposed.
 */

import { type NextRequest } from "next/server";
import { z } from "zod";
import { getOfferBySlug } from "@/lib/db/repo";
import { checkRateLimit, getClientIp } from "@/lib/api/rateLimit";
import { jsonOk, jsonError, jsonRateLimited } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const slugSchema = z.string().min(1).max(60);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const ip = getClientIp(request.headers);
  const rateResult = checkRateLimit(ip, "general");
  if (!rateResult.allowed) {
    return jsonRateLimited(rateResult.retryAfterSeconds);
  }

  const resolvedParams = await params;
  const parsed = slugSchema.safeParse(resolvedParams.slug);
  if (!parsed.success) {
    return jsonError("VALIDATION_FAILED", "Invalid slug", 400);
  }

  const offer = await getOfferBySlug(parsed.data);
  if (!offer) {
    return jsonError("OFFER_NOT_FOUND", "Offer not found", 404);
  }

  return jsonOk({
    filmTitle: offer.filmTitle,
    theaterName: offer.theaterName,
    city: offer.city,
    startsAtLocal: offer.startsAtLocal,
    offerText: offer.offerText,
  });
}
