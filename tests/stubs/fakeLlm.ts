import type { GenerateJsonArgs, LlmClient, LlmResult, LlmPurpose } from "@/lib/llm/types";
import { AppError, LlmError } from "@/lib/errors";

export interface FakeLlmResponseQueueItem {
  purpose?: LlmPurpose;
  result: unknown; // data or error
  isError?: boolean;
}

export class FakeLlm implements LlmClient {
  public callHistory: Array<GenerateJsonArgs<unknown>> = [];
  private readonly queue: FakeLlmResponseQueueItem[] = [];
  private handlers = new Map<LlmPurpose, (args: GenerateJsonArgs<unknown>) => unknown>();

  enqueue(item: FakeLlmResponseQueueItem): this {
    this.queue.push(item);
    return this;
  }

  setHandler(purpose: LlmPurpose, handler: (args: GenerateJsonArgs<unknown>) => unknown): this {
    this.handlers.set(purpose, handler);
    return this;
  }

  async generateJson<T>(args: GenerateJsonArgs<T>): Promise<LlmResult<T>> {
    this.callHistory.push(args as GenerateJsonArgs<unknown>);

    const nextIdx = this.queue.findIndex((q) => !q.purpose || q.purpose === args.purpose);
    if (nextIdx !== -1) {
      const item = this.queue.splice(nextIdx, 1)[0]!;
      if (item.isError) {
        return {
          ok: false,
          error:
            item.result instanceof AppError
              ? item.result
              : new LlmError("LLM_INVALID_OUTPUT", String(item.result)),
          latencyMs: 10,
        };
      }
      return {
        ok: true,
        data: item.result as T,
        latencyMs: 10,
      };
    }

    const handler = this.handlers.get(args.purpose);
    if (handler) {
      const res = handler(args as GenerateJsonArgs<unknown>);
      return {
        ok: true,
        data: res as T,
        latencyMs: 10,
      };
    }

    throw new Error(`FakeLlm: No response queued or handler found for purpose "${args.purpose}"`);
  }
}
