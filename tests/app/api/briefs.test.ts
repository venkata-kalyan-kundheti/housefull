import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as postBrief } from "@/app/api/briefs/route";
import { GET as getBriefByIdRoute } from "@/app/api/briefs/[id]/route";
import * as repoModule from "@/lib/db/repo";
import * as rateLimitModule from "@/lib/api/rateLimit";
import * as pipelineModule from "@/lib/agent/pipeline";
import type { TasteBrief } from "@/lib/agent/briefTypes";
import { resetConfigForTest } from "@/lib/config";

describe("API Briefs Routes (Sections 14.5, 14.6)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.APP_MODE = "live";
    process.env.QLOO_API_KEY = "test-qloo-key";
    process.env.LLM_API_KEY = "test-llm-key";
    process.env.LLM_MODEL = "test-model";
    process.env.DATABASE_URL = "postgresql://mock:mock@localhost:5432/mock";
    resetConfigForTest();
  });

  const validShowUuid = "a0000000-0000-0000-0000-000000000001";
  const validBriefUuid = "b0000000-0000-0000-0000-000000000001";

  it("POST /api/briefs rejects non-JSON body with 400 BAD_REQUEST", async () => {
    const req = new NextRequest("http://localhost:3000/api/briefs", {
      method: "POST",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    });

    const res = await postBrief(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe("BAD_REQUEST");
  });

  it("POST /api/briefs rejects invalid showId with 400 VALIDATION_FAILED", async () => {
    const req = new NextRequest("http://localhost:3000/api/briefs", {
      method: "POST",
      body: JSON.stringify({ showId: "invalid-uuid" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await postBrief(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe("VALIDATION_FAILED");
    expect(data.error.details[0].path).toBe("showId");
  });

  it("POST /api/briefs rejects out-of-range radiusKm (< 2 or > 50)", async () => {
    const req = new NextRequest("http://localhost:3000/api/briefs", {
      method: "POST",
      body: JSON.stringify({ showId: validShowUuid, radiusKm: 1 }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await postBrief(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe("VALIDATION_FAILED");
  });

  it("POST /api/briefs returns 429 when rate limited", async () => {
    vi.spyOn(rateLimitModule, "checkRateLimit").mockReturnValue({
      allowed: false,
      retryAfterSeconds: 45,
    });

    const req = new NextRequest("http://localhost:3000/api/briefs", {
      method: "POST",
      body: JSON.stringify({ showId: validShowUuid }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await postBrief(req);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("45");
  });

  it("POST /api/briefs streams Server-Sent Events with correct headers", async () => {
    vi.spyOn(rateLimitModule, "checkRateLimit").mockReturnValue({
      allowed: true,
      retryAfterSeconds: 0,
    });

    // Mock pipeline execution to immediately emit ready
    vi.spyOn(pipelineModule, "runPipeline").mockImplementation(
      async (input, emitter) => {
        emitter.emitStepStarted("resolve_film");
        emitter.emit({
          type: "brief.ready",
          briefId: validBriefUuid,
          fromCache: false,
        });
        return {} as unknown as TasteBrief;
      }
    );

    const req = new NextRequest("http://localhost:3000/api/briefs", {
      method: "POST",
      body: JSON.stringify({ showId: validShowUuid }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await postBrief(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("no-cache, no-transform");
    expect(res.headers.get("Connection")).toBe("keep-alive");

    // Read the stream
    const reader = res.body?.getReader();
    expect(reader).toBeDefined();

    const decoder = new TextDecoder();
    let text = "";
    while (true) {
      const { done, value } = await reader!.read();
      if (done) break;
      text += decoder.decode(value);
    }

    expect(text).toContain("event: step.started");
    expect(text).toContain("event: brief.ready");
    expect(text).toContain(validBriefUuid);
  });

  it("GET /api/briefs/:id rejects non-UUID IDs", async () => {
    const req = new NextRequest("http://localhost:3000/api/briefs/not-a-uuid");
    const res = await getBriefByIdRoute(req, {
      params: Promise.resolve({ id: "not-a-uuid" }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe("VALIDATION_FAILED");
  });

  it("GET /api/briefs/:id returns 404 BRIEF_NOT_FOUND when not found", async () => {
    vi.spyOn(repoModule, "getBriefById").mockResolvedValue(null);

    const req = new NextRequest(`http://localhost:3000/api/briefs/${validBriefUuid}`);
    const res = await getBriefByIdRoute(req, {
      params: Promise.resolve({ id: validBriefUuid }),
    });

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error.code).toBe("BRIEF_NOT_FOUND");
  });

  it("GET /api/briefs/:id returns 200 with brief content when found", async () => {
    const mockContent: Record<string, unknown> = {
      id: validBriefUuid,
      version: 1,
      film: { title: "Inception" },
    };
    vi.spyOn(repoModule, "getBriefById").mockResolvedValue({
      id: validBriefUuid,
      showId: validShowUuid,
      content: mockContent,
      createdAt: new Date(),
    });

    const req = new NextRequest(`http://localhost:3000/api/briefs/${validBriefUuid}`);
    const res = await getBriefByIdRoute(req, {
      params: Promise.resolve({ id: validBriefUuid }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe(validBriefUuid);
    expect(data.film.title).toBe("Inception");
  });
});
