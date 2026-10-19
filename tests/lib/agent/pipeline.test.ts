import { describe, it, expect, vi, beforeEach } from "vitest";
import { runPipeline, computeInputHash } from "@/lib/agent/pipeline";
import { TraceEmitter } from "@/lib/agent/trace";
import { TasteBriefSchema, type TasteBrief } from "@/lib/agent/briefTypes";
import { resetConfigForTest } from "@/lib/config";
import * as repoModule from "@/lib/db/repo";
import * as cacheModule from "@/lib/qloo/cache";
import { resetLimiterForTest } from "@/lib/qloo/limiter";
import { FakeLlm } from "@/tests/stubs/fakeLlm";
import searchInceptionStub from "@/tests/stubs/search_inception.json";
import domainArtistStub from "@/tests/stubs/domain_artist.json";
import heatmapNycStub from "@/tests/stubs/heatmap_nyc.json";
import demographicsStub from "@/tests/stubs/demographics.json";
import placesCafeStub from "@/tests/stubs/places_cafe.json";

describe("lib/agent/pipeline.ts (Section 10 & 19.5 Scenarios)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetLimiterForTest();
    process.env.APP_MODE = "live";
    process.env.QLOO_API_KEY = "test-qloo-key";
    process.env.LLM_API_KEY = "test-llm-key";
    process.env.LLM_MODEL = "test-model";
    process.env.DATABASE_URL = "postgresql://mock:mock@localhost:5432/mock";
    process.env.QLOO_BUDGET_PER_BRIEF = "16";
    resetConfigForTest();

    vi.spyOn(cacheModule, "getCachedQloo").mockResolvedValue(null);
    vi.spyOn(cacheModule, "setCachedQloo").mockResolvedValue(undefined);
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

  function createStandardFakeFetch(overrides?: {
    search?: () => Promise<Response>;
    heatmap?: () => Promise<Response>;
    demographics?: () => Promise<Response>;
    places?: () => Promise<Response>;
    artist?: () => Promise<Response>;
    brand?: () => Promise<Response>;
    book?: () => Promise<Response>;
    defaultDomain?: () => Promise<Response>;
  }) {
    return vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes("/search")) {
        return overrides?.search
          ? overrides.search()
          : new Response(JSON.stringify(searchInceptionStub), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
      }
      if (urlStr.includes("filter.type=urn%3Aheatmap")) {
        return overrides?.heatmap
          ? overrides.heatmap()
          : new Response(JSON.stringify(heatmapNycStub), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
      }
      if (urlStr.includes("filter.type=urn%3Ademographics")) {
        return overrides?.demographics
          ? overrides.demographics()
          : new Response(JSON.stringify(demographicsStub), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
      }
      if (urlStr.includes("filter.type=urn%3Aentity%3Aplace")) {
        return overrides?.places
          ? overrides.places()
          : new Response(JSON.stringify(placesCafeStub), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
      }
      if (urlStr.includes("filter.type=urn%3Aentity%3Aartist")) {
        return overrides?.artist
          ? overrides.artist()
          : new Response(JSON.stringify(domainArtistStub), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
      }
      if (urlStr.includes("filter.type=urn%3Aentity%3Abrand")) {
        return overrides?.brand
          ? overrides.brand()
          : new Response(JSON.stringify({ success: true, results: [] }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
      }
      if (urlStr.includes("filter.type=urn%3Aentity%3Abook")) {
        return overrides?.book
          ? overrides.book()
          : new Response(JSON.stringify({ success: true, results: [] }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
      }
      return overrides?.defaultDomain
        ? overrides.defaultDomain()
        : new Response(JSON.stringify({ success: true, results: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
    });
  }

  function createStandardFakeLlm() {
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
    fakeLlm.setHandler("copy", (args) => {
      const userPrompt = String(args.user);
      const foundSegments: string[] = [];
      const regex = /"segmentId":\s*"([^"]+)"/g;
      let match;
      while ((match = regex.exec(userPrompt)) !== null) {
        if (match[1] && match[1] !== "..." && !foundSegments.includes(match[1])) {
          foundSegments.push(match[1]);
        }
      }
      const segmentIds = foundSegments.length > 0 ? foundSegments : ["s_music", "s_local"];
      return {
        segments: segmentIds.map((segId) => ({
          segmentId: segId,
          variants: [
            `Catch Inception at Film Forum on ${mockShow.startsAtLocal}. Special event for ${segId}.`,
            `Special screening of Inception on ${mockShow.startsAtLocal} at Film Forum. Great for ${segId}.`,
            `Join us for Inception at Film Forum, ${mockShow.startsAtLocal}. A cinematic journey for ${segId}.`,
          ],
        })),
      };
    });
    fakeLlm.setHandler("summary", () => ({
      summary:
        "The taste data indicates strong affinity with music and cinema fans in New York. Local outreach is recommended around the theater.",
    }));
    return fakeLlm;
  }

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
    ).rejects.toThrow('Show "non-existent-id" not found');

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

  // 19.5 Scenario 1: Happy path
  it("Scenario 1 (Happy path): all calls succeed; brief has complete sections, expected confidence, and valid callIds", async () => {
    vi.spyOn(repoModule, "getShowById").mockResolvedValue(mockShow);
    vi.spyOn(repoModule, "getBriefByHashAndMode").mockResolvedValue(null);
    vi.spyOn(repoModule, "saveBrief").mockResolvedValue(undefined);
    vi.spyOn(repoModule, "createRun").mockResolvedValue(undefined);
    vi.spyOn(repoModule, "updateRun").mockResolvedValue(undefined);

    const mockFetch = createStandardFakeFetch();
    const fakeLlm = createStandardFakeLlm();
    const emitter = new TraceEmitter();

    const brief = await runPipeline({ showId: mockShow.id }, emitter, {
      llmClient: fakeLlm,
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(brief).toBeDefined();
    expect(brief.version).toBe(1);
    expect(brief.film.title).toBe("Inception");
    expect(brief.fingerprint.length).toBeGreaterThan(0);
    expect(brief.audience).not.toBeNull();
    expect(brief.geography.status).toBe("ok");
    if (brief.geography.status === "ok") {
      expect(brief.geography.hotspots.length).toBeGreaterThan(0);
    }
    expect(brief.channels.length).toBeGreaterThan(0);
    expect(brief.copy.length).toBeGreaterThan(0);
    expect(brief.summary).not.toBeNull();
    expect(brief.confidence.score).toBeGreaterThanOrEqual(6);
    expect(brief.confidence.max).toBe(12);

    // Verify all callId references exist in evidence.calls
    const evidenceCallIds = new Set(brief.evidence.calls.map((c) => c.id));
    const filmWithCallId = brief.film as { callId?: string };
    if (filmWithCallId.callId) {
      expect(evidenceCallIds.has(filmWithCallId.callId)).toBe(true);
    }
    if (brief.audience?.callId) {
      expect(evidenceCallIds.has(brief.audience.callId)).toBe(true);
    }
    if (brief.geography.status === "ok" && brief.geography.callId) {
      expect(evidenceCallIds.has(brief.geography.callId)).toBe(true);
    }
    for (const fp of brief.fingerprint) {
      expect(evidenceCallIds.has(fp.callId)).toBe(true);
    }
    for (const ch of brief.channels) {
      for (const cid of ch.evidenceCallIds) {
        expect(evidenceCallIds.has(cid)).toBe(true);
      }
    }
    for (const pg of brief.partners) {
      expect(evidenceCallIds.has(pg.callId)).toBe(true);
    }
  });

  // 19.5 Scenario 2: Heatmap fails
  it("Scenario 2 (Heatmap fails): geography unavailable, no geo_focus channel, limitation L_GEO_UNAVAILABLE", async () => {
    vi.spyOn(repoModule, "getShowById").mockResolvedValue(mockShow);
    vi.spyOn(repoModule, "getBriefByHashAndMode").mockResolvedValue(null);
    vi.spyOn(repoModule, "saveBrief").mockResolvedValue(undefined);
    vi.spyOn(repoModule, "createRun").mockResolvedValue(undefined);
    vi.spyOn(repoModule, "updateRun").mockResolvedValue(undefined);

    const mockFetch = createStandardFakeFetch({
      heatmap: async () =>
        new Response(JSON.stringify({ error: "Heatmap unavailable" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
    });
    const fakeLlm = createStandardFakeLlm();
    const emitter = new TraceEmitter();

    const brief = await runPipeline({ showId: mockShow.id }, emitter, {
      llmClient: fakeLlm,
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(brief.geography.status).toBe("unavailable");
    expect(brief.limitations).toContain("L_GEO_UNAVAILABLE");
    // No geo_focus channels
    expect(brief.channels.every((ch) => ch.type !== "geo_focus" && !ch.id.includes("geo_focus"))).toBe(true);
  });

  // 19.5 Scenario 3: Film unresolved
  it("Scenario 3 (Film unresolved): run ends with FILM_UNRESOLVED and alternates; no further Qloo calls made", async () => {
    vi.spyOn(repoModule, "getShowById").mockResolvedValue(mockShow);
    vi.spyOn(repoModule, "getBriefByHashAndMode").mockResolvedValue(null);
    vi.spyOn(repoModule, "createRun").mockResolvedValue(undefined);
    vi.spyOn(repoModule, "updateRun").mockResolvedValue(undefined);

    let fetchCount = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      fetchCount++;
      return new Response(JSON.stringify({ success: true, results: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const fakeLlm = createStandardFakeLlm();
    const emitter = new TraceEmitter();

    await expect(
      runPipeline({ showId: mockShow.id }, emitter, {
        llmClient: fakeLlm,
        fetchImpl: mockFetch as unknown as typeof fetch,
      })
    ).rejects.toThrow();

    const failedEvent = emitter
      .getEvents()
      .find((e) => e.type === "run.failed");
    expect(failedEvent).toBeDefined();
    if (failedEvent && failedEvent.type === "run.failed") {
      expect(failedEvent.code).toBe("FILM_UNRESOLVED");
    }
    // Only 1 fetch call was made (search); no fanout or further calls!
    expect(fetchCount).toBe(1);
  });

  // 19.5 Scenario 4: LLM invalid output twice for copy
  it("Scenario 4 (LLM invalid output twice for copy): brief has copy: [], limitation L_LLM_PART:copy, rest intact", async () => {
    vi.spyOn(repoModule, "getShowById").mockResolvedValue(mockShow);
    vi.spyOn(repoModule, "getBriefByHashAndMode").mockResolvedValue(null);
    vi.spyOn(repoModule, "saveBrief").mockResolvedValue(undefined);
    vi.spyOn(repoModule, "createRun").mockResolvedValue(undefined);
    vi.spyOn(repoModule, "updateRun").mockResolvedValue(undefined);

    const mockFetch = createStandardFakeFetch();
    const fakeLlm = createStandardFakeLlm();
    fakeLlm.enqueue({ purpose: "copy", result: "Invalid LLM JSON format", isError: true });
    fakeLlm.enqueue({ purpose: "copy", result: "Invalid LLM JSON format", isError: true });

    const emitter = new TraceEmitter();
    const brief = await runPipeline({ showId: mockShow.id }, emitter, {
      llmClient: fakeLlm,
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(brief.copy).toEqual([]);
    expect(brief.limitations.some((l) => l.includes("L_LLM_PART:copy"))).toBe(true);
    // Rest intact
    expect(brief.fingerprint.length).toBeGreaterThan(0);
    expect(brief.audience).not.toBeNull();
    expect(brief.summary).not.toBeNull();
  });

  // 19.5 Scenario 5: Budget exhausted (budget 10)
  it("Scenario 5 (Budget exhausted): partners are skipped, L_BUDGET is present, brief is still produced", async () => {
    process.env.QLOO_BUDGET_PER_BRIEF = "10";
    resetConfigForTest();

    vi.spyOn(repoModule, "getShowById").mockResolvedValue(mockShow);
    vi.spyOn(repoModule, "getBriefByHashAndMode").mockResolvedValue(null);
    vi.spyOn(repoModule, "saveBrief").mockResolvedValue(undefined);
    vi.spyOn(repoModule, "createRun").mockResolvedValue(undefined);
    vi.spyOn(repoModule, "updateRun").mockResolvedValue(undefined);

    const mockFetch = createStandardFakeFetch();
    const fakeLlm = createStandardFakeLlm();
    const emitter = new TraceEmitter();

    const brief = await runPipeline({ showId: mockShow.id }, emitter, {
      llmClient: fakeLlm,
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(brief.limitations).toContain("L_BUDGET");
    expect(brief.partners.every((p) => p.places.length === 0)).toBe(true);
    expect(brief).toBeDefined();
    expect(brief.film.title).toBe("Inception");
  });

  // 19.5 Scenario 6: Replay mode with a missing demographics entry
  it("Scenario 6 (Replay mode with missing demographics entry): audience: null, L_REPLAY_MISS and L_DEMO_MISSING", async () => {
    process.env.APP_MODE = "replay";
    resetConfigForTest();

    vi.spyOn(repoModule, "getShowById").mockResolvedValue(mockShow);
    vi.spyOn(repoModule, "getBriefByHashAndMode").mockResolvedValue(null);
    vi.spyOn(repoModule, "saveBrief").mockResolvedValue(undefined);
    vi.spyOn(repoModule, "createRun").mockResolvedValue(undefined);
    vi.spyOn(repoModule, "updateRun").mockResolvedValue(undefined);

    vi.spyOn(cacheModule, "getCachedQloo").mockImplementation(
      async (endpoint: string, params: Record<string, string>) => {
        if (params["filter.type"] === "urn:demographics") {
          return null; // Missing in cache!
        }
        if (endpoint.includes("/search")) {
          return {
            payload: [
              {
                entityId: "18b098fd-3d84-4609-bff3-adf9a0b00e40",
                name: "Inception",
                types: ["urn:entity:movie"],
                popularity: 0.95,
                disambiguation: "2010 film",
              },
            ],
            status: 200,
            resultCount: 1,
            fetchedAt: new Date(),
          };
        }
        if (params["filter.type"] === "urn:heatmap") {
          return {
            payload: [
              {
                location: { latitude: 40.72, longitude: -74.0, geohash: "dr5ru7" },
                query: { affinity_rank: 0.8 },
              },
            ],
            status: 200,
            resultCount: 1,
            fetchedAt: new Date(),
          };
        }
        if (params["filter.type"] === "urn:entity:artist") {
          return {
            payload: [
              {
                entityId: "STUB-A1",
                name: "Stub Artist A",
                types: ["urn:entity:artist"],
                tags: [{ id: "urn:tag:ambient", name: "Ambient" }],
                properties: { adjectives_for_fans: ["dreamy"] },
                affinity: 0.9,
              },
            ],
            status: 200,
            resultCount: 1,
            fetchedAt: new Date(),
          };
        }
        return {
          payload: [],
          status: 200,
          resultCount: 0,
          fetchedAt: new Date(),
        };
      }
    );

    const fakeLlm = createStandardFakeLlm();
    const emitter = new TraceEmitter();

    const brief = await runPipeline({ showId: mockShow.id }, emitter, {
      llmClient: fakeLlm,
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });

    expect(brief.audience).toBeNull();
    expect(brief.limitations).toContain("L_REPLAY_MISS");
    expect(brief.limitations).toContain("L_DEMO_MISSING");
  });

  // 19.5 Scenario 7: Run clock passes 50 seconds (fake clock)
  it("Scenario 7 (Run clock passes 50 seconds): LLM steps not finished are skipped, L_TIMEOUT present, brief returned", async () => {
    vi.spyOn(repoModule, "getShowById").mockResolvedValue(mockShow);
    vi.spyOn(repoModule, "getBriefByHashAndMode").mockResolvedValue(null);
    vi.spyOn(repoModule, "saveBrief").mockResolvedValue(undefined);
    vi.spyOn(repoModule, "createRun").mockResolvedValue(undefined);
    vi.spyOn(repoModule, "updateRun").mockResolvedValue(undefined);

    let timeoutTriggered = false;
    const realNow = Date.now.bind(Date);
    vi.spyOn(Date, "now").mockImplementation(() => {
      if (timeoutTriggered) {
        return realNow() + 60000;
      }
      return realNow();
    });

    const mockFetch = createStandardFakeFetch({
      places: async () => {
        timeoutTriggered = true;
        return new Response(JSON.stringify(placesCafeStub), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    });

    const fakeLlm = createStandardFakeLlm();
    const emitter = new TraceEmitter();

    const brief = await runPipeline({ showId: mockShow.id }, emitter, {
      llmClient: fakeLlm,
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(brief).toBeDefined();
    expect(brief.limitations).toContain("L_TIMEOUT");
    expect(brief.copy).toEqual([]);
  });

  // 19.5 Scenario 8: Cached brief
  it("Scenario 8 (Cached brief): second request with same input returns fromCache: true and makes 0 Qloo and 0 LLM calls", async () => {
    vi.spyOn(repoModule, "getShowById").mockResolvedValue(mockShow);
    vi.spyOn(repoModule, "createRun").mockResolvedValue(undefined);
    vi.spyOn(repoModule, "updateRun").mockResolvedValue(undefined);

    const cachedBrief = {
      version: 1,
      id: "cached-brief-uuid",
      show: { id: mockShow.id },
    } as unknown as TasteBrief;

    vi.spyOn(repoModule, "getBriefByHashAndMode").mockResolvedValue({
      id: "cached-brief-uuid",
      content: cachedBrief,
    });

    const mockFetch = vi.fn();
    const fakeLlm = new FakeLlm();
    const llmSpy = vi.spyOn(fakeLlm, "generateJson");
    const emitter = new TraceEmitter();

    const brief = await runPipeline({ showId: mockShow.id }, emitter, {
      llmClient: fakeLlm,
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(brief).toBe(cachedBrief);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(llmSpy).not.toHaveBeenCalled();

    const readyEvent = emitter
      .getEvents()
      .find((e) => e.type === "brief.ready");
    expect(readyEvent).toMatchObject({
      type: "brief.ready",
      fromCache: true,
    });
  });

  // 19.5 Scenario 9: Exclusion language from the LLM (rule V9)
  it("Scenario 9 (Exclusion language from the LLM): violation of rule V9 triggers regeneration; clean second output used and trace shows regenerated: true", async () => {
    vi.spyOn(repoModule, "getShowById").mockResolvedValue(mockShow);
    vi.spyOn(repoModule, "getBriefByHashAndMode").mockResolvedValue(null);
    vi.spyOn(repoModule, "saveBrief").mockResolvedValue(undefined);
    vi.spyOn(repoModule, "createRun").mockResolvedValue(undefined);
    vi.spyOn(repoModule, "updateRun").mockResolvedValue(undefined);

    const mockFetch = createStandardFakeFetch();
    const fakeLlm = createStandardFakeLlm();

    let copyCallCount = 0;
    fakeLlm.setHandler("copy", (args) => {
      copyCallCount++;
      const userPrompt = String(args.user);
      const foundSegments: string[] = [];
      const regex = /"segmentId":\s*"([^"]+)"/g;
      let match;
      while ((match = regex.exec(userPrompt)) !== null) {
        if (match[1] && match[1] !== "..." && !foundSegments.includes(match[1])) {
          foundSegments.push(match[1]);
        }
      }
      const segmentIds = foundSegments.length > 0 ? foundSegments : ["s_music", "s_local"];

      if (copyCallCount === 1) {
        return {
          segments: segmentIds.map((segId) => ({
            segmentId: segId,
            variants: [
              `Special screening of Inception on ${mockShow.startsAtLocal}, only for young men who love sci-fi.`,
              `Special screening of Inception on ${mockShow.startsAtLocal} at Film Forum. Great for ${segId}.`,
              `Join us for Inception at Film Forum, ${mockShow.startsAtLocal}. A cinematic journey for ${segId}.`,
            ],
          })),
        };
      }

      return {
        segments: segmentIds.map((segId) => ({
          segmentId: segId,
          variants: [
            `Special screening of Inception on ${mockShow.startsAtLocal} at Film Forum. Recommended for moviegoers.`,
            `Special screening of Inception on ${mockShow.startsAtLocal} at Film Forum. Great for ${segId}.`,
            `Join us for Inception at Film Forum, ${mockShow.startsAtLocal}. A cinematic journey for ${segId}.`,
          ],
        })),
      };
    });

    const emitter = new TraceEmitter();
    const brief = await runPipeline({ showId: mockShow.id }, emitter, {
      llmClient: fakeLlm,
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(copyCallCount).toBe(2);
    expect(brief.copy.length).toBeGreaterThan(0);
    expect(brief.copy[0]?.variants[0]).not.toContain("only for young men");

    const validationEvent = emitter
      .getEvents()
      .find((e) => e.type === "validation.result" && e.regenerated === true);
    expect(validationEvent).toBeDefined();
  });

  // 19.5 Scenario 10: No displayed domains
  it("Scenario 10 (No displayed domains): zero channel candidates, one s_general segment, brief validates against zod schema", async () => {
    vi.spyOn(repoModule, "getShowById").mockResolvedValue(mockShow);
    vi.spyOn(repoModule, "getBriefByHashAndMode").mockResolvedValue(null);
    vi.spyOn(repoModule, "saveBrief").mockResolvedValue(undefined);
    vi.spyOn(repoModule, "createRun").mockResolvedValue(undefined);
    vi.spyOn(repoModule, "updateRun").mockResolvedValue(undefined);

    // No displayed domains: artist, movie, tv_show, brand return empty results.
    // Optional domain Book returns an entity with weak affinity (0.5), so strong=false, displayed=false.
    // Heatmap returns empty.
    const mockFetch = createStandardFakeFetch({
      artist: async () =>
        new Response(JSON.stringify({ success: true, results: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      heatmap: async () =>
        new Response(JSON.stringify({ success: true, results: { heatmap: [] } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      brand: async () =>
        new Response(JSON.stringify({ success: true, results: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      book: async () =>
        new Response(
          JSON.stringify({
            success: true,
            results: {
              entities: [
                {
                  entity_id: "BOOK-1",
                  name: "Stub Book Title",
                  types: ["urn:entity:book"],
                  query: { affinity: 0.5 },
                },
              ],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        ),
    });

    const fakeLlm = createStandardFakeLlm();
    const emitter = new TraceEmitter();
    const brief = await runPipeline({ showId: mockShow.id }, emitter, {
      llmClient: fakeLlm,
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(brief.channels.length).toBe(0);
    expect(brief.segments).toEqual([
      { id: "s_general", label: "Film lovers nearby" },
    ]);

    // Validates against TasteBriefSchema
    const parseResult = TasteBriefSchema.safeParse(brief);
    expect(parseResult.success).toBe(true);
  });
});
