import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { PUT as updatePlan } from "@/app/api/experiments/[id]/route";
import { POST as saveResults } from "@/app/api/experiments/[id]/results/route";
import * as repoModule from "@/lib/db/repo";
import * as dbClientModule from "@/lib/db/client";

describe("API Experiments Routes (Section 14.10, 14.11)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("PUT /api/experiments/:id", () => {
    it("rejects baseline + mdeAbs >= 1.0", async () => {
      const req = new NextRequest(
        "http://localhost:3000/api/experiments/e0000000-0000-0000-0000-000000000001",
        {
          method: "PUT",
          body: JSON.stringify({
            baseline: 0.8,
            mdeAbs: 0.3, // 0.8 + 0.3 = 1.1 >= 1.0
          }),
        }
      );

      const res = await updatePlan(req, {
        params: Promise.resolve({ id: "e0000000-0000-0000-0000-000000000001" }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe("VALIDATION_FAILED");
    });

    it("returns 404 when experiment ID is not found", async () => {
      vi.spyOn(repoModule, "updateExperimentPlan").mockResolvedValue(null);

      const req = new NextRequest(
        "http://localhost:3000/api/experiments/e0000000-0000-0000-0000-000000000001",
        {
          method: "PUT",
          body: JSON.stringify({
            baseline: 0.1,
            mdeAbs: 0.05,
          }),
        }
      );

      const res = await updatePlan(req, {
        params: Promise.resolve({ id: "e0000000-0000-0000-0000-000000000001" }),
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error.code).toBe("EXPERIMENT_NOT_FOUND");
    });

    it("updates experiment plan and recomputes nPerArm", async () => {
      vi.spyOn(repoModule, "updateExperimentPlan").mockResolvedValue({
        id: "e0000000-0000-0000-0000-000000000001",
        baseline: 0.1,
        mdeAbs: 0.05,
        alpha: 0.05,
        power: 0.8,
        nPerArm: 686,
        totalPeople: 1372,
        baselineIsDefault: false,
        splitMethod: "list_split",
        results: null,
      });

      const req = new NextRequest(
        "http://localhost:3000/api/experiments/e0000000-0000-0000-0000-000000000001",
        {
          method: "PUT",
          body: JSON.stringify({
            baseline: 0.1,
            mdeAbs: 0.05,
          }),
        }
      );

      const res = await updatePlan(req, {
        params: Promise.resolve({ id: "e0000000-0000-0000-0000-000000000001" }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.nPerArm).toBe(686);
      expect(data.baselineIsDefault).toBe(false);
    });
  });

  describe("POST /api/experiments/:id/results", () => {
    it("validates that converted does not exceed reached and inputs are non-negative", async () => {
      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: "e0000000-0000-0000-0000-000000000001",
                  nPerArm: 500,
                },
              ]),
            }),
          }),
        }),
      };
      vi.spyOn(dbClientModule, "getDb").mockReturnValue(mockDb as unknown as ReturnType<typeof dbClientModule.getDb>);

      // Converted (200) > reached (100)
      const req = new NextRequest(
        "http://localhost:3000/api/experiments/e0000000-0000-0000-0000-000000000001/results",
        {
          method: "POST",
          body: JSON.stringify({
            control: { reached: 100, converted: 200 },
            test: { reached: 100, converted: 20 },
          }),
        }
      );

      const res = await saveResults(req, {
        params: Promise.resolve({ id: "e0000000-0000-0000-0000-000000000001" }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe("RANGE_ERROR");
    });

    it("computes two-proportion analysis and saves results", async () => {
      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: "e0000000-0000-0000-0000-000000000001",
                  nPerArm: 500,
                },
              ]),
            }),
          }),
        }),
      };
      vi.spyOn(dbClientModule, "getDb").mockReturnValue(mockDb as unknown as ReturnType<typeof dbClientModule.getDb>);
      vi.spyOn(repoModule, "saveExperimentResults").mockResolvedValue({} as unknown as Awaited<ReturnType<typeof repoModule.saveExperimentResults>>);

      const req = new NextRequest(
        "http://localhost:3000/api/experiments/e0000000-0000-0000-0000-000000000001/results",
        {
          method: "POST",
          body: JSON.stringify({
            control: { reached: 1000, converted: 50 },
            test: { reached: 1000, converted: 80 },
          }),
        }
      );

      const res = await saveResults(req, {
        params: Promise.resolve({ id: "e0000000-0000-0000-0000-000000000001" }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.analysis).toBeDefined();
      expect(data.analysis.verdict).toBe("positive");
      expect(data.analysis.controlRate).toBe(0.05);
      expect(data.analysis.testRate).toBe(0.08);
      expect(data.underpowered).toBe(false);
    });
  });
});
