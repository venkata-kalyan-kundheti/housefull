import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeFetch, buildSortedUrl } from "@/lib/qloo/request";
import * as configModule from "@/lib/config";

describe("lib/qloo/request.ts (Section 8.3)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(configModule, "getConfig").mockReturnValue({
      QLOO_API_KEY: "test-qloo-key",
      QLOO_API_URL: "https://hackathon.api.qloo.com",
      APP_MODE: "live",
      LLM_API_KEY: "test-llm-key",
    } as ReturnType<typeof configModule.getConfig>);
  });

  it("builds URL with alphabetically sorted query params", () => {
    const url = buildSortedUrl("/v2/insights", {
      take: "10",
      "filter.type": "urn:entity:artist",
      "signal.interests.entities": "id123",
    });

    const searchStr = url.search;
    // Keys in order: filter.type, signal.interests.entities, take
    expect(searchStr).toBe(
      "?filter.type=urn%3Aentity%3Aartist&signal.interests.entities=id123&take=10"
    );
  });

  it("successfully parses 200 response and extracts rate limit headers", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, results: { entities: [] } }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-second-ratelimit-limit": "5",
          "x-second-ratelimit-remaining": "4",
          "x-month-ratelimit-remaining": "9850",
        },
      })
    );

    const res = await executeFetch("/v2/insights", { query: "test" }, fakeFetch);
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(res.rateLimits.secondLimit).toBe(5);
    expect(res.rateLimits.secondRemaining).toBe(4);
    expect(res.rateLimits.monthRemaining).toBe(9850);
  });

  it("returns QlooAuthError on 401", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
    );

    const res = await executeFetch("/v2/insights", {}, fakeFetch);
    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe("QLOO_AUTH");
  });

  it("returns QlooRateLimitError on 429", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Too Many Requests" }), { status: 429 })
    );

    const res = await executeFetch("/v2/insights", {}, fakeFetch);
    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe("QLOO_RATE_LIMIT");
  });

  it("returns QlooParseError on invalid JSON", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response("<html><body>Internal Error</body></html>", { status: 200 })
    );

    const res = await executeFetch("/v2/insights", {}, fakeFetch);
    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe("QLOO_PARSE");
  });

  it("returns QlooBadRequestError when body contains success: false", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          errors: [{ message: "Invalid filter passed" }],
        }),
        { status: 200 }
      )
    );

    const res = await executeFetch("/v2/insights", {}, fakeFetch);
    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe("QLOO_BAD_REQUEST");
    expect(res.error?.message).toContain("Invalid filter passed");
  });

  it("returns QlooBadRequestError on 404", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ errors: [{ message: "Entity not found" }] }),
        { status: 404 }
      )
    );

    const res = await executeFetch("/v2/insights", {}, fakeFetch);
    expect(res.ok).toBe(false);
    expect(res.status).toBe(404);
    expect(res.error?.code).toBe("QLOO_BAD_REQUEST");
    expect(res.error?.message).toContain("Entity not found");
  });

  it("returns QlooBadRequestError on 422", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ errors: [{ message: "Unprocessable entity" }] }),
        { status: 422 }
      )
    );

    const res = await executeFetch("/v2/insights", {}, fakeFetch);
    expect(res.ok).toBe(false);
    expect(res.status).toBe(422);
    expect(res.error?.code).toBe("QLOO_BAD_REQUEST");
    expect(res.error?.message).toContain("Unprocessable entity");
  });
});
