import { describe, it, expect, vi } from "vitest";
import { GeminiLlmClient } from "@/lib/llm/gemini";
import { z } from "zod";

describe("GeminiLlmClient (Section 11.2)", () => {
  const testSchema = z.object({
    actions: z.array(z.string()),
  });

  it("case (a): handles valid JSON directly", async () => {
    const caller = vi.fn().mockResolvedValue({
      text: JSON.stringify({ actions: ["find_cafe"] }),
      inputTokens: 50,
      outputTokens: 20,
    });

    const client = new GeminiLlmClient({ caller, retryDelayMs: 0 });
    const res = await client.generateJson({
      purpose: "planner",
      system: "Sys",
      user: "User prompt",
      schema: testSchema,
      maxOutputTokens: 300,
      timeoutMs: 1000,
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toEqual({ actions: ["find_cafe"] });
      expect(res.usage?.inputTokens).toBe(50);
      expect(res.usage?.outputTokens).toBe(20);
    }
    expect(caller).toHaveBeenCalledTimes(1);
  });

  it("case (b): handles JSON wrapped in markdown code fence", async () => {
    const caller = vi.fn().mockResolvedValue({
      text: "```json\n" + JSON.stringify({ actions: ["find_bookstore"] }) + "\n```",
    });

    const client = new GeminiLlmClient({ caller, retryDelayMs: 0 });
    const res = await client.generateJson({
      purpose: "planner",
      system: "Sys",
      user: "User prompt",
      schema: testSchema,
      maxOutputTokens: 300,
      timeoutMs: 1000,
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toEqual({ actions: ["find_bookstore"] });
    }
  });

  it("case (c): retries on invalid JSON then succeeds on attempt 2", async () => {
    const caller = vi
      .fn()
      .mockResolvedValueOnce({ text: "Not valid JSON at all" })
      .mockResolvedValueOnce({ text: JSON.stringify({ actions: ["retry_worked"] }) });

    const client = new GeminiLlmClient({ caller, retryDelayMs: 0 });
    const res = await client.generateJson({
      purpose: "planner",
      system: "Sys",
      user: "Original user prompt",
      schema: testSchema,
      maxOutputTokens: 300,
      timeoutMs: 1000,
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toEqual({ actions: ["retry_worked"] });
    }
    expect(caller).toHaveBeenCalledTimes(2);
    // Verify attempt 2 included feedback
    const secondCallUser = caller.mock.calls[1]![0].user;
    expect(secondCallUser).toContain("Your previous answer was invalid");
  });

  it("case (d): fails soft with LLM_INVALID_OUTPUT when schema invalid twice", async () => {
    const caller = vi.fn().mockResolvedValue({
      text: JSON.stringify({ wrongField: 123 }),
    });

    const client = new GeminiLlmClient({ caller, retryDelayMs: 0 });
    const res = await client.generateJson({
      purpose: "planner",
      system: "Sys",
      user: "User prompt",
      schema: testSchema,
      maxOutputTokens: 300,
      timeoutMs: 1000,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("LLM_INVALID_OUTPUT");
    }
    expect(caller).toHaveBeenCalledTimes(2);
  });

  it("case (e): retries on HTTP 429 and succeeds", async () => {
    const err429 = new Error("429 Too Many Requests");
    (err429 as unknown as { status: number }).status = 429;

    const caller = vi
      .fn()
      .mockRejectedValueOnce(err429)
      .mockResolvedValueOnce({ text: JSON.stringify({ actions: ["after_429"] }) });

    const client = new GeminiLlmClient({ caller, retryDelayMs: 1 });
    const res = await client.generateJson({
      purpose: "planner",
      system: "Sys",
      user: "User prompt",
      schema: testSchema,
      maxOutputTokens: 300,
      timeoutMs: 1000,
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toEqual({ actions: ["after_429"] });
    }
    expect(caller).toHaveBeenCalledTimes(2);
  });

  it("case (f): fails soft with LLM_TIMEOUT on repeated timeout", async () => {
    const timeoutErr = new Error("Request timed out");

    const caller = vi.fn().mockRejectedValue(timeoutErr);

    const client = new GeminiLlmClient({ caller, retryDelayMs: 0 });
    const res = await client.generateJson({
      purpose: "planner",
      system: "Sys",
      user: "User prompt",
      schema: testSchema,
      maxOutputTokens: 300,
      timeoutMs: 1000,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("LLM_TIMEOUT");
    }
    expect(caller).toHaveBeenCalledTimes(2);
  });
});
