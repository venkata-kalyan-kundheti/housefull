import type { ZodType } from "zod";
import type { AppError } from "@/lib/errors";

export type LlmPurpose = "planner" | "channels" | "copy" | "summary";

export interface GenerateJsonArgs<T> {
  purpose: LlmPurpose;
  system: string;
  user: string;
  schema: ZodType<T>;
  maxOutputTokens: number;
  timeoutMs: number;
}

export type LlmResult<T> =
  | {
      ok: true;
      data: T;
      latencyMs: number;
      usage?: { inputTokens?: number; outputTokens?: number };
    }
  | {
      ok: false;
      error: AppError;
      latencyMs: number;
    };

export interface LlmClient {
  generateJson<T>(args: GenerateJsonArgs<T>): Promise<LlmResult<T>>;
}
