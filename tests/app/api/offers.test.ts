import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as getOffer } from "@/app/api/offer/[slug]/route";
import { POST as claimOffer } from "@/app/api/offer/[slug]/claim/route";
import * as repoModule from "@/lib/db/repo";

describe("API Offers Routes (Section 14.12, 14.13)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("GET /api/offer/:slug", () => {
    it("returns 404 when offer slug is not found", async () => {
      vi.spyOn(repoModule, "getOfferBySlug").mockResolvedValue(null);

      const req = new NextRequest("http://localhost:3000/api/offer/nonexistent");
      const res = await getOffer(req, {
        params: Promise.resolve({ slug: "nonexistent" }),
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error.code).toBe("OFFER_NOT_FOUND");
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    });

    it("returns 200 with minimal public data only (no brief, channels, evidence)", async () => {
      vi.spyOn(repoModule, "getOfferBySlug").mockResolvedValue({
        filmTitle: "Inception",
        theaterName: "Demo Cinema",
        city: "New York",
        startsAtLocal: "Sat 24 Oct, 7:00 pm",
        offerText: "Bring a friend for free",
        campaignId: "c0000000-0000-0000-0000-000000000001",
      });

      const req = new NextRequest("http://localhost:3000/api/offer/valid-slug");
      const res = await getOffer(req, {
        params: Promise.resolve({ slug: "valid-slug" }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({
        filmTitle: "Inception",
        theaterName: "Demo Cinema",
        city: "New York",
        startsAtLocal: "Sat 24 Oct, 7:00 pm",
        offerText: "Bring a friend for free",
      });
      // Ensure private data is omitted
      const record = data as Record<string, unknown>;
      expect(record.campaignId).toBeUndefined();
      expect(record.brief).toBeUndefined();
      expect(record.channels).toBeUndefined();
      expect(record.evidence).toBeUndefined();
    });
  });

  describe("POST /api/offer/:slug/claim", () => {
    it("returns 404 if offer slug is not found", async () => {
      vi.spyOn(repoModule, "getOfferBySlug").mockResolvedValue(null);

      const req = new NextRequest("http://localhost:3000/api/offer/not-found/claim", {
        method: "POST",
        body: JSON.stringify({ src: "instagram" }),
      });
      const res = await claimOffer(req, {
        params: Promise.resolve({ slug: "not-found" }),
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error.code).toBe("OFFER_NOT_FOUND");
    });

    it("validates src parameter matching ^[a-z0-9_-]{1,24}$", async () => {
      vi.spyOn(repoModule, "getOfferBySlug").mockResolvedValue({
        filmTitle: "Inception",
        theaterName: "Demo Cinema",
        city: "New York",
        startsAtLocal: "Sat 24 Oct, 7:00 pm",
        offerText: "2 for 1",
        campaignId: "c0000000-0000-0000-0000-000000000001",
      });

      const req = new NextRequest("http://localhost:3000/api/offer/test-slug/claim", {
        method: "POST",
        body: JSON.stringify({ src: "INVALID SRC WITH SPACES!" }),
      });
      const res = await claimOffer(req, {
        params: Promise.resolve({ slug: "test-slug" }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe("VALIDATION_FAILED");
    });

    it("increments claim counter and detects duplicate claims per IP within 10 minutes", async () => {
      const incrementSpy = vi
        .spyOn(repoModule, "incrementOfferClaim")
        .mockResolvedValue(undefined);

      vi.spyOn(repoModule, "getOfferBySlug").mockResolvedValue({
        filmTitle: "Inception",
        theaterName: "Demo Cinema",
        city: "New York",
        startsAtLocal: "Sat 24 Oct, 7:00 pm",
        offerText: "2 for 1",
        campaignId: "c0000000-0000-0000-0000-000000000001",
      });

      const headers = new Headers({ "x-forwarded-for": "198.51.100.42" });

      // First claim from this IP for slug-unique-1
      const req1 = new NextRequest("http://localhost:3000/api/offer/slug-unique-1/claim", {
        method: "POST",
        headers,
        body: JSON.stringify({ src: "newsletter" }),
      });
      const res1 = await claimOffer(req1, {
        params: Promise.resolve({ slug: "slug-unique-1" }),
      });

      expect(res1.status).toBe(200);
      const data1 = await res1.json();
      expect(data1.ok).toBe(true);
      expect(data1.duplicate).toBe(false);
      expect(incrementSpy).toHaveBeenCalledWith("c0000000-0000-0000-0000-000000000001", "newsletter");

      // Immediate second claim from the same IP returns duplicate: true and does not increment again
      incrementSpy.mockClear();
      const req2 = new NextRequest("http://localhost:3000/api/offer/slug-unique-1/claim", {
        method: "POST",
        headers,
        body: JSON.stringify({ src: "newsletter" }),
      });
      const res2 = await claimOffer(req2, {
        params: Promise.resolve({ slug: "slug-unique-1" }),
      });

      expect(res2.status).toBe(200);
      const data2 = await res2.json();
      expect(data2.ok).toBe(true);
      expect(data2.duplicate).toBe(true);
      expect(incrementSpy).not.toHaveBeenCalled();
    });
  });
});
