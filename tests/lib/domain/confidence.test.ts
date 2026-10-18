import { describe, it, expect } from "vitest";
import { computeConfidence } from "@/lib/domain/confidence";

describe("computeConfidence", () => {
  it("matches test vector: exact, 5, yes, yes, yes -> score 12, high", () => {
    const res = computeConfidence({
      resolution: "exact",
      coreDomainsWithData: 5,
      geographyOk: true,
      demographicsOk: true,
      anyPartners: true,
      qlooCallCount: 7,
    });
    expect(res.score).toBe(12);
    expect(res.level).toBe("high");
    expect(res.reasons).toEqual(["Based on 7 Qloo calls."]);
  });

  it("matches test vector: exact, 5, yes, no, no -> score 10, high", () => {
    const res = computeConfidence({
      resolution: "exact",
      coreDomainsWithData: 5,
      geographyOk: true,
      demographicsOk: false,
      anyPartners: false,
      qlooCallCount: 5,
    });
    expect(res.score).toBe(10);
    expect(res.level).toBe("high");
    expect(res.reasons).toEqual([
      "Audience age and gender data was unavailable.",
      "No partner venues were found.",
      "Based on 5 Qloo calls.",
    ]);
  });

  it("matches test vector: exact, 4, no, yes, yes -> score 9, medium", () => {
    const res = computeConfidence({
      resolution: "exact",
      coreDomainsWithData: 4,
      geographyOk: false,
      demographicsOk: true,
      anyPartners: true,
      qlooCallCount: 6,
    });
    expect(res.score).toBe(9);
    expect(res.level).toBe("medium");
    expect(res.reasons).toEqual([
      "Only 4 of 5 core taste areas returned enough results.",
      "No high-affinity areas were found near the theater.",
      "Based on 6 Qloo calls.",
    ]);
  });

  it("matches test vector: exact, 3, yes, yes, no -> score 9, medium", () => {
    const res = computeConfidence({
      resolution: "exact",
      coreDomainsWithData: 3,
      geographyOk: true,
      demographicsOk: true,
      anyPartners: false,
      qlooCallCount: 6,
    });
    expect(res.score).toBe(9);
    expect(res.level).toBe("medium");
    expect(res.reasons).toEqual([
      "Only 3 of 5 core taste areas returned enough results.",
      "No partner venues were found.",
      "Based on 6 Qloo calls.",
    ]);
  });

  it("matches test vector: alternate, 2, no, no, yes -> score 4, low", () => {
    const res = computeConfidence({
      resolution: "alternate",
      coreDomainsWithData: 2,
      geographyOk: false,
      demographicsOk: false,
      anyPartners: true,
      qlooCallCount: 4,
    });
    expect(res.score).toBe(4);
    expect(res.level).toBe("low");
    expect(res.reasons).toEqual([
      "The film was matched approximately, so check the title.",
      "Only 2 of 5 core taste areas returned enough results.",
      "No high-affinity areas were found near the theater.",
      "Audience age and gender data was unavailable.",
      "Based on 4 Qloo calls.",
    ]);
  });

  it("matches test vector: alternate, 0, no, no, no -> score 1, low", () => {
    const res = computeConfidence({
      resolution: "alternate",
      coreDomainsWithData: 0,
      geographyOk: false,
      demographicsOk: false,
      anyPartners: false,
      qlooCallCount: 2,
    });
    expect(res.score).toBe(1);
    expect(res.level).toBe("low");
    expect(res.reasons).toEqual([
      "The film was matched approximately, so check the title.",
      "Only 0 of 5 core taste areas returned enough results.",
      "No high-affinity areas were found near the theater.",
      "Audience age and gender data was unavailable.",
      "No partner venues were found.",
      "Based on 2 Qloo calls.",
    ]);
  });
});
