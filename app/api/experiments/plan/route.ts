import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonOk, jsonError, jsonValidationFailed } from "@/lib/api/response";
import { sampleSizePerArm } from "@/lib/stats/sampleSize";

const planSchema = z.object({
  baseline: z.number().gt(0, "Baseline conversion must be greater than 0").lt(1, "Baseline conversion must be less than 1"),
  mdeAbs: z.number().gt(0, "mdeAbs must be greater than 0"),
  alpha: z.number().gt(0, "Alpha must be greater than 0").lt(0.5, "Alpha must be less than 0.5").optional(),
  power: z.number().gt(0.5, "Power must be greater than 0.5").lt(0.999, "Power must be less than 0.999").optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("VALIDATION_FAILED", "Invalid JSON body", 400);
  }

  const parsed = planSchema.safeParse(body);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    }));
    return jsonValidationFailed(details, details[0]?.message ?? "Validation failed");
  }

  const { baseline, mdeAbs, alpha = 0.05, power = 0.8 } = parsed.data;

  if (baseline + mdeAbs >= 1) {
    return jsonError(
      "VALIDATION_FAILED",
      "baseline + mdeAbs must be less than 1.",
      400
    );
  }

  try {
    const p1 = baseline;
    const p2 = baseline + mdeAbs;
    const nPerArm = sampleSizePerArm({ p1, p2, alpha, power });
    const totalPeople = 2 * nPerArm;

    return jsonOk({
      p1,
      p2,
      nPerArm,
      totalPeople,
      alpha,
      power,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Calculation failed";
    return jsonError("VALIDATION_FAILED", message, 400);
  }
}
