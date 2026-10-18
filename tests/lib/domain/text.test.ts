import { describe, it, expect } from "vitest";
import { normalizeTitle, truncate } from "@/lib/domain/text";

describe("lib/domain/text.ts (Section 9.1)", () => {
  it("normalizes film titles matching Section 9.1 test cases", () => {
    expect(normalizeTitle("Inception")).toBe("inception");
    expect(normalizeTitle("The Dark Knight")).toBe("dark knight");
    expect(normalizeTitle("Amélie")).toBe("amelie");
    expect(normalizeTitle("RRR!!!")).toBe("rrr");
    expect(normalizeTitle("  Past   Lives ")).toBe("past lives");
    expect(normalizeTitle("")).toBe("");
  });

  it("truncates with ellipsis when length exceeds limit", () => {
    expect(truncate("Short", 10)).toBe("Short");
    expect(truncate("A longer sentence here", 10)).toBe("A longer…");
  });
});
