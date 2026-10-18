import { describe, it, expect } from "vitest";
import {
  CLAIM_PATTERNS,
  EXCLUSION_PATTERNS,
  CONTACT_PATTERNS,
  checkClaimFilters,
} from "@/lib/validate/claimFilter";

describe("lib/validate/claimFilter.ts (Section 12.3)", () => {
  describe("CLAIM_PATTERNS", () => {
    it("matches 'sold-out' and ignores near-miss 'the sold show'", () => {
      expect(CLAIM_PATTERNS.some((p) => p.test("Tickets are sold-out"))).toBe(true);
      expect(CLAIM_PATTERNS.some((p) => p.test("Tickets are sold out"))).toBe(true);
      expect(CLAIM_PATTERNS.some((p) => p.test("The sold show had good reception"))).toBe(false);
    });

    it("matches 'will increase' and ignores near-miss 'will you join us'", () => {
      expect(CLAIM_PATTERNS.some((p) => p.test("This campaign will increase ticket sales"))).toBe(true);
      expect(CLAIM_PATTERNS.some((p) => p.test("Will you join us tonight?"))).toBe(false);
    });

    it("matches '25%' and ignores near-miss '25 people'", () => {
      expect(CLAIM_PATTERNS.some((p) => p.test("Save 25% on popcorn"))).toBe(true);
      expect(CLAIM_PATTERNS.some((p) => p.test("We expect 25 people to attend"))).toBe(false);
    });

    it("matches '100 percent' and ignores near-miss 'a hundred reasons'", () => {
      expect(CLAIM_PATTERNS.some((p) => p.test("Guaranteed 100 percent satisfaction"))).toBe(true);
      expect(CLAIM_PATTERNS.some((p) => p.test("There are a hundred reasons to love cinema"))).toBe(false);
    });

    it("matches 'guaranteed' and ignores 'guardians'", () => {
      expect(CLAIM_PATTERNS.some((p) => p.test("Success is guaranteed"))).toBe(true);
      expect(CLAIM_PATTERNS.some((p) => p.test("Guardians of the Galaxy"))).toBe(false);
    });

    it("matches 'more tickets' and ignores 'more time'", () => {
      expect(CLAIM_PATTERNS.some((p) => p.test("Sell more tickets today"))).toBe(true);
      expect(CLAIM_PATTERNS.some((p) => p.test("We need more time"))).toBe(false);
    });
  });

  describe("EXCLUSION_PATTERNS", () => {
    it("matches 'only for men' and ignores 'only one show'", () => {
      expect(EXCLUSION_PATTERNS.some((p) => p.test("This screening is only for men"))).toBe(true);
      expect(EXCLUSION_PATTERNS.some((p) => p.test("There is only one show tonight"))).toBe(false);
    });

    it("matches 'exclude seniors' and ignores 'exclusive screening'", () => {
      expect(EXCLUSION_PATTERNS.some((p) => p.test("We should exclude seniors from this ad"))).toBe(true);
      expect(EXCLUSION_PATTERNS.some((p) => p.test("Join our exclusive screening"))).toBe(false);
    });
  });

  describe("CONTACT_PATTERNS", () => {
    it("matches email, URL, and phone number, and ignores normal text", () => {
      expect(CONTACT_PATTERNS.some((p) => p.test("Contact us at info@theater.com"))).toBe(true);
      expect(CONTACT_PATTERNS.some((p) => p.test("Visit https://tickets.cinema.com"))).toBe(true);
      expect(CONTACT_PATTERNS.some((p) => p.test("Call +1 (555) 123-4567"))).toBe(true);
      expect(CONTACT_PATTERNS.some((p) => p.test("Tickets are available at the front counter."))).toBe(false);
    });
  });

  describe("checkClaimFilters helper", () => {
    it("returns violation matches with snippets", () => {
      const violations = checkClaimFilters("This guaranteed campaign will increase sales! Call 555-123-4567.");
      expect(violations.length).toBeGreaterThan(0);
      const rules = violations.map((v) => v.rule);
      expect(rules).toContain("V5");
      expect(rules).toContain("V10");
    });
  });
});
