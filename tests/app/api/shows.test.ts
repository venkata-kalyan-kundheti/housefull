import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as getShows } from "@/app/api/shows/route";
import { GET as getShowByIdRoute } from "@/app/api/shows/[id]/route";
import * as repoModule from "@/lib/db/repo";

describe("API Shows Routes (Section 14.3, 14.4)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("GET /api/shows validates query params and rejects from >= to", async () => {
    const req = new NextRequest(
      "http://localhost:3000/api/shows?from=2026-10-25T12:00:00Z&to=2026-10-24T12:00:00Z"
    );
    const res = await getShows(req);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error.code).toBe("VALIDATION_FAILED");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("GET /api/shows rejects windows larger than 14 days", async () => {
    const req = new NextRequest(
      "http://localhost:3000/api/shows?from=2026-10-01T00:00:00Z&to=2026-10-20T00:00:00Z"
    );
    const res = await getShows(req);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error.code).toBe("VALIDATION_FAILED");
  });

  it("GET /api/shows returns shows and no-store header on success", async () => {
    vi.spyOn(repoModule, "listShows").mockResolvedValue([
      {
        id: "a0000000-0000-0000-0000-000000000001",
        filmTitle: "Inception",
        theaterId: "b0000000-0000-0000-0000-000000000001",
        theaterName: "Demo Cinema",
        city: "New York",
        timeZone: "America/New_York",
        startsAtIso: "2026-10-24T18:00:00.000Z",
        startsAtLocal: "Sat 24 Oct, 2:00 pm",
        screen: 1,
        capacity: 100,
        sold: 20,
        hoursToStart: 24,
        projectedFill: 0.5714,
        underfilled: false,
        source: "synthetic",
        latestBriefId: null,
      },
    ]);

    const req = new NextRequest("http://localhost:3000/api/shows");
    const res = await getShows(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");

    const data = await res.json();
    expect(data.shows).toHaveLength(1);
    expect(data.shows[0].filmTitle).toBe("Inception");
    expect(data.now).toBeDefined();
  });

  it("GET /api/shows/:id rejects non-UUID show IDs with 400 VALIDATION_FAILED", async () => {
    const req = new NextRequest("http://localhost:3000/api/shows/not-a-uuid");
    const res = await getShowByIdRoute(req, {
      params: Promise.resolve({ id: "not-a-uuid" }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe("VALIDATION_FAILED");
  });

  it("GET /api/shows/:id returns 404 SHOW_NOT_FOUND when show does not exist", async () => {
    vi.spyOn(repoModule, "getShowById").mockResolvedValue(null);

    const validUuid = "11111111-1111-1111-1111-111111111111";
    const req = new NextRequest(`http://localhost:3000/api/shows/${validUuid}`);
    const res = await getShowByIdRoute(req, {
      params: Promise.resolve({ id: validUuid }),
    });

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error.code).toBe("SHOW_NOT_FOUND");
  });
});
