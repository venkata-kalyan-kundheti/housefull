import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  computeCacheKey,
  getCachedQloo,
  setCachedQloo,
} from "@/lib/qloo/cache";
import * as dbClientModule from "@/lib/db/client";
import * as timeModule from "@/lib/time/now";
import { searchEntities, CallCounter } from "@/lib/qloo/client";
import { Budget } from "@/lib/qloo/budget";
import { resetLimiterForTest } from "@/lib/qloo/limiter";
import type { QlooContext } from "@/lib/qloo/types";

describe("lib/qloo/cache.ts (Section 8.6 & 19.4 - 8 Cache Cases)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetLimiterForTest();
  });

  it("computes deterministic SHA256 key with sorted parameters", () => {
    const key1 = computeCacheKey("/v2/insights", {
      take: "10",
      "filter.type": "urn:entity:artist",
      "signal.interests.entities": "id123",
    });
    const key2 = computeCacheKey("/v2/insights", {
      "signal.interests.entities": "id123",
      take: "10",
      "filter.type": "urn:entity:artist",
    });

    expect(key1).toBe(key2);
    expect(key1).toMatch(/^[0-9a-f]{64}$/);
  });

  // Case 1: Cache Hit
  it("case 1 - cache hit: returns cached payload when entry exists and is not expired", async () => {
    const fetchedAt = new Date("2026-10-18T10:00:00Z");
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([
        {
          payload: { entities: [{ name: "Stub Artist" }] },
          status: 200,
          resultCount: 1,
          fetchedAt,
        },
      ]),
    };
    vi.spyOn(dbClientModule, "getDb").mockReturnValue(mockDb as unknown as ReturnType<typeof dbClientModule.getDb>);

    const cached = await getCachedQloo<{ entities: { name: string }[] }>("/v2/insights", { query: "test" });
    expect(cached).not.toBeNull();
    expect(cached?.payload.entities[0]?.name).toBe("Stub Artist");
    expect(cached?.status).toBe(200);
    expect(cached?.resultCount).toBe(1);
  });

  // Case 2: Cache Miss
  it("case 2 - cache miss: returns null when no matching entry exists", async () => {
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    vi.spyOn(dbClientModule, "getDb").mockReturnValue(mockDb as unknown as ReturnType<typeof dbClientModule.getDb>);

    const cached = await getCachedQloo("/v2/insights", { query: "missing" });
    expect(cached).toBeNull();
  });

  // Case 3: Expired
  it("case 3 - expired: returns null when cached entry has expired", async () => {
    // When an entry's expiresAt <= now(), the where gt(expiresAt, now()) query returns no rows
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    vi.spyOn(dbClientModule, "getDb").mockReturnValue(mockDb as unknown as ReturnType<typeof dbClientModule.getDb>);

    const cached = await getCachedQloo("/v2/insights", { query: "expired" });
    expect(cached).toBeNull();
  });

  // Case 4: Empty-result short TTL
  it("case 4 - empty-result short TTL: stores with min(TTL, 6 hours) when resultCount is 0", async () => {
    const fixedNow = new Date("2026-10-18T12:00:00.000Z");
    vi.spyOn(timeModule, "now").mockReturnValue(fixedNow);

    let insertedValues: Record<string, unknown> | null = null;
    const mockDb = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockImplementation((val) => {
          insertedValues = val;
          return {
            onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
          };
        }),
      }),
    };
    vi.spyOn(dbClientModule, "getDb").mockReturnValue(mockDb as unknown as ReturnType<typeof dbClientModule.getDb>);

    await setCachedQloo({
      endpoint: "/v2/insights",
      params: { query: "empty" },
      payload: { entities: [] },
      status: 200,
      resultCount: 0,
    });

    expect(insertedValues).not.toBeNull();
    const expiresAt = insertedValues!.expiresAt as Date;
    // Expected TTL is 6 hours (6 * 3600 * 1000 = 21,600,000 ms)
    const diffHours = (expiresAt.getTime() - fixedNow.getTime()) / (3600 * 1000);
    expect(diffHours).toBe(6);

    // Contrasting with non-empty results (168 hours default)
    await setCachedQloo({
      endpoint: "/v2/insights",
      params: { query: "populated" },
      payload: { entities: [{ id: "1" }] },
      status: 200,
      resultCount: 1,
    });
    const populatedExpiresAt = insertedValues!.expiresAt as Date;
    const populatedDiffHours = (populatedExpiresAt.getTime() - fixedNow.getTime()) / (3600 * 1000);
    expect(populatedDiffHours).toBe(168);
  });

  // Case 5: Read failure treated as miss
  it("case 5 - read failure treated as miss: logs warning and returns null when DB fails", async () => {
    vi.spyOn(dbClientModule, "getDb").mockImplementation(() => {
      throw new Error("Neon Postgres connection down");
    });

    const cached = await getCachedQloo("/v2/insights", { query: "test" });
    expect(cached).toBeNull();
  });

  // Case 6: Write failure ignored
  it("case 6 - write failure ignored: does not throw when DB insert fails", async () => {
    vi.spyOn(dbClientModule, "getDb").mockImplementation(() => {
      throw new Error("Neon Postgres write timeout");
    });

    await expect(
      setCachedQloo({
        endpoint: "/v2/insights",
        params: { query: "test" },
        payload: { entities: [] },
        status: 200,
        resultCount: 0,
      })
    ).resolves.not.toThrow();
  });

  // Case 7: Replay miss
  it("case 7 - replay miss: returns REPLAY_MISS error and makes zero network calls in replay mode", async () => {
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    vi.spyOn(dbClientModule, "getDb").mockReturnValue(mockDb as unknown as ReturnType<typeof dbClientModule.getDb>);

    const fakeFetch = vi.fn();
    const ctx: QlooContext = {
      runId: "run-replay-test",
      budget: new Budget(16),
      mode: "replay",
      callCounter: new CallCounter(),
    };

    const res = await searchEntities(ctx, "Inception", { fetchImpl: fakeFetch });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("REPLAY_MISS");
    }
    expect(fakeFetch).not.toHaveBeenCalled();
    expect(res.call.cached).toBe(false);
    expect(res.call.attempts).toBe(0);
  });

  // Case 8: Cache hit does not consume budget
  it("case 8 - cache hit does not consume budget: leaves budget remaining count unchanged", async () => {
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([
        {
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
        },
      ]),
    };
    vi.spyOn(dbClientModule, "getDb").mockReturnValue(mockDb as unknown as ReturnType<typeof dbClientModule.getDb>);

    const fakeFetch = vi.fn();
    const budget = new Budget(16);
    const ctx: QlooContext = {
      runId: "run-cache-budget-test",
      budget,
      mode: "live",
      callCounter: new CallCounter(),
    };

    const remainingBefore = budget.remaining();
    const res = await searchEntities(ctx, "Inception", { fetchImpl: fakeFetch });

    expect(res.ok).toBe(true);
    expect(res.call.cached).toBe(true);
    expect(fakeFetch).not.toHaveBeenCalled();
    expect(budget.remaining()).toBe(remainingBefore);
  });
});
