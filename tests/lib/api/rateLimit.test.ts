import { describe, it, expect } from "vitest";
import { checkRateLimit } from "@/lib/api/rateLimit";

describe("lib/api/rateLimit.ts (Section 14.1)", () => {
  it("allows requests under the limit and tracks limits", () => {
    const testIp = `192.168.1.${Math.floor(Math.random() * 1000)}`;

    // First request should be allowed
    const first = checkRateLimit(testIp, "general");
    expect(first.allowed).toBe(true);
    expect(first.retryAfterSeconds).toBe(0);
  });

  it("blocks requests when limit is exceeded", () => {
    const testIp = `10.0.0.${Math.floor(Math.random() * 1000)}`;

    // Limit for briefs is 10 per hour
    for (let i = 0; i < 10; i++) {
      const res = checkRateLimit(testIp, "briefs");
      expect(res.allowed).toBe(true);
    }

    // 11th request should be blocked
    const blocked = checkRateLimit(testIp, "briefs");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });
});
