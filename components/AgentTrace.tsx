/**
 * components/AgentTrace.tsx
 *
 * Live streaming agent execution trace panel conforming to Section 15.3.
 * Shows status icon, step label, Qloo calls under each step, aria-live="polite", auto-scrolling.
 */

"use client";

import { useEffect, useRef } from "react";
import type { TraceEvent } from "@/lib/agent/trace";
import type { QlooCallRecord } from "@/lib/qloo/types";

interface AgentTraceProps {
  events: TraceEvent[];
  active: boolean;
  className?: string;
}

interface StepDefinition {
  step: string;
  label: string;
}

const ORDERED_STEPS: StepDefinition[] = [
  { step: "resolve_film", label: "Finding the film in the taste graph" },
  { step: "fan_out", label: "Asking Qloo what this film's audience loves" },
  { step: "derive", label: "Working out audiences, areas and channels" },
  { step: "plan", label: "Deciding where else to look" },
  { step: "partners", label: "Looking for local partners" },
  { step: "compose", label: "Writing the channel plan, messages and summary" },
  { step: "validate", label: "Checking every claim against the evidence" },
  { step: "score", label: "Scoring confidence" },
  { step: "save", label: "Saving the brief" },
];

export function AgentTrace({ events, active, className = "" }: AgentTraceProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll while running
  useEffect(() => {
    if (active && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [events, active]);

  // Aggregate step state from events
  const stepStates = new Map<
    string,
    {
      status: "waiting" | "running" | "done" | "failed";
      summary?: string;
      calls: QlooCallRecord[];
    }
  >();

  for (const s of ORDERED_STEPS) {
    stepStates.set(s.step, { status: "waiting", calls: [] });
  }

  let currentStep: string | null = null;

  for (const event of events) {
    if (event.type === "step.started") {
      currentStep = event.step;
      const existing = stepStates.get(event.step);
      if (existing) {
        existing.status = "running";
      }
    } else if (event.type === "step.finished") {
      const existing = stepStates.get(event.step);
      if (existing) {
        existing.status = "done";
        existing.summary = event.summary;
      }
    } else if (event.type === "qloo.call") {
      if (currentStep) {
        const existing = stepStates.get(currentStep);
        if (existing) {
          existing.calls.push(event.call);
        }
      }
    } else if (event.type === "run.failed") {
      if (currentStep) {
        const existing = stepStates.get(currentStep);
        if (existing) {
          existing.status = "failed";
        }
      }
    }
  }

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label="Agent Execution Trace"
      aria-live="polite"
      className={`rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 font-mono text-xs overflow-y-auto max-h-[380px] shadow-inner ${className}`}
    >
      <div className="flex items-center justify-between border-b border-zinc-200/80 pb-2.5 mb-3">
        <span className="font-semibold text-zinc-900 tracking-wide uppercase text-[11px]">
          Agent Execution Trace
        </span>
        {active && (
          <span className="inline-flex items-center gap-1.5 text-zinc-600 font-sans">
            <span
              className="h-2 w-2 rounded-full bg-emerald-500 animate-ping"
              aria-hidden="true"
            />
            <span>Running...</span>
          </span>
        )}
      </div>

      <div className="space-y-3 font-sans">
        {ORDERED_STEPS.map((stepDef) => {
          const state = stepStates.get(stepDef.step) ?? {
            status: "waiting",
            calls: [],
          };

          return (
            <div key={stepDef.step} className="space-y-1.5">
              <div className="flex items-center gap-2.5">
                {state.status === "waiting" && (
                  <span
                    className="h-4 w-4 rounded-full border border-zinc-300 bg-white shrink-0"
                    aria-hidden="true"
                  />
                )}
                {state.status === "running" && (
                  <span
                    role="status"
                    className="h-4 w-4 rounded-full border-2 border-zinc-800 border-t-transparent animate-spin shrink-0"
                    aria-label="Step running"
                  />
                )}
                {state.status === "done" && (
                  <span
                    className="h-4 w-4 rounded-full bg-emerald-600 flex items-center justify-center text-white shrink-0 text-[10px]"
                    aria-label="Step completed"
                  >
                    ✓
                  </span>
                )}
                {state.status === "failed" && (
                  <span
                    className="h-4 w-4 rounded-full bg-red-600 flex items-center justify-center text-white shrink-0 text-[10px]"
                    aria-label="Step failed"
                  >
                    ✕
                  </span>
                )}

                <span
                  className={`font-medium ${
                    state.status === "waiting"
                      ? "text-zinc-400"
                      : state.status === "running"
                      ? "text-zinc-950 font-semibold"
                      : state.status === "failed"
                      ? "text-red-900 font-semibold"
                      : "text-zinc-800"
                  }`}
                >
                  {stepDef.label}
                </span>

                {state.summary && (
                  <span className="text-zinc-500 text-xs ml-auto font-normal hidden sm:inline">
                    {state.summary}
                  </span>
                )}
              </div>

              {/* Call lines under this step */}
              {state.calls.length > 0 && (
                <div className="ml-6 space-y-1 font-mono text-[11px] text-zinc-600 border-l border-zinc-200 pl-2.5 py-0.5">
                  {state.calls.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 flex-wrap">
                      <span className="text-zinc-400">{c.id}</span>
                      <span className="text-zinc-900 font-medium">{c.endpoint}</span>
                      <span
                        className={
                          c.status === 200
                            ? "text-emerald-700"
                            : "text-red-700 font-semibold"
                        }
                      >
                        {c.status ?? "error"}
                      </span>
                      <span>{c.latencyMs}ms</span>
                      {c.cached && (
                        <span className="rounded bg-zinc-200/60 px-1 text-[10px] text-zinc-700">
                          cached
                        </span>
                      )}
                      <span className="text-zinc-500">
                        {c.resultCount} results
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
