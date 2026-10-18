import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as createCampaign } from "@/app/api/campaigns/route";
import { GET as getCampaign } from "@/app/api/campaigns/[id]/route";
import * as repoModule from "@/lib/db/repo";

describe("API Campaigns Routes (Section 14.7, 14.8)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("POST /api/campaigns", () => {
    it("rejects invalid input schema (missing briefId or empty channels)", async () => {
      const req = new NextRequest("http://localhost:3000/api/campaigns", {
        method: "POST",
        body: JSON.stringify({
          briefId: "invalid-uuid",
          selectedChannelIds: [],
        }),
      });

      const res = await createCampaign(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe("VALIDATION_FAILED");
    });

    it("returns 404 if brief is not found", async () => {
      vi.spyOn(repoModule, "getBriefById").mockResolvedValue(null);

      const req = new NextRequest("http://localhost:3000/api/campaigns", {
        method: "POST",
        body: JSON.stringify({
          briefId: "b0000000-0000-0000-0000-000000000001",
          selectedChannelIds: ["c_instagram"],
        }),
      });

      const res = await createCampaign(req);
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error.code).toBe("BRIEF_NOT_FOUND");
    });

    it("rejects offerText containing phone numbers or URLs", async () => {
      vi.spyOn(repoModule, "getBriefById").mockResolvedValue({
        id: "b0000000-0000-0000-0000-000000000001",
        showId: "s0000000-0000-0000-0000-000000000001",
        content: {
          channels: [{ id: "c_instagram", title: "Instagram" }],
        },
      } as unknown as Awaited<ReturnType<typeof repoModule.getBriefById>>);

      const req = new NextRequest("http://localhost:3000/api/campaigns", {
        method: "POST",
        body: JSON.stringify({
          briefId: "b0000000-0000-0000-0000-000000000001",
          selectedChannelIds: ["c_instagram"],
          offerText: "Call us at +1 555-123-4567 or visit https://spam.com",
        }),
      });

      const res = await createCampaign(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe("VALIDATION_FAILED");
    });

    it("creates campaign successfully with default experiment planner", async () => {
      vi.spyOn(repoModule, "getBriefById").mockResolvedValue({
        id: "b0000000-0000-0000-0000-000000000001",
        showId: "s0000000-0000-0000-0000-000000000001",
        content: {
          channels: [{ id: "c_instagram", title: "Instagram" }],
        },
      } as unknown as Awaited<ReturnType<typeof repoModule.getBriefById>>);

      const createSpy = vi.spyOn(repoModule, "createCampaign").mockResolvedValue({
        campaign: {
          id: "c0000000-0000-0000-0000-000000000001",
          briefId: "b0000000-0000-0000-0000-000000000001",
          offerSlug: "slug-abc-123",
          offerText: "2 for 1 opening weekend",
          selectedChannelIds: ["c_instagram"],
          selectedCopy: [],
          createdAt: "2026-10-24T12:00:00.000Z",
        },
        experiment: {
          id: "e0000000-0000-0000-0000-000000000001",
          baseline: 0.05,
          mdeAbs: 0.02,
          alpha: 0.05,
          power: 0.8,
          nPerArm: 3842,
          totalPeople: 7684,
          baselineIsDefault: true,
          splitMethod: "list_split",
          results: null,
        },
      } as unknown as Awaited<ReturnType<typeof repoModule.createCampaign>>);

      const req = new NextRequest("http://localhost:3000/api/campaigns", {
        method: "POST",
        body: JSON.stringify({
          briefId: "b0000000-0000-0000-0000-000000000001",
          selectedChannelIds: ["c_instagram"],
          offerText: "2 for 1 opening weekend",
        }),
      });

      const res = await createCampaign(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.campaign.id).toBe("c0000000-0000-0000-0000-000000000001");
      expect(data.experiment.baseline).toBe(0.05);
      expect(data.experiment.mdeAbs).toBe(0.02);
      expect(createSpy).toHaveBeenCalled();
    });
  });

  describe("GET /api/campaigns/:id", () => {
    it("returns 400 if campaign id is not a valid UUID", async () => {
      const req = new NextRequest("http://localhost:3000/api/campaigns/not-a-uuid");
      const res = await getCampaign(req, {
        params: Promise.resolve({ id: "not-a-uuid" }),
      });
      expect(res.status).toBe(400);
    });

    it("returns 404 if campaign is not found", async () => {
      vi.spyOn(repoModule, "getCampaignById").mockResolvedValue(null);

      const req = new NextRequest(
        "http://localhost:3000/api/campaigns/c0000000-0000-0000-0000-000000000001"
      );
      const res = await getCampaign(req, {
        params: Promise.resolve({ id: "c0000000-0000-0000-0000-000000000001" }),
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error.code).toBe("CAMPAIGN_NOT_FOUND");
    });

    it("returns 200 with campaign, experiment, and brief details", async () => {
      vi.spyOn(repoModule, "getCampaignById").mockResolvedValue({
        campaign: {
          id: "c0000000-0000-0000-0000-000000000001",
          briefId: "b0000000-0000-0000-0000-000000000001",
          offerSlug: "my-offer-slug",
          offerText: "Special Offer",
          selectedChannelIds: ["c_instagram"],
          selectedCopy: [],
          createdAt: "2026-10-24T12:00:00.000Z",
        },
        experiment: {
          id: "e0000000-0000-0000-0000-000000000001",
          baseline: 0.05,
          mdeAbs: 0.02,
          alpha: 0.05,
          power: 0.8,
          nPerArm: 3842,
          totalPeople: 7684,
          baselineIsDefault: true,
          splitMethod: "list_split",
          results: null,
        },
        brief: {
          id: "b0000000-0000-0000-0000-000000000001",
          film: { title: "Inception", qlooEntityId: "ent_inc" },
          show: {},
        },
      } as unknown as Awaited<ReturnType<typeof repoModule.getCampaignById>>);

      const req = new NextRequest(
        "http://localhost:3000/api/campaigns/c0000000-0000-0000-0000-000000000001"
      );
      const res = await getCampaign(req, {
        params: Promise.resolve({ id: "c0000000-0000-0000-0000-000000000001" }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.campaign.offerSlug).toBe("my-offer-slug");
      expect(data.experiment.nPerArm).toBe(3842);
    });
  });
});
