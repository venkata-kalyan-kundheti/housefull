import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeCacheKey, getCachedQloo, setCachedQloo } from "@/lib/qloo/cache";
import * as dbClientModule from "@/lib/db/client";

describe("lib/qloo/cache.ts (Section 8.6)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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

  it("fails soft on database read error, logging warning and returning null", async () => {
    vi.spyOn(dbClientModule, "getDb").mockImplementation(() => {
      throw new Error("Neon Postgres connection down");
    });

    const cached = await getCachedQloo("/v2/insights", { query: "test" });
    expect(cached).toBeNull();
  });

  it("fails soft on database write error, ignoring without throwing", async () => {
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
});
