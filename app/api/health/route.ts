/**
 * app/api/health/route.ts
 *
 * GET /api/health endpoint as specified in Section 14.2.
 */

import { type NextRequest } from "next/server";
import { getConfig } from "@/lib/config";
import { now } from "@/lib/time/now";
import { checkDatabaseConnection } from "@/lib/db/repo";
import { checkRateLimit, getClientIp } from "@/lib/api/rateLimit";
import { jsonOk, jsonRateLimited } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const rateResult = checkRateLimit(ip, "general");
  if (!rateResult.allowed) {
    return jsonRateLimited(rateResult.retryAfterSeconds);
  }

  let mode: "live" | "replay" = "live";
  let qlooConfigured = false;
  let llmConfigured = false;

  try {
    const config = getConfig();
    mode = config.APP_MODE;
    qlooConfigured = Boolean(
      config.APP_MODE === "replay" ||
        (config.QLOO_API_KEY && config.QLOO_API_KEY.trim() !== "")
    );
    llmConfigured = Boolean(config.LLM_API_KEY && config.LLM_API_KEY.trim() !== "");
  } catch {
    // If config fails to load, report as not configured
  }

  const dbOk = await checkDatabaseConnection();
  const ok = dbOk && (mode === "replay" || qlooConfigured) && llmConfigured;

  return jsonOk({
    ok,
    mode,
    qlooConfigured,
    llmConfigured,
    dbOk,
    now: now().toISOString(),
  });
}
