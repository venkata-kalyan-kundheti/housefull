/**
 * app/api/admin/warm/route.ts
 *
 * POST /api/admin/warm — as specified in Section 14.14.
 * Header: Authorization: Bearer <ADMIN_TOKEN>
 * If ADMIN_TOKEN is not configured: 404.
 * If token is wrong: 401 UNAUTHORIZED.
 * Body: { "showIds": uuid[] (1 to 6) }
 * Runs pipeline with force: true for each show sequentially.
 * Returns { results: [{ showId, ok, errorCode? }] }.
 */

import { type NextRequest } from "next/server";
import { z } from "zod";
import { getConfig } from "@/lib/config";
import { runPipeline } from "@/lib/agent/pipeline";
import { TraceEmitter } from "@/lib/agent/trace";
import { jsonOk, jsonError, jsonValidationFailed } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const warmBodySchema = z.object({
  showIds: z.array(z.string().uuid()).min(1).max(6),
});

export async function POST(request: NextRequest) {
  const config = getConfig();

  // If ADMIN_TOKEN is not configured, return 404
  if (!config.ADMIN_TOKEN || config.ADMIN_TOKEN.trim() === "") {
    return jsonError("NOT_FOUND", "Not found", 404);
  }

  // Validate Authorization header
  const authHeader = request.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match || match[1] !== config.ADMIN_TOKEN) {
    return jsonError("UNAUTHORIZED", "Invalid or missing admin token", 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("VALIDATION_FAILED", "Invalid JSON body", 400);
  }

  const parsed = warmBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonValidationFailed(
      parsed.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      }))
    );
  }

  const results: Array<{ showId: string; ok: boolean; errorCode?: string }> = [];

  for (const showId of parsed.data.showIds) {
    const emitter = new TraceEmitter();
    try {
      await runPipeline(
        {
          showId,
          force: true,
        },
        emitter
      );
      results.push({ showId, ok: true });
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || "INTERNAL";
      results.push({ showId, ok: false, errorCode: code });
    }
  }

  return jsonOk({ results });
}
