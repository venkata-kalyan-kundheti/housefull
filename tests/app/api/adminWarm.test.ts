import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as warmRoute } from "@/app/api/admin/warm/route";
import * as configModule from "@/lib/config";
import * as pipelineModule from "@/lib/agent/pipeline";
import type { TasteBrief } from "@/lib/agent/briefTypes";

const mockConfig = (overrides: Partial<configModule.AppConfig> = {}) =>
  ({
    QLOO_API_URL: "https://hackathon.api.qloo.com",
    APP_MODE: "live",
    LLM_PROVIDER: "gemini",
    LLM_API_KEY: "test-key",
    LLM_MODEL: "gemini-2.5-flash",
    DATABASE_URL: "postgres://mock",
    QLOO_RPS: 4,
    QLOO_BUDGET_PER_BRIEF: 16,
    QLOO_CACHE_TTL_HOURS: 168,
    CATCHMENT_RADIUS_KM: 15,
    LOG_LEVEL: "info",
    ...overrides,
  } as unknown as configModule.AppConfig);

describe("API Admin Warm Route (Section 14.14)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 404 when ADMIN_TOKEN is not configured", async () => {
    vi.spyOn(configModule, "getConfig").mockReturnValue(mockConfig({ ADMIN_TOKEN: undefined }));

    const req = new NextRequest("http://localhost:3000/api/admin/warm", {
      method: "POST",
      headers: { authorization: "Bearer secret-token" },
      body: JSON.stringify({ showIds: ["a0000000-0000-0000-0000-000000000001"] }),
    });

    const res = await warmRoute(req);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error.code).toBe("NOT_FOUND");
  });

  it("returns 401 UNAUTHORIZED when Authorization header is invalid", async () => {
    vi.spyOn(configModule, "getConfig").mockReturnValue(mockConfig({ ADMIN_TOKEN: "valid-admin-token" }));

    const req = new NextRequest("http://localhost:3000/api/admin/warm", {
      method: "POST",
      headers: { authorization: "Bearer wrong-token" },
      body: JSON.stringify({ showIds: ["a0000000-0000-0000-0000-000000000001"] }),
    });

    const res = await warmRoute(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects showIds array with 0 items or more than 6 items", async () => {
    vi.spyOn(configModule, "getConfig").mockReturnValue(mockConfig({ ADMIN_TOKEN: "valid-admin-token" }));

    const reqEmpty = new NextRequest("http://localhost:3000/api/admin/warm", {
      method: "POST",
      headers: { authorization: "Bearer valid-admin-token" },
      body: JSON.stringify({ showIds: [] }),
    });
    const resEmpty = await warmRoute(reqEmpty);
    expect(resEmpty.status).toBe(400);

    const reqTooMany = new NextRequest("http://localhost:3000/api/admin/warm", {
      method: "POST",
      headers: { authorization: "Bearer valid-admin-token" },
      body: JSON.stringify({
        showIds: [
          "a0000000-0000-0000-0000-000000000001",
          "a0000000-0000-0000-0000-000000000002",
          "a0000000-0000-0000-0000-000000000003",
          "a0000000-0000-0000-0000-000000000004",
          "a0000000-0000-0000-0000-000000000005",
          "a0000000-0000-0000-0000-000000000006",
          "a0000000-0000-0000-0000-000000000007",
        ],
      }),
    });
    const resTooMany = await warmRoute(reqTooMany);
    expect(resTooMany.status).toBe(400);
  });

  it("runs pipeline sequentially with force: true and returns results", async () => {
    vi.spyOn(configModule, "getConfig").mockReturnValue(mockConfig({ ADMIN_TOKEN: "secret-warm-token" }));

    const runPipelineSpy = vi
      .spyOn(pipelineModule, "runPipeline")
      .mockResolvedValueOnce({} as unknown as TasteBrief)
      .mockRejectedValueOnce({ code: "FILM_UNRESOLVED", message: "Not found" });

    const showIds = [
      "a0000000-0000-0000-0000-000000000001",
      "a0000000-0000-0000-0000-000000000002",
    ];

    const req = new NextRequest("http://localhost:3000/api/admin/warm", {
      method: "POST",
      headers: { authorization: "Bearer secret-warm-token" },
      body: JSON.stringify({ showIds }),
    });

    const res = await warmRoute(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.results).toEqual([
      { showId: showIds[0], ok: true },
      { showId: showIds[1], ok: false, errorCode: "FILM_UNRESOLVED" },
    ]);

    expect(runPipelineSpy).toHaveBeenCalledTimes(2);
    expect(runPipelineSpy).toHaveBeenNthCalledWith(
      1,
      { showId: showIds[0], force: true },
      expect.anything()
    );
    expect(runPipelineSpy).toHaveBeenNthCalledWith(
      2,
      { showId: showIds[1], force: true },
      expect.anything()
    );
  });
});
