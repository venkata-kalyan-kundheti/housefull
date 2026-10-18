/**
 * lib/config.ts
 *
 * Environment configuration parsing with zod, memoization, and secrets redaction.
 * As specified in Sections 5.4 and 5.5.
 */

import { z } from "zod";
import { ConfigError } from "./errors";

const configSchema = z
  .object({
    QLOO_API_KEY: z.string().optional(),
    QLOO_API_URL: z
      .string()
      .default("https://hackathon.api.qloo.com")
      .refine(
        (url) => {
          try {
            const parsed = new URL(url);
            return parsed.hostname === "hackathon.api.qloo.com";
          } catch {
            return false;
          }
        },
        {
          message: "QLOO_API_URL host must be exactly hackathon.api.qloo.com",
        }
      ),
    APP_MODE: z.enum(["live", "replay"]).default("live"),
    LLM_PROVIDER: z.literal("gemini").default("gemini"),
    LLM_API_KEY: z.string().min(1, "LLM_API_KEY is required"),
    LLM_MODEL: z.string().min(1, "LLM_MODEL is required"),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    DEMO_FIXED_NOW: z
      .string()
      .refine(
        (val) => {
          if (!val) return true;
          const parsed = Date.parse(val);
          return !Number.isNaN(parsed);
        },
        { message: "DEMO_FIXED_NOW must be a valid ISO-8601 instant" }
      )
      .optional(),
    QLOO_RPS: z
      .string()
      .optional()
      .transform((val) => (val ? Number.parseInt(val, 10) : 4))
      .refine((val) => val >= 1 && val <= 5, {
        message: "QLOO_RPS must be between 1 and 5",
      }),
    QLOO_BUDGET_PER_BRIEF: z
      .string()
      .optional()
      .transform((val) => (val ? Number.parseInt(val, 10) : 16))
      .refine((val) => val >= 8 && val <= 30, {
        message: "QLOO_BUDGET_PER_BRIEF must be between 8 and 30",
      }),
    QLOO_CACHE_TTL_HOURS: z
      .string()
      .optional()
      .transform((val) => (val ? Number.parseInt(val, 10) : 168)),
    CATCHMENT_RADIUS_KM: z
      .string()
      .optional()
      .transform((val) => (val ? Number.parseFloat(val) : 15))
      .refine((val) => val >= 2 && val <= 50, {
        message: "CATCHMENT_RADIUS_KM must be between 2 and 50",
      }),
    ADMIN_TOKEN: z.string().optional(),
    QLOO_DEBUG_RAW: z
      .string()
      .optional()
      .transform((val) => val === "true"),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    NODE_ENV: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.APP_MODE === "live" && (!data.QLOO_API_KEY || data.QLOO_API_KEY.trim() === "")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["QLOO_API_KEY"],
        message: "QLOO_API_KEY is required when APP_MODE is live",
      });
    }
  });

export type AppConfig = {
  QLOO_API_KEY?: string;
  QLOO_API_URL: string;
  APP_MODE: "live" | "replay";
  LLM_PROVIDER: "gemini";
  LLM_API_KEY: string;
  LLM_MODEL: string;
  DATABASE_URL: string;
  DEMO_FIXED_NOW?: string;
  QLOO_RPS: number;
  QLOO_BUDGET_PER_BRIEF: number;
  QLOO_CACHE_TTL_HOURS: number;
  CATCHMENT_RADIUS_KM: number;
  ADMIN_TOKEN?: string;
  QLOO_DEBUG_RAW: boolean;
  LOG_LEVEL: "debug" | "info" | "warn" | "error";
  NODE_ENV?: string;
};

export function createConfig(env: Record<string, string | undefined>): AppConfig {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    // List only the names of invalid variables, NEVER their values
    const invalidFields = Array.from(
      new Set(result.error.issues.map((issue) => issue.path.join(".") || "configuration"))
    );
    throw new ConfigError(
      `Invalid or missing environment variables: ${invalidFields.join(", ")}`
    );
  }

  const parsed = result.data;
  // Section 5.4: QLOO_DEBUG_RAW must be ignored (forced false) when NODE_ENV=production
  const isProduction = parsed.NODE_ENV === "production" || env.NODE_ENV === "production";
  const debugRaw = isProduction ? false : parsed.QLOO_DEBUG_RAW;

  return {
    QLOO_API_KEY: parsed.QLOO_API_KEY,
    QLOO_API_URL: parsed.QLOO_API_URL,
    APP_MODE: parsed.APP_MODE,
    LLM_PROVIDER: parsed.LLM_PROVIDER,
    LLM_API_KEY: parsed.LLM_API_KEY,
    LLM_MODEL: parsed.LLM_MODEL,
    DATABASE_URL: parsed.DATABASE_URL,
    DEMO_FIXED_NOW: parsed.DEMO_FIXED_NOW,
    QLOO_RPS: parsed.QLOO_RPS,
    QLOO_BUDGET_PER_BRIEF: parsed.QLOO_BUDGET_PER_BRIEF,
    QLOO_CACHE_TTL_HOURS: parsed.QLOO_CACHE_TTL_HOURS,
    CATCHMENT_RADIUS_KM: parsed.CATCHMENT_RADIUS_KM,
    ADMIN_TOKEN: parsed.ADMIN_TOKEN,
    QLOO_DEBUG_RAW: debugRaw,
    LOG_LEVEL: parsed.LOG_LEVEL,
    NODE_ENV: parsed.NODE_ENV,
  };
}

let memoizedConfig: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!memoizedConfig) {
    memoizedConfig = createConfig(process.env);
  }
  return memoizedConfig;
}

/**
 * Resets memoized config - for testing only.
 */
export function resetConfigForTest(): void {
  memoizedConfig = null;
}

/**
 * Redacts QLOO_API_KEY, LLM_API_KEY, and ADMIN_TOKEN from text.
 * Every logger, error formatter, and event emitter must call it.
 */
export function redactSecrets(text: string, customConfig?: AppConfig): string {
  if (!text) return text;
  let cfg: AppConfig | null = customConfig ?? null;
  if (!cfg) {
    try {
      cfg = getConfig();
    } catch {
      // If config cannot be loaded, still check process.env safely
      cfg = null;
    }
  }

  const secretsToRedact: string[] = [];

  if (cfg) {
    if (cfg.QLOO_API_KEY) secretsToRedact.push(cfg.QLOO_API_KEY);
    if (cfg.LLM_API_KEY) secretsToRedact.push(cfg.LLM_API_KEY);
    if (cfg.ADMIN_TOKEN) secretsToRedact.push(cfg.ADMIN_TOKEN);
  } else {
    if (process.env.QLOO_API_KEY) secretsToRedact.push(process.env.QLOO_API_KEY);
    if (process.env.LLM_API_KEY) secretsToRedact.push(process.env.LLM_API_KEY);
    if (process.env.ADMIN_TOKEN) secretsToRedact.push(process.env.ADMIN_TOKEN);
  }

  let redacted = text;
  for (const secret of secretsToRedact) {
    if (secret && secret.length >= 3) {
      redacted = redacted.split(secret).join("[REDACTED]");
    }
  }

  return redacted;
}
