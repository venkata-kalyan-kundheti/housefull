import { describe, it, expect, vi, beforeEach } from "vitest";
import { runPipeline, computeInputHash } from "@/lib/agent/pipeline";
import { TraceEmitter } from "@/lib/agent/trace";
import type { TasteBrief } from "@/lib/agent/briefTypes";
import { resetConfigForTest } from "@/lib/config";
import * as repoModule from "@/lib/db/repo";
import { FakeLlm } from "@/tests/stubs/fakeLlm";
import searchInceptionStub from "@/tests/stubs/search_inception.json";
import domainArtistStub from "@/tests/stubs/domain_artist.json";
import heatmapNycStub from "@/tests/stubs/heatmap_nyc.json";
import demographicsStub from "@/tests/stubs/demographics.json";
import placesCafeStub from "@/tests/stubs/places_cafe.json";

describe("lib/agent/pipeline.ts (Section 10)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.APP_MODE = "live";
    process.env.QLOO_API_KEY = "test-qloo-key";
    process.env.LLM_API_KEY = "test-llm-key";
    process.env.LLM_MODEL = "test-model";
    process.env.DATABASE_URL = "postgresql://mock:mock@localhost:5432/mock";
    resetConfigForTest();
  });

  const mockShow: repoModule.ShowDetailsView = {
    id: "a0000000-0000-0000-0000-000000000001",
    filmTitle: "Inception",
    theaterId: "b0000000-0000-0000-0000-000000000001",
    theaterName: "Film Forum",
    city: "New York",
    timeZone: "America/New_York",
    startsAtIso: "2026-10-25T20:00:00.000Z",
    startsAtLocal: "Sun, Oct 25, 4:00 PM",
    screen: 1,
    capacity: 100,
    sold: 20,
    hoursToStart: 24,
    projectedFill: 0.5714,
    underfilled: true,
    source: "synthetic",
    latestBriefId: null,
    theater: {
      lat: 40.7282,
      lon: -74.0047,
    },
  };

  it("computes deterministic input hash with keys in fixed order", () => {
    const hash1 = computeInputHash({
      showId: "123",
      filmEntityIdOverride: undefined,
      radiusKm: 15,
      pipelineVersion: 1,
      includeCinemaPeers: false,
    });
    const hash2 = computeInputHash({
      showId: "123",
      filmEntityIdOverride: undefined,
      radiusKm: 15,
      pipelineVersion: 1,
      includeCinemaPeers: false,
    });

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("S0: fails with SHOW_NOT_FOUND when show does not exist", async () => {
    vi.spyOn(repoModule, "getShowById").mockResolvedValue(null);
    const emitter = new TraceEmitter();

    await expect(
      runPipeline({ showId: "non-existent-id" }, emitter)
    ).rejects.toThrow("Show \"non-existent-id\" not found");

    const failedEvent = emitter
      .getEvents()
      .find((e) => e.type === "run.failed");
    expect(failedEvent).toBeDefined();
    if (failedEvent && failedEvent.type === "run.failed") {
      expect(failedEvent.code).toBe("SHOW_NOT_FOUND");
    }
  });

  it("S0: fails with SHOW_ALREADY_STARTED when show has started", async () => {
    vi.spyOn(repoModule, "getShowById").mockResolvedValue({
      ...mockShow,
      startsAtIso: "2020-01-01T00:00:00.000Z",
    });
    const emitter = new TraceEmitter();

    await expect(
      runPipeline({ showId: mockShow.id }, emitter)
    ).rejects.toThrow();

    const failedEvent = emitter
      .getEvents()
      .find((e) => e.type === "run.failed");
    expect(failedEvent).toBeDefined();
    if (failedEvent && failedEvent.type === "run.failed") {
      expect(failedEvent.code).toBe("SHOW_ALREADY_STARTED");
    }
  });

  it("S0: returns cached brief immediately when available and force is false", async () => {
    vi.spyOn(repoModule, "getShowById").mockResolvedValue(mockShow);
    const cachedContent = {
      id: "cached-brief-uuid",
      version: 1,
      generatedAt: "2026-10-18T00:00:00.000Z",
      show: { id: mockShow.id },
    } as unknown as TasteBrief;
    vi.spyOn(repoModule, "getBriefByHashAndMode").mockResolvedValue({
      id: "cached-brief-uuid",
      content: cachedContent,
    });

    const emitter = new TraceEmitter();
    const brief = await runPipeline({ showId: mockShow.id }, emitter);

    expect(brief).toBe(cachedContent);
    const readyEvent = emitter
      .getEvents()
      .find((e) => e.type === "brief.ready");
    expect(readyEvent).toMatchObject({
      type: "brief.ready",
      briefId: "cached-brief-uuid",
      fromCache: true,
    });
  });

  it("executes full S0–S12 pipeline with mock fetch and FakeLlm", async () => {
    vi.spyOn(repoModule, "getShowById").mockResolvedValue(mockShow);
    vi.spyOn(repoModule, "getBriefByHashAndMode").mockResolvedValue(null);
    const saveBriefSpy = vi
      .spyOn(repoModule, "saveBrief")
      .mockResolvedValue(undefined);
    vi.spyOn(repoModule, "createRun").mockResolvedValue(undefined);
    vi.spyOn(repoModule, "updateRun").mockResolvedValue(undefined);

    // Mock fetchImpl for Qloo calls
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes("/search")) {
        return new Response(JSON.stringify(searchInceptionStub), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (urlStr.includes("filter.type=urn%3Aheatmap")) {
        return new Response(JSON.stringify(heatmapNycStub), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (urlStr.includes("filter.type=urn%3Ademographics")) {
        return new Response(JSON.stringify(demographicsStub), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (urlStr.includes("filter.type=urn%3Aentity%3Aplace")) {
        return new Response(JSON.stringify(placesCafeStub), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (urlStr.includes("filter.type=urn%3Aentity%3Aartist")) {
        return new Response(JSON.stringify(domainArtistStub), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      // Other domains return empty data
      return new Response(
        JSON.stringify({ success: true, results: [] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });

    const fakeLlm = new FakeLlm();
    fakeLlm.setHandler("planner", () => ({ actions: [] }));
    fakeLlm.setHandler("channels", () => ({
      ranked: [
        {
          id: "ch_music_community",
          priority: 1,
          rationale: "Fans of stub artist may appreciate the film score.",
        },
      ],
      dropped: [],
    }));
    fakeLlm.setHandler("copy", () => ({
      segments: [
        {
          segmentId: "s_music",
          variants: [
            `Catch Inception at Film Forum on ${mockShow.startsAtLocal}. Perfect for fans of Stub Artist A.`,
            `Special screening of Inception on ${mockShow.startsAtLocal} at Film Forum. Recommended for music lovers.`,
            `Join us for Inception at Film Forum, ${mockShow.startsAtLocal}. A cinematic journey you will love.`,
          ],
        },
      ],
    }));
    fakeLlm.setHandler("summary", () => ({
      summary:
        "The taste data indicates strong affinity with music and cinema fans in New York. Local outreach is recommended around the theater.",
    }));

    const emitter = new TraceEmitter();
    const brief = await runPipeline(
      { showId: mockShow.id },
      emitter,
      {
        llmClient: fakeLlm,
        fetchImpl: mockFetch as unknown as typeof fetch,
      }
    );

    expect(brief).toBeDefined();
    expect(brief.version).toBe(1);
    expect(brief.film.title).toBe("Inception");
    expect(brief.film.resolution).toBe("exact");
    expect(brief.confidence.score).toBeGreaterThanOrEqual(1);
    expect(brief.confidence.max).toBe(12);

    expect(saveBriefSpy).toHaveBeenCalledTimes(1);

    const events = emitter.getEvents();
    expect(events.some((e) => e.type === "run.started")).toBe(true);
    expect(events.some((e) => e.type === "step.started" && e.step === "resolve_film")).toBe(true);
    expect(events.some((e) => e.type === "step.started" && e.step === "fan_out")).toBe(true);
    expect(events.some((e) => e.type === "step.started" && e.step === "derive")).toBe(true);
    expect(events.some((e) => e.type === "brief.ready")).toBe(true);
  });
});
