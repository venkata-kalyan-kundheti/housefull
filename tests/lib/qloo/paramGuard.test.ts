import { describe, it, expect } from "vitest";
import { guardParams } from "@/lib/qloo/paramGuard";

describe("lib/qloo/paramGuard.ts (Section 8.2)", () => {
  it("passes all allowed combinations for domain insights", () => {
    const params = {
      "filter.type": "urn:entity:artist",
      "signal.interests.entities": "18b098fd-3d84-4609-bff3-adf9a0b00e40",
      take: 10,
    };
    const res = guardParams("/v2/insights", params);
    expect(res["filter.type"]).toBe("urn:entity:artist");
    expect(res["signal.interests.entities"]).toBe("18b098fd-3d84-4609-bff3-adf9a0b00e40");
    expect(res.take).toBe("10");
  });

  it("passes allowed place insights", () => {
    const params = {
      "filter.type": "urn:entity:place",
      "signal.interests.entities": "18b098fd-3d84-4609-bff3-adf9a0b00e40",
      "filter.tags": "urn:tag:category:place:cafe",
      "filter.location.query": "New York",
      take: 8,
    };
    const res = guardParams("/v2/insights", params);
    expect(res["filter.tags"]).toBe("urn:tag:category:place:cafe");
  });

  it("passes allowed heatmap and demographics requests", () => {
    const heatParams = {
      "filter.type": "urn:heatmap",
      "signal.interests.entities": "18b098fd-3d84-4609-bff3-adf9a0b00e40",
      "filter.location.query": "New York",
    };
    expect(guardParams("/v2/insights", heatParams)["filter.type"]).toBe("urn:heatmap");

    const demoParams = {
      "filter.type": "urn:demographics",
      "signal.interests.entities": "18b098fd-3d84-4609-bff3-adf9a0b00e40",
      "filter.location.query": "New York",
    };
    expect(guardParams("/v2/insights", demoParams)["filter.type"]).toBe("urn:demographics");
  });

  it("passes allowed search and tags requests", () => {
    expect(guardParams("/search", { query: "Inception" }).query).toBe("Inception");
    expect(guardParams("/v2/tags", { "filter.query": "cafe", take: 5 })["filter.query"]).toBe("cafe");
  });

  it("throws UNKNOWN_PARAM for unknown keys", () => {
    expect(() =>
      guardParams("/search", { query: "Inception", extra: "foo" })
    ).toThrowError(expect.objectContaining({ guardCode: "UNKNOWN_PARAM" }));
  });

  it("throws MISSING_PARAM for missing required keys", () => {
    expect(() =>
      guardParams("/v2/insights", { "filter.type": "urn:entity:artist" })
    ).toThrowError(expect.objectContaining({ guardCode: "MISSING_PARAM" }));
  });

  it("throws UNSUPPORTED_TYPE for urn:entity:video_game or unknown types", () => {
    expect(() =>
      guardParams("/v2/insights", {
        "filter.type": "urn:entity:video_game",
        "signal.interests.entities": "18b098fd-3d84-4609-bff3-adf9a0b00e40",
      })
    ).toThrowError(expect.objectContaining({ guardCode: "UNSUPPORTED_TYPE" }));
  });

  it("throws LOCATION_NOT_ALLOWED when location is passed to domain insights", () => {
    expect(() =>
      guardParams("/v2/insights", {
        "filter.type": "urn:entity:artist",
        "signal.interests.entities": "18b098fd-3d84-4609-bff3-adf9a0b00e40",
        "filter.location.query": "New York",
      })
    ).toThrowError(expect.objectContaining({ guardCode: "LOCATION_NOT_ALLOWED" }));
  });

  it("throws BAD_VALUE on comma-separated entity IDs", () => {
    expect(() =>
      guardParams("/v2/insights", {
        "filter.type": "urn:entity:artist",
        "signal.interests.entities": "id1,id2",
      })
    ).toThrowError(expect.objectContaining({ guardCode: "BAD_VALUE" }));
  });

  it("throws BAD_VALUE for invalid take values (0, 51, 1.5)", () => {
    const base = {
      "filter.type": "urn:entity:artist",
      "signal.interests.entities": "18b098fd-3d84-4609-bff3-adf9a0b00e40",
    };
    expect(() => guardParams("/v2/insights", { ...base, take: 0 })).toThrowError(
      expect.objectContaining({ guardCode: "BAD_VALUE" })
    );
    expect(() => guardParams("/v2/insights", { ...base, take: 51 })).toThrowError(
      expect.objectContaining({ guardCode: "BAD_VALUE" })
    );
    expect(() => guardParams("/v2/insights", { ...base, take: 1.5 })).toThrowError(
      expect.objectContaining({ guardCode: "BAD_VALUE" })
    );
  });

  it("throws BAD_VALUE for a tag not starting with urn:tag:", () => {
    expect(() =>
      guardParams("/v2/insights", {
        "filter.type": "urn:entity:place",
        "signal.interests.entities": "18b098fd-3d84-4609-bff3-adf9a0b00e40",
        "filter.tags": "not_a_urn",
        "filter.location.query": "New York",
      })
    ).toThrowError(expect.objectContaining({ guardCode: "BAD_VALUE" }));
  });
});
