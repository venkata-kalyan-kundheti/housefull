import { describe, it, expect } from "vitest";
import { shouldReportMissingDomain } from "@/lib/domain/limitations";

describe("shouldReportMissingDomain (README Section 26.1)", () => {
  it("reports a core domain with zero items", () => {
    expect(shouldReportMissingDomain("artist", true, 0)).toBe(true);
  });

  it("does not report a core domain that has items", () => {
    expect(shouldReportMissingDomain("brand", true, 4)).toBe(false);
  });

  it("reports any domain whose call failed", () => {
    expect(shouldReportMissingDomain("movie", false, 0)).toBe(true);
    expect(shouldReportMissingDomain("book", false, 0)).toBe(true);
    expect(shouldReportMissingDomain("podcast", false, 0)).toBe(true);
  });

  it("does not report an optional domain that was merely empty", () => {
    expect(shouldReportMissingDomain("book", true, 0)).toBe(false);
    expect(shouldReportMissingDomain("podcast", true, 0)).toBe(false);
  });
});
