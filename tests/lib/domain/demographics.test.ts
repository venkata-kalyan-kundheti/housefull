import { describe, it, expect } from "vitest";
import { describeSkew } from "@/lib/domain/demographics";
import type { DemographicsSkew } from "@/lib/qloo/types";

describe("lib/domain/demographics.ts (Section 9.4)", () => {
  it("returns fallback line when all values are below 0.15", () => {
    const d: DemographicsSkew = {
      age: {
        "24_and_younger": 0.05,
        "25_to_29": -0.04,
        "30_to_34": 0.12,
        "35_to_44": -0.08,
        "45_to_54": 0.01,
        "55_and_older": -0.14,
      },
      gender: { male: 0.1, female: -0.1 },
    };

    const lines = describeSkew(d);
    expect(lines).toEqual(["No strong age or gender skew for this film in this area."]);
  });

  it("describes strong male skew (+0.78) as 'skews strongly toward men'", () => {
    const d: DemographicsSkew = {
      age: {
        "24_and_younger": 0.0,
        "25_to_29": 0.0,
        "30_to_34": 0.0,
        "35_to_44": 0.0,
        "45_to_54": 0.0,
        "55_and_older": 0.0,
      },
      gender: { male: 0.78, female: -0.78 },
    };

    const lines = describeSkew(d);
    expect(lines).toContain("skews strongly toward men");
  });

  it("describes negative male value (-0.30) as 'leans toward women'", () => {
    const d: DemographicsSkew = {
      age: {
        "24_and_younger": 0.0,
        "25_to_29": 0.0,
        "30_to_34": 0.0,
        "35_to_44": 0.0,
        "45_to_54": 0.0,
        "55_and_older": 0.0,
      },
      gender: { male: -0.3, female: 0.3 },
    };

    const lines = describeSkew(d);
    expect(lines).toContain("leans toward women");
  });

  it("breaks ties between age bands by picking the first in the age order", () => {
    const d: DemographicsSkew = {
      age: {
        "24_and_younger": 0.45,
        "25_to_29": 0.45, // Tie with 24_and_younger
        "30_to_34": -0.45,
        "35_to_44": -0.45, // Tie with 30_to_34
        "45_to_54": 0.0,
        "55_and_older": 0.0,
      },
      gender: { male: 0.0, female: 0.0 },
    };

    const lines = describeSkew(d);
    // Picks 24_and_younger for positive, 30_to_34 for negative
    expect(lines).toContain("skews strongly toward ages 24 and younger");
    expect(lines).toContain("skews strongly away from ages 30 to 34");
  });
});
