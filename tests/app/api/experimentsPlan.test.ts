import { describe, it, expect } from "vitest";
import { POST } from "@/app/api/experiments/plan/route";
import { NextRequest } from "next/server";

describe("POST /api/experiments/plan", () => {
  it("calculates plan correctly for baseline 0.05 and mdeAbs 0.02", async () => {
    const req = new NextRequest("http://localhost:3000/api/experiments/plan", {
      method: "POST",
      body: JSON.stringify({
        baseline: 0.05,
        mdeAbs: 0.02,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.p1).toBe(0.05);
    expect(data.p2).toBe(0.07);
    expect(data.nPerArm).toBe(2213);
    expect(data.totalPeople).toBe(4426);
    expect(data.alpha).toBe(0.05);
    expect(data.power).toBe(0.8);
  });

  it("returns 400 when baseline + mdeAbs >= 1", async () => {
    const req = new NextRequest("http://localhost:3000/api/experiments/plan", {
      method: "POST",
      body: JSON.stringify({
        baseline: 0.7,
        mdeAbs: 0.35,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe("VALIDATION_FAILED");
    expect(data.error.message).toContain("baseline + mdeAbs must be less than 1.");
  });

  it("returns 400 for negative baseline", async () => {
    const req = new NextRequest("http://localhost:3000/api/experiments/plan", {
      method: "POST",
      body: JSON.stringify({
        baseline: -0.05,
        mdeAbs: 0.02,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe("VALIDATION_FAILED");
  });
});
