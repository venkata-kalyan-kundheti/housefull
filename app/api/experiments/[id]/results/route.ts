/**
 * app/api/experiments/[id]/results/route.ts
 *
 * POST /api/experiments/:id/results endpoint as specified in Section 14.11.
 */

import { type NextRequest } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { experiments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { saveExperimentResults } from "@/lib/db/repo";
import { analyze } from "@/lib/stats/twoProportion";
import { checkRateLimit, getClientIp } from "@/lib/api/rateLimit";
import {
  jsonOk,
  jsonValidationFailed,
  jsonError,
  jsonRateLimited,
} from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idSchema = z.string().uuid("Experiment ID must be a valid UUID");

const resultsBodySchema = z.object({
  control: z.object({
    reached: z.number().int(),
    converted: z.number().int(),
  }),
  test: z.object({
    reached: z.number().int(),
    converted: z.number().int(),
  }),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const ip = getClientIp(request.headers);
  const rateResult = checkRateLimit(ip, "general");
  if (!rateResult.allowed) {
    return jsonRateLimited(rateResult.retryAfterSeconds);
  }

  const { id } = await context.params;

  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return jsonValidationFailed(
      [{ path: "id", message: "Experiment ID must be a valid UUID" }],
      "Invalid experiment ID"
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("BAD_REQUEST", "Request body must be valid JSON", 400);
  }

  const parsedBody = resultsBodySchema.safeParse(body);
  if (!parsedBody.success) {
    const issues = parsedBody.error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    }));
    return jsonValidationFailed(issues, "Invalid experiment results payload");
  }

  // Load experiment to fetch nPerArm
  const db = getDb();
  const rows = await db
    .select()
    .from(experiments)
    .where(eq(experiments.id, parsedId.data))
    .limit(1);

  const exp = rows[0];
  if (!exp) {
    return jsonError("EXPERIMENT_NOT_FOUND", "Experiment not found", 404);
  }

  try {
    const analysis = analyze({
      control: parsedBody.data.control,
      test: parsedBody.data.test,
      alpha: exp.alpha,
      requiredPerArm: exp.nPerArm,
    });

    await saveExperimentResults(parsedId.data, {
      control: parsedBody.data.control,
      test: parsedBody.data.test,
      analysis,
    });

    return jsonOk({
      analysis,
      underpowered: analysis.underpowered,
    });
  } catch (err: unknown) {
    if (err instanceof RangeError) {
      return jsonError("RANGE_ERROR", err.message, 400);
    }
    return jsonError("INTERNAL", "Failed to compute experiment results", 500);
  }
}
