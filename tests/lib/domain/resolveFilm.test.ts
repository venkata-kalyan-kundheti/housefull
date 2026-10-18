import { describe, it, expect } from "vitest";
import { resolveFilm } from "@/lib/domain/resolveFilm";
import type { CompactSearchResult } from "@/lib/qloo/types";

describe("lib/domain/resolveFilm.ts (Section 9.1)", () => {
  it("returns unresolved for empty results", () => {
    const res = resolveFilm({ title: "Inception" }, []);
    expect(res.resolution).toBe("unresolved");
    expect(res.alternates).toHaveLength(0);
  });

  it("exact match beats sequels like 'X: Part Two'", () => {
    const results: CompactSearchResult[] = [
      {
        entityId: "1",
        name: "Dune: Part Two",
        types: ["urn:entity:movie"],
        popularity: 0.99,
        disambiguation: "2024 sequel",
      },
      {
        entityId: "2",
        name: "Dune",
        types: ["urn:entity:movie"],
        popularity: 0.85,
        disambiguation: "2021 film",
      },
    ];

    const res = resolveFilm({ title: "Dune" }, results);
    expect(res.resolution).toBe("exact");
    if (res.resolution === "exact") {
      expect(res.chosen.name).toBe("Dune");
      expect(res.chosen.entityId).toBe("2");
      expect(res.alternates).toHaveLength(1);
      expect(res.alternates[0]?.name).toBe("Dune: Part Two");
    }
  });

  it("resolves to the more popular candidate when two exact matches exist and emits warning", () => {
    const results: CompactSearchResult[] = [
      {
        entityId: "1",
        name: "The Avengers",
        types: ["urn:entity:movie"],
        popularity: 0.3,
        disambiguation: "1998 film",
      },
      {
        entityId: "2",
        name: "The Avengers",
        types: ["urn:entity:movie"],
        popularity: 0.95,
        disambiguation: "2012 MCU film",
      },
    ];

    const res = resolveFilm({ title: "The Avengers" }, results);
    expect(res.resolution).toBe("exact");
    if (res.resolution === "exact") {
      expect(res.chosen.entityId).toBe("2");
      expect(res.warnings).toContain("multiple_exact_matches");
    }
  });

  it("breaks ties using the year bonus", () => {
    const results: CompactSearchResult[] = [
      {
        entityId: "1",
        name: "Pinocchio",
        types: ["urn:entity:movie"],
        popularity: 0.8,
        disambiguation: "2022 Guillermo del Toro film",
      },
      {
        entityId: "2",
        name: "Pinocchio",
        types: ["urn:entity:movie"],
        popularity: 0.8,
        disambiguation: "1940 animated film",
      },
    ];

    const res = resolveFilm({ title: "Pinocchio", year: 1940 }, results);
    expect(res.resolution).toBe("exact");
    if (res.resolution === "exact") {
      expect(res.chosen.entityId).toBe("2");
    }
  });

  it("uses fallback candidates and emits type_unverified when no :movie type is present", () => {
    const results: CompactSearchResult[] = [
      {
        entityId: "1",
        name: "Past Lives",
        types: [], // Missing movie type
        popularity: 0.9,
        disambiguation: null,
      },
    ];

    const res = resolveFilm({ title: "Past Lives" }, results);
    expect(res.resolution).toBe("exact");
    expect(res.warnings).toContain("type_unverified");
  });
});
