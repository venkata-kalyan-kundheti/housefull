/**
 * app/api/experiments/[id]/route.ts
 *
 * PUT /api/experiments/:id endpoint as specified in Section 14.10.
 */

import { type NextRequest } from "next/server";
import { z } from "zod";
import { updateExperimentPlan } from "@/lib/db/repo";
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

const planBodySchema = z
  .object({
    baseline: z.number().gt(0).lt(1),
    mdeAbs: z.number().gt(0),
    alpha: z.number().gt(0).lt(0.5).optional(),
    power: z.number().gt(0.5).lt(1).optional(),
  })
  .refine((data) => data.baseline + data.mdeAbs < 1, {
    message: "baseline + mdeAbs must be less than 1.0",
    path: ["mdeAbs"],
  });

export async function PUT(
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

  const parsedBody = planBodySchema.safeParse(body);
  if (!parsedBody.success) {
    const issues = parsedBody.error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    }));
    return jsonValidationFailed(issues, "Invalid experiment plan parameters");
  }

  try {
    const updated = await updateExperimentPlan(parsedId.data, parsedBody.data);
    if (!updated) {
      return jsonError("EXPERIMENT_NOT_FOUND", "Experiment not found", 404);
    }

    return jsonOk(updated);
  } catch (err: unknown) {
    if (err instanceof RangeError) {
      return jsonError("RANGE_ERROR", err.message, 400);
    }
    return jsonError("INTERNAL", "Failed to update experiment plan", 500);
  }
}
