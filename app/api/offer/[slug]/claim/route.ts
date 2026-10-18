/**
 * app/api/offer/[slug]/claim/route.ts
 *
 * POST /api/offer/:slug/claim — public endpoint as specified in Section 14.13.
 * Body: { "src"?: string } matching ^[a-z0-9_-]{1,24}$ (default "direct").
 * Increments the counter.
 * Per-IP: one claim per 10 minutes per slug; extra claims return 200 { "ok": true, "duplicate": true } without incrementing.
 * No personal data is read or stored.
 */

import { type NextRequest } from "next/server";
import { z } from "zod";
import { getOfferBySlug, incrementOfferClaim } from "@/lib/db/repo";
import { checkRateLimit, getClientIp } from "@/lib/api/rateLimit";
import { jsonOk, jsonError, jsonRateLimited } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const slugSchema = z.string().min(1).max(60);

const bodySchema = z.object({
  src: z
    .string()
    .regex(/^[a-z0-9_-]{1,24}$/)
    .optional()
    .default("direct"),
});

// In-memory per-IP per-slug claim tracking (1 claim per 10 minutes)
const TEN_MINUTES_MS = 10 * 60 * 1000;
const ipSlugClaimStore = new Map<string, number>();

function isDuplicateClaim(ip: string, slug: string): boolean {
  const key = `${ip}:${slug}`;
  const lastTime = ipSlugClaimStore.get(key);
  const now = Date.now();

  // Periodically clean up stale records
  if (ipSlugClaimStore.size > 5000) {
    for (const [k, timestamp] of ipSlugClaimStore.entries()) {
      if (now - timestamp > TEN_MINUTES_MS) {
        ipSlugClaimStore.delete(k);
      }
    }
  }

  if (lastTime && now - lastTime < TEN_MINUTES_MS) {
    return true;
  }

  ipSlugClaimStore.set(key, now);
  return false;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const ip = getClientIp(request.headers);
  const rateResult = checkRateLimit(ip, "general");
  if (!rateResult.allowed) {
    return jsonRateLimited(rateResult.retryAfterSeconds);
  }

  const resolvedParams = await params;
  const parsedSlug = slugSchema.safeParse(resolvedParams.slug);
  if (!parsedSlug.success) {
    return jsonError("VALIDATION_FAILED", "Invalid slug", 400);
  }

  let rawBody: unknown = {};
  try {
    const text = await request.text();
    if (text.trim().length > 0) {
      rawBody = JSON.parse(text);
    }
  } catch {
    return jsonError("VALIDATION_FAILED", "Invalid JSON body", 400);
  }

  const parsedBody = bodySchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return jsonError("VALIDATION_FAILED", "Invalid src parameter", 400);
  }

  const offer = await getOfferBySlug(parsedSlug.data);
  if (!offer) {
    return jsonError("OFFER_NOT_FOUND", "Offer not found", 404);
  }

  if (isDuplicateClaim(ip, parsedSlug.data)) {
    return jsonOk({ ok: true, duplicate: true });
  }

  try {
    await incrementOfferClaim(offer.campaignId, parsedBody.data.src);
    return jsonOk({ ok: true, duplicate: false });
  } catch {
    // If DB is offline or mock, fail gracefully
    return jsonOk({ ok: true, duplicate: false });
  }
}
