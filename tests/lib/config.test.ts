import { describe, it, expect } from "vitest";
import { createConfig, redactSecrets } from "@/lib/config";
import { ConfigError } from "@/lib/errors";

describe("lib/config.ts (Sections 5.4, 5.5)", () => {
  const baseValidEnv = {
    QLOO_API_KEY: "secret-qloo-key-12345",
    QLOO_API_URL: "https://hackathon.api.qloo.com",
    APP_MODE: "live",
    LLM_PROVIDER: "gemini",
    LLM_API_KEY: "secret-llm-key-98765",
    LLM_MODEL: "gemini-2.5-flash",
    DATABASE_URL: "postgresql://user:pass@ep-cool-db.us-east-2.aws.neon.tech/neondb",
    ADMIN_TOKEN: "admin-secret-token",
  };

  it("parses valid configuration with defaults", () => {
    const config = createConfig(baseValidEnv);
    expect(config.APP_MODE).toBe("live");
    expect(config.QLOO_RPS).toBe(4);
    expect(config.QLOO_BUDGET_PER_BRIEF).toBe(16);
    expect(config.CATCHMENT_RADIUS_KM).toBe(15);
    expect(config.QLOO_DEBUG_RAW).toBe(false);
    expect(config.LOG_LEVEL).toBe("info");
  });

  it("throws ConfigError with variable names only when required variables are missing", () => {
    try {
      createConfig({});
      expect.fail("Should have thrown ConfigError");
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      const msg = (err as ConfigError).message;
      expect(msg).toContain("Invalid or missing environment variables");
      expect(msg).toContain("LLM_API_KEY");
      expect(msg).toContain("DATABASE_URL");
      // Must not leak any sensitive contents
      expect(msg).not.toContain("secret");
    }
  });

  it("fails validation if QLOO_API_URL host is not hackathon.api.qloo.com", () => {
    expect(() =>
      createConfig({
        ...baseValidEnv,
        QLOO_API_URL: "https://api.qloo.com",
      })
    ).toThrow(ConfigError);
  });

  it("requires QLOO_API_KEY in live mode but allows omitting in replay mode", () => {
    const replayEnv = {
      ...baseValidEnv,
      QLOO_API_KEY: undefined,
      APP_MODE: "replay",
    };
    const config = createConfig(replayEnv);
    expect(config.APP_MODE).toBe("replay");
    expect(config.QLOO_API_KEY).toBeUndefined();

    // In live mode without key, it must throw
    const liveMissingKey = {
      ...baseValidEnv,
      QLOO_API_KEY: undefined,
      APP_MODE: "live",
    };
    expect(() => createConfig(liveMissingKey)).toThrow(ConfigError);
  });

  it("forces QLOO_DEBUG_RAW to false in production", () => {
    const prodConfig = createConfig({
      ...baseValidEnv,
      QLOO_DEBUG_RAW: "true",
      NODE_ENV: "production",
    });
    expect(prodConfig.QLOO_DEBUG_RAW).toBe(false);

    const devConfig = createConfig({
      ...baseValidEnv,
      QLOO_DEBUG_RAW: "true",
      NODE_ENV: "development",
    });
    expect(devConfig.QLOO_DEBUG_RAW).toBe(true);
  });

  it("redactSecrets properly masks sensitive credentials", () => {
    const config = createConfig(baseValidEnv);
    const text = `Request with key secret-qloo-key-12345 and LLM secret-llm-key-98765 and Bearer admin-secret-token`;
    const redacted = redactSecrets(text, config);

    expect(redacted).not.toContain("secret-qloo-key-12345");
    expect(redacted).not.toContain("secret-llm-key-98765");
    expect(redacted).not.toContain("admin-secret-token");
    expect(redacted).toBe(
      "Request with key [REDACTED] and LLM [REDACTED] and Bearer [REDACTED]"
    );
  });
});
