/**
 * lib/llm/gemini.ts
 *
 * Gemini LLM adapter conforming to Section 11.2.
 */

import { GoogleGenAI } from "@google/genai";
import { getConfig } from "@/lib/config";
import { LlmError } from "@/lib/errors";
import { log } from "@/lib/log";
import type { GenerateJsonArgs, LlmClient, LlmResult, LlmPurpose } from "./types";

export const DEFAULT_MAX_TOKENS: Record<LlmPurpose, number> = {
  planner: 300,
  channels: 900,
  copy: 1200,
  summary: 400,
};

export const LLM_TEMPERATURE = 0.2;
export const LLM_TIMEOUT_MS = 20_000;

export function stripCodeFence(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  return cleaned.trim();
}

/**
 * Semaphore to limit concurrent LLM requests to 3.
 */
class Semaphore {
  private current = 0;
  private queue: (() => void)[] = [];

  constructor(private readonly max: number) {}

  async acquire(): Promise<void> {
    if (this.current < this.max) {
      this.current++;
      return;
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
    this.current++;
  }

  release(): void {
    this.current--;
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }
}

const llmSemaphore = new Semaphore(3);

export interface RawLlmResponse {
  text: string;
  status?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export type RawLlmCaller = (params: {
  model: string;
  system: string;
  user: string;
  temperature: number;
  maxOutputTokens: number;
  timeoutMs: number;
  signal?: AbortSignal;
}) => Promise<RawLlmResponse>;

export interface GeminiClientOptions {
  caller?: RawLlmCaller;
  model?: string;
  retryDelayMs?: number; // Overridable in tests (default 2000)
}

export class GeminiLlmClient implements LlmClient {
  private readonly caller: RawLlmCaller;
  private readonly retryDelayMs: number;
  private readonly model?: string;

  constructor(options?: GeminiClientOptions) {
    this.retryDelayMs = options?.retryDelayMs ?? 2000;
    this.model = options?.model ?? (options?.caller ? "test-model" : undefined);

    if (options?.caller) {
      this.caller = options.caller;
    } else {
      this.caller = async ({
        model,
        system,
        user,
        temperature,
        maxOutputTokens,
        timeoutMs,
      }) => {
        const config = getConfig();
        const ai = new GoogleGenAI({ apiKey: config.LLM_API_KEY });

        const abortController = new AbortController();
        const timer = setTimeout(() => {
          abortController.abort(new Error("LLM request timed out"));
        }, timeoutMs);

        try {
          const response = await ai.models.generateContent({
            model,
            contents: user,
            config: {
              systemInstruction: system,
              temperature,
              maxOutputTokens,
              responseMimeType: "application/json",
            },
          });

          return {
            text: response.text ?? "",
            inputTokens: response.usageMetadata?.promptTokenCount,
            outputTokens: response.usageMetadata?.candidatesTokenCount,
          };
        } finally {
          clearTimeout(timer);
        }
      };
    }
  }

  async generateJson<T>(args: GenerateJsonArgs<T>): Promise<LlmResult<T>> {
    const startTime = Date.now();
    await llmSemaphore.acquire();

    try {
      const model = this.model ?? getConfig().LLM_MODEL;
      const timeoutMs = args.timeoutMs || LLM_TIMEOUT_MS;
      const maxOutputTokens =
        args.maxOutputTokens || DEFAULT_MAX_TOKENS[args.purpose];

      let currentUserPrompt = args.user;
      let lastError: LlmError | null = null;

      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const raw = await this.caller({
            model,
            system: args.system,
            user: currentUserPrompt,
            temperature: LLM_TEMPERATURE,
            maxOutputTokens,
            timeoutMs,
          });

          const stripped = stripCodeFence(raw.text);

          let parsedJson: unknown;
          try {
            parsedJson = JSON.parse(stripped);
          } catch (jsonErr: unknown) {
            const msg = jsonErr instanceof Error ? jsonErr.message : "Invalid JSON";
            lastError = new LlmError("LLM_INVALID_OUTPUT", `Failed to parse JSON: ${msg}`);
            if (attempt === 1) {
              currentUserPrompt = `${args.user}\n\nYour previous answer was invalid: Invalid JSON format. Return only valid JSON matching the schema.`;
              continue;
            }
            break;
          }

          const schemaResult = args.schema.safeParse(parsedJson);
          if (!schemaResult.success) {
            const shortIssue = schemaResult.error.issues[0]?.message ?? "Schema mismatch";
            lastError = new LlmError(
              "LLM_INVALID_OUTPUT",
              `Schema validation failed: ${shortIssue}`,
              schemaResult.error.issues
            );
            if (attempt === 1) {
              currentUserPrompt = `${args.user}\n\nYour previous answer was invalid: ${shortIssue.slice(0, 80)}. Return only valid JSON matching the schema.`;
              continue;
            }
            break;
          }

          return {
            ok: true,
            data: schemaResult.data,
            latencyMs: Date.now() - startTime,
            usage: {
              inputTokens: raw.inputTokens,
              outputTokens: raw.outputTokens,
            },
          };
        } catch (err: unknown) {
          const isTimeout =
            (err instanceof Error && err.name === "AbortError") ||
            (err instanceof Error && err.message.toLowerCase().includes("timed out"));

          const is429 =
            (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 429) ||
            (err instanceof Error && err.message.includes("429"));

          const is5xx =
            err && typeof err === "object" && "status" in err &&
            typeof (err as { status: number }).status === "number" &&
            (err as { status: number }).status >= 500 &&
            (err as { status: number }).status < 600;

          if (isTimeout) {
            lastError = new LlmError("LLM_TIMEOUT", "LLM call timed out after retry");
          } else if (is429) {
            lastError = new LlmError("LLM_RATE_LIMIT", "429 rate limited by LLM API");
            if (attempt === 1 && this.retryDelayMs > 0) {
              await new Promise((r) => setTimeout(r, this.retryDelayMs));
            }
          } else if (is5xx) {
            lastError = new LlmError("LLM_UNAVAILABLE", "5xx from LLM API");
          } else {
            const message = err instanceof Error ? err.message : "Network error";
            lastError = new LlmError("LLM_UNAVAILABLE", `LLM communication error: ${message}`);
          }

          if (attempt === 1) {
            log.warn("LLM attempt 1 failed. Retrying.", {
              purpose: args.purpose,
              error: lastError.message,
            });
            continue;
          }
        }
      }

      return {
        ok: false,
        error: lastError ?? new LlmError("LLM_INVALID_OUTPUT", "Unknown LLM error"),
        latencyMs: Date.now() - startTime,
      };
    } finally {
      llmSemaphore.release();
    }
  }
}
