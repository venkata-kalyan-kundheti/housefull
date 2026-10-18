import { describe, it, expect } from "vitest";
import {
  validateChannelsOutput,
  validateCopyOutput,
  validateSummaryOutput,
  checkLatinScript,
  checkCopyDigits,
} from "@/lib/validate/validator";
import { buildAllowedNames } from "@/lib/validate/knownNames";

describe("Validator rules (Section 12)", () => {
  const allowedNames = buildAllowedNames({
    filmTitle: "Inception",
    theaterName: "Grand Cinema",
    city: "New York",
    fingerprintNames: ["Stub Artist A", "Hans Zimmer", "Christopher Nolan"],
    channelTitles: ["Fans of these artists"],
    segmentLabels: ["Fans of Hans Zimmer"],
    allowedTokens: ["8:00 PM", "$10"],
  });

  describe("V2: Channel candidates and duplicates", () => {
    it("fails when channel id does not exist in candidates or is duplicated", () => {
      const output = {
        ranked: [
          { id: "ch_music", priority: 1, rationale: "Fans of Hans Zimmer might enjoy this film." },
          { id: "ch_music", priority: 2, rationale: "Duplicate channel rationale." },
        ],
        dropped: [
          { id: "ch_unknown", reason: "Unknown channel dropped." },
        ],
      };

      const issues = validateChannelsOutput(output, ["ch_music"], allowedNames);
      const v2Issues = issues.filter((i) => i.rule === "V2");
      expect(v2Issues.length).toBe(2); // One unknown, one duplicate
    });
  });

  describe("V3: Known-name set (Section 12.2)", () => {
    it("passes when mentioning 'Stub Artist A' or part of it 'Stub Artist'", () => {
      const rationale = "Fans of Stub Artist A will appreciate this showing on Friday.";
      const issues = validateSummaryOutput(rationale, allowedNames);
      const v3Issues = issues.filter((i) => i.rule === "V3");
      expect(v3Issues).toEqual([]);
    });

    it("passes for sentence-starting capital words and stopwords like Friday", () => {
      const text = "Great music awaits on Friday evening. Cinema lovers should attend.";
      const issues = validateSummaryOutput(text, allowedNames);
      const v3Issues = issues.filter((i) => i.rule === "V3");
      expect(v3Issues).toEqual([]);
    });

    it("fails when an unknown capitalized entity name is invented", () => {
      const text = "Fans of Leonardo DiCaprio and Taylor Swift should watch this show.";
      const issues = validateSummaryOutput(text, allowedNames);
      const v3Issues = issues.filter((i) => i.rule === "V3");
      expect(v3Issues.length).toBeGreaterThan(0);
      expect(v3Issues.some((i) => i.snippet?.includes("Taylor Swift"))).toBe(true);
    });
  });

  describe("V4: Digits rule (Section 12.4)", () => {
    it("allows digits matching allowedTokens exactly", () => {
      const variant = "Join us at 8:00 PM for Inception with tickets at $10.";
      expect(checkCopyDigits(variant, ["8:00 PM", "$10"])).toBe(true);
    });

    it("rejects forbidden digits not in allowedTokens", () => {
      const variant = "Join us at 8:00 PM for 50 percent off tickets.";
      expect(checkCopyDigits(variant, ["8:00 PM"])).toBe(false);
    });
  });

  describe("V7: Copy segment consistency and variant distinctness", () => {
    it("fails when segments do not match expected segments exactly", () => {
      const output = {
        segments: [
          {
            segmentId: "s_wrong",
            variants: [
              "Join us at 8:00 PM for Inception.",
              "Experience Inception tonight at 8:00 PM.",
              "A special screening of Inception at 8:00 PM.",
            ],
          },
        ],
      };

      const issues = validateCopyOutput(
        output,
        ["s_music"],
        allowedNames,
        ["8:00 PM"],
        "Inception",
        "8:00 PM"
      );

      expect(issues.some((i) => i.rule === "V7")).toBe(true);
    });

    it("fails when variants within a segment are not pairwise distinct", () => {
      const output = {
        segments: [
          {
            segmentId: "s_music",
            variants: [
              "Join us at 8:00 PM for Inception.",
              "join us at 8:00 PM for inception.", // duplicate case-insensitive
              "A special screening of Inception at 8:00 PM.",
            ],
          },
        ],
      };

      const issues = validateCopyOutput(
        output,
        ["s_music"],
        allowedNames,
        ["8:00 PM"],
        "Inception",
        "8:00 PM"
      );

      expect(issues.some((i) => i.rule === "V7")).toBe(true);
    });
  });

  describe("V11: Film title and showtime text warning", () => {
    it("warns when variant omits film title or showtime text", () => {
      const output = {
        segments: [
          {
            segmentId: "s_music",
            variants: [
              "Join us tonight for a great film.",
              "A special screening tonight.",
              "Great movies for film lovers.",
            ],
          },
        ],
      };

      const issues = validateCopyOutput(
        output,
        ["s_music"],
        allowedNames,
        [],
        "Inception",
        "8:00 PM"
      );

      const v11Issues = issues.filter((i) => i.rule === "V11");
      expect(v11Issues.length).toBeGreaterThan(0);
      expect(v11Issues[0]?.severity).toBe("warn");
    });
  });

  describe("V12: Latin script threshold", () => {
    it("passes text that is mostly English / Latin", () => {
      expect(checkLatinScript("This is standard English prose with Café.")).toBe(true);
    });

    it("rejects text where more than 20% of letters are non-Latin", () => {
      expect(checkLatinScript("Watch Inception: 素晴らしい映画です！")).toBe(false);
    });
  });
});
