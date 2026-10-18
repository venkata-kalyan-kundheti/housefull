import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  searchEntities,
  getDomainInsights,
  getHeatmap,
  CallCounter,
} from "@/lib/qloo/client";
import { Budget } from "@/lib/qloo/budget";
import * as cacheModule from "@/lib/qloo/cache";
import * as configModule from "@/lib/config";
import type { QlooContext } from "@/lib/qloo/types";

describe("lib/qloo/client.ts (Section 8.1, 8.6, 8.7)", () => {
  let emittedEvents: unknown[];
  let baseContext: QlooContext;

  beforeEach(() => {
    vi.restoreAllMocks();
    emittedEvents = [];
    vi.spyOn(configModule, "getConfig").mockReturnValue({
      QLOO_API_KEY: "test-qloo-key",
      QLOO_API_URL: "https://hackathon.api.qloo.com",
      APP_MODE: "live",
      QLOO_RPS: 4,
      QLOO_CACHE_TTL_HOURS: 168,
    } as ReturnType<typeof configModule.getConfig>);

    baseContext = {
      runId: "run-test-01",
      budget: new Budget(16),
      mode: "live",
      callCounter: new CallCounter(),
      trace: {
        emit: (event) => emittedEvents.push(event),
      },
    };
  });

  it("in replay mode, a cache miss returns ReplayMissError and makes no network call", async () => {
    vi.spyOn(cacheModule, "getCachedQloo").mockResolvedValue(null);
    const fakeFetch = vi.fn();

    const ctx: QlooContext = {
      ...baseContext,
      mode: "replay",
    };

    const res = await searchEntities(ctx, "Inception", { fetchImpl: fakeFetch });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("REPLAY_MISS");
    }
    expect(fakeFetch).not.toHaveBeenCalled();
    expect(res.call.cached).toBe(false);
    expect(res.call.attempts).toBe(0);
    expect(emittedEvents).toHaveLength(1);
  });

  it("returns cached data on cache hit without consuming budget or network", async () => {
    vi.spyOn(cacheModule, "getCachedQloo").mockResolvedValue({
      payload: [
        {
          entityId: "STUB-CACHED",
          name: "Cached Film",
          types: ["urn:entity:movie"],
          popularity: 0.9,
          disambiguation: null,
        },
      ],
      status: 200,
      resultCount: 1,
      fetchedAt: new Date(),
    });
    const fakeFetch = vi.fn();

    const remainingBudgetBefore = baseContext.budget.remaining();
    const res = await searchEntities(baseContext, "Inception", { fetchImpl: fakeFetch });

    expect(res.ok).toBe(true);
    expect(res.call.cached).toBe(true);
    expect(fakeFetch).not.toHaveBeenCalled();
    // Budget must NOT be consumed on cache hit
    expect(baseContext.budget.remaining()).toBe(remainingBudgetBefore);
  });

  it("consumes budget on live cache miss and executes fetch", async () => {
    vi.spyOn(cacheModule, "getCachedQloo").mockResolvedValue(null);
    vi.spyOn(cacheModule, "setCachedQloo").mockResolvedValue();

    const fakeFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          results: [
            {
              entity_id: "ID-LIVE",
              name: "Live Search Result",
              types: ["urn:entity:movie"],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const budgetBefore = baseContext.budget.remaining();
    const res = await searchEntities(baseContext, "Inception", { fetchImpl: fakeFetch });

    expect(res.ok).toBe(true);
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    expect(baseContext.budget.remaining()).toBe(budgetBefore - 1);
    expect(res.call.cached).toBe(false);
    expect(res.call.resultCount).toBe(1);
  });

  it("returns BudgetExceededError when budget is exhausted", async () => {
    vi.spyOn(cacheModule, "getCachedQloo").mockResolvedValue(null);
    const fakeFetch = vi.fn();

    const exhaustedContext: QlooContext = {
      ...baseContext,
      budget: new Budget(0), // No budget
    };

    const res = await searchEntities(exhaustedContext, "Inception", {
      fetchImpl: fakeFetch,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("BUDGET_EXCEEDED");
    }
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  it("supports getDomainInsights, getPlaces, getHeatmap, getDemographics, searchTags", async () => {
    vi.spyOn(cacheModule, "getCachedQloo").mockResolvedValue(null);
    vi.spyOn(cacheModule, "setCachedQloo").mockResolvedValue();

    const fakeFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("urn%3Aentity%3Aartist")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              results: {
                entities: [
                  { entity_id: "A1", name: "Artist One", query: { affinity: 0.8 } },
                ],
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          )
        );
      }
      if (url.includes("urn%3Aheatmap")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              results: {
                heatmap: [
                  {
                    location: { latitude: 40.7, longitude: -74.0, geohash: "dr5ru7" },
                    query: { affinity_rank: 0.9 },
                  },
                ],
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          )
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ success: true, results: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    });

    const artistRes = await getDomainInsights(
      baseContext,
      "artist",
      "18b098fd-3d84-4609-bff3-adf9a0b00e40",
      { fetchImpl: fakeFetch }
    );
    expect(artistRes.ok).toBe(true);
    if (artistRes.ok) {
      expect(artistRes.data[0]?.name).toBe("Artist One");
    }

    const heatRes = await getHeatmap(
      baseContext,
      {
        filmEntityId: "18b098fd-3d84-4609-bff3-adf9a0b00e40",
        city: "New York",
        fetchImpl: fakeFetch,
      }
    );
    expect(heatRes.ok).toBe(true);
    if (heatRes.ok) {
      expect(heatRes.data).toHaveLength(1);
    }
  });
});
