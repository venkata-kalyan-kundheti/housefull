import { describe, it, expect } from "vitest";
import { TraceEmitter, STEP_LABELS } from "@/lib/agent/trace";

describe("TraceEmitter", () => {
  it("registers listeners and emits events in order", () => {
    const emitter = new TraceEmitter();
    const events: unknown[] = [];
    emitter.addListener((e) => events.push(e));

    emitter.emit({
      type: "run.started",
      runId: "run_123",
      showId: "show_456",
      at: "2026-10-18T10:00:00.000Z",
    });

    emitter.emitStepStarted("resolve_film");
    emitter.emitStepFinished("resolve_film", "Found 1 match");

    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({
      type: "run.started",
      runId: "run_123",
      showId: "show_456",
    });
    expect(events[1]).toMatchObject({
      type: "step.started",
      step: "resolve_film",
      label: STEP_LABELS["resolve_film"],
    });
    expect(events[2]).toMatchObject({
      type: "step.finished",
      step: "resolve_film",
      summary: "Found 1 match",
    });
  });

  it("redacts sensitive keys from emitted events", () => {
    process.env.QLOO_API_KEY = "secret_qloo_key_xyz";
    const emitter = new TraceEmitter();
    const events: unknown[] = [];
    emitter.addListener((e) => events.push(e));

    // Secret API key or authorization header
    emitter.emit({
      type: "qloo.call",
      call: {
        id: "call_01",
        endpoint: "/search",
        params: { key: "secret_qloo_key_xyz" },
        status: 200,
        latencyMs: 50,
        cached: false,
        attempts: 1,
        resultCount: 2,
        error: null,
        startedAt: "2026-10-18T10:00:00.000Z",
        rateRemainingMonth: 100,
      },
    });

    expect(emitter.getEvents()).toHaveLength(1);
    const eventJson = JSON.stringify(emitter.getEvents()[0]);
    expect(eventJson).not.toContain("secret_qloo_key_xyz");
    expect(eventJson).toContain("[REDACTED]");
  });

  it("handles listener errors gracefully without crashing", () => {
    const emitter = new TraceEmitter();
    emitter.addListener(() => {
      throw new Error("Broken listener");
    });

    expect(() => {
      emitter.emit({
        type: "heartbeat",
        at: "2026-10-18T10:00:00.000Z",
      });
    }).not.toThrow();

    expect(emitter.getEvents()).toHaveLength(1);
  });
});
