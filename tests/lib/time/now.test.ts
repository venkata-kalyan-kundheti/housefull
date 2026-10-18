import { describe, it, expect, vi, beforeEach } from "vitest";
import { now, hoursUntil, formatLocal } from "@/lib/time/now";
import * as configModule from "@/lib/config";

describe("lib/time/now.ts (Section 9.9)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns DEMO_FIXED_NOW when set in config", () => {
    vi.spyOn(configModule, "getConfig").mockReturnValue({
      DEMO_FIXED_NOW: "2026-10-24T18:00:00.000Z",
    } as ReturnType<typeof configModule.getConfig>);

    const currentDate = now();
    expect(currentDate.toISOString()).toBe("2026-10-24T18:00:00.000Z");
  });

  it("returns system time when DEMO_FIXED_NOW is unset", () => {
    vi.spyOn(configModule, "getConfig").mockReturnValue({
      DEMO_FIXED_NOW: undefined,
    } as unknown as ReturnType<typeof configModule.getConfig>);

    const before = Date.now();
    const currentDate = now();
    const after = Date.now();

    expect(currentDate.getTime()).toBeGreaterThanOrEqual(before);
    expect(currentDate.getTime()).toBeLessThanOrEqual(after);
  });

  it("hoursUntil calculates floating hours correctly", () => {
    const baseTime = new Date("2026-10-24T12:00:00.000Z");
    const showTime = "2026-10-24T15:30:00.000Z";

    const diff = hoursUntil(showTime, baseTime);
    expect(diff).toBeCloseTo(3.5, 5);
  });

  it("hoursUntil throws RangeError on invalid date string", () => {
    expect(() => hoursUntil("not-a-valid-date")).toThrow(RangeError);
  });

  it("formatLocal formats according to en-GB and timeZone", () => {
    const iso = "2026-10-24T18:30:00.000Z";
    // In UTC, this is Sat 24 Oct, 6:30 pm
    const formattedUtc = formatLocal(iso, "UTC");
    expect(formattedUtc).toBe("Sat 24 Oct, 6:30 pm");

    // In America/New_York (UTC-4 in Oct daylight savings), 18:30Z is 14:30 (2:30 pm)
    const formattedNyc = formatLocal(iso, "America/New_York");
    expect(formattedNyc).toBe("Sat 24 Oct, 2:30 pm");
  });

  it("formatLocal falls back to UTC on invalid time zone", () => {
    const iso = "2026-10-24T18:30:00.000Z";
    const formattedFallback = formatLocal(iso, "NonExistent/Zone");
    expect(formattedFallback).toBe("Sat 24 Oct, 6:30 pm");
  });

  it("formatLocal throws RangeError on invalid date string", () => {
    expect(() => formatLocal("invalid-date", "UTC")).toThrow(RangeError);
  });
});
