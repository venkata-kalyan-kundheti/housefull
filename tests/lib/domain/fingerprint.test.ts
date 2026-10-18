import { describe, it, expect } from "vitest";
import { buildFingerprint } from "@/lib/domain/fingerprint";
import type { CompactEntity } from "@/lib/qloo/types";

describe("lib/domain/fingerprint.ts (Section 9.3)", () => {
  const makeEntity = (id: string, name: string, affinity: number | null): CompactEntity => ({
    entityId: id,
    name,
    type: "urn:entity:artist",
    subtype: null,
    popularity: 0.8,
    affinity,
    tags: [{ id: "tag1", name: "Synthwave" }],
    blurb: "Blurb text",
    descriptors: ["energetic"],
  });

  it("checks strong/not-strong threshold boundary (mean 0.75 is strong, 0.7499 is not)", () => {
    const strongEntities = [
      makeEntity("1", "A", 0.75),
      makeEntity("2", "B", 0.75),
      makeEntity("3", "C", 0.75),
    ];
    const strongFp = buildFingerprint({
      domain: "artist",
      entities: strongEntities,
      callId: "call_01",
    });
    expect(strongFp.strong).toBe(true);

    const weakEntities = [
      makeEntity("1", "A", 0.7499),
      makeEntity("2", "B", 0.7499),
      makeEntity("3", "C", 0.7499),
    ];
    const weakFp = buildFingerprint({
      domain: "artist",
      entities: weakEntities,
      callId: "call_01",
    });
    expect(weakFp.strong).toBe(false);
  });

  it("marks fewer than 3 items as not strong", () => {
    const fewEntities = [makeEntity("1", "A", 0.99), makeEntity("2", "B", 0.99)];
    const fp = buildFingerprint({
      domain: "artist",
      entities: fewEntities,
      callId: "call_01",
    });
    expect(fp.strong).toBe(false);
  });

  it("falls back why text when affinity is null", () => {
    const nullEntities = [makeEntity("1", "A", null), makeEntity("2", "B", null)];
    const fp = buildFingerprint({
      domain: "artist",
      entities: nullEntities,
      callId: "call_01",
    });
    expect(fp.items[0]?.why).toContain("Related to this film");
  });

  it("hides optional domains (book, podcast) when not strong", () => {
    const weakEntities = [
      makeEntity("1", "Book 1", 0.6),
      makeEntity("2", "Book 2", 0.6),
      makeEntity("3", "Book 3", 0.6),
    ];
    const bookFp = buildFingerprint({
      domain: "book",
      entities: weakEntities,
      callId: "call_02",
    });
    expect(bookFp.strong).toBe(false);
    expect(bookFp.displayed).toBe(false);
  });

  it("hides core domain when entities list is empty", () => {
    const emptyFp = buildFingerprint({
      domain: "artist",
      entities: [],
      callId: "call_03",
    });
    expect(emptyFp.displayed).toBe(false);
  });
});
