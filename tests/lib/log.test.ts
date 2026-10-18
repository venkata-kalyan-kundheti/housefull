import { describe, it, expect, vi, beforeEach } from "vitest";
import { log } from "@/lib/log";

describe("lib/log.ts (Structured Logger)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("logs warn and error without throwing and redacts secrets", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    log.warn("Test warning message", { secret: "12345" });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain("[WARN]");
    expect(warnSpy.mock.calls[0]?.[0]).toContain("Test warning message");

    const testError = new Error("Something broke");
    log.error("Fatal failure", testError, { context: "test" });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]?.[0]).toContain("[ERROR]");
    expect(errorSpy.mock.calls[0]?.[0]).toContain("Fatal failure");
    expect(errorSpy.mock.calls[0]?.[0]).toContain("Something broke");
  });
});
