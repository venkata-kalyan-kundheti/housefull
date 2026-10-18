/**
 * lib/agent/trace.ts
 *
 * Trace event types and emitter for the pipeline (Section 10.7).
 */

import type { QlooCallRecord } from "@/lib/qloo/types";
import { redactSecrets } from "@/lib/config";

export type TraceEvent =
  | { type: "run.started"; runId: string; showId: string; at: string }
  | { type: "step.started"; step: string; label: string; at: string }
  | { type: "qloo.call"; call: QlooCallRecord }
  | { type: "llm.call"; purpose: string; ok: boolean; latencyMs: number }
  | { type: "step.finished"; step: string; summary: string; at: string }
  | {
      type: "validation.result";
      part: string;
      violations: string[];
      regenerated: boolean;
    }
  | { type: "brief.ready"; briefId: string; fromCache: boolean }
  | {
      type: "run.failed";
      code: string;
      message: string;
      alternates?: { name: string; entityId: string }[];
    }
  | { type: "heartbeat"; at: string };

export const STEP_LABELS: Record<string, string> = {
  resolve_film: "Finding the film in the taste graph",
  fan_out: "Asking Qloo what this film's audience loves",
  derive: "Working out audiences, areas and channels",
  plan: "Deciding where else to look",
  partners: "Looking for local partners",
  compose: "Writing the channel plan, messages and summary",
  validate: "Checking every claim against the evidence",
  score: "Scoring confidence",
  save: "Saving the brief",
};

export type TraceListener = (event: TraceEvent) => void;

/**
 * Emitter that fans out events to multiple listeners and keeps an in-memory log.
 */
export class TraceEmitter {
  private readonly listeners: TraceListener[] = [];
  private readonly events: TraceEvent[] = [];

  addListener(listener: TraceListener): void {
    this.listeners.push(listener);
  }

  emit(event: TraceEvent): void {
    // Sanitise any string values that might contain secrets
    const sanitised = JSON.parse(
      redactSecrets(JSON.stringify(event))
    ) as TraceEvent;
    this.events.push(sanitised);
    for (const listener of this.listeners) {
      try {
        listener(sanitised);
      } catch {
        // Listener errors must never crash the pipeline
      }
    }
  }

  emitStepStarted(step: string): void {
    const label = STEP_LABELS[step] ?? step;
    this.emit({
      type: "step.started",
      step,
      label,
      at: new Date().toISOString(),
    });
  }

  emitStepFinished(step: string, summary: string): void {
    this.emit({
      type: "step.finished",
      step,
      summary,
      at: new Date().toISOString(),
    });
  }

  getEvents(): readonly TraceEvent[] {
    return this.events;
  }
}
