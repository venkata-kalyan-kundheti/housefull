/**
 * components/EvidenceDrawer.tsx
 *
 * Slide-over drawer displaying raw Qloo call details and citing brief items (Section 15.4).
 */

"use client";

import { useEffect } from "react";
import type { QlooCallRecord } from "@/lib/qloo/types";

interface EvidenceDrawerProps {
  call: QlooCallRecord | null;
  citedItems?: string[];
  open: boolean;
  onClose: () => void;
}

export function EvidenceDrawer({
  call,
  citedItems = [],
  open,
  onClose,
}: EvidenceDrawerProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open || !call) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-title"
      className="fixed inset-0 z-50 overflow-hidden"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-zinc-950/30 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
        <div className="w-screen max-w-md bg-white shadow-2xl border-l border-zinc-200 flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between">
            <div>
              <h2 id="drawer-title" className="text-base font-semibold text-zinc-900">
                Evidence Record: {call.id}
              </h2>
              <p className="text-xs text-zinc-500 font-mono mt-0.5">
                {call.endpoint}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
              aria-label="Close drawer"
            >
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 text-sm">
            {/* Cited Items */}
            {citedItems.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Cited Items in Brief
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {citedItems.map((item, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-800"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-3">
                <span className="text-xs text-zinc-500 block">Status</span>
                <span
                  className={`font-mono font-medium ${
                    call.status === 200 ? "text-emerald-700" : "text-red-700"
                  }`}
                >
                  {call.status ?? "None"}
                </span>
              </div>
              <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-3">
                <span className="text-xs text-zinc-500 block">Latency</span>
                <span className="font-mono font-medium text-zinc-900">
                  {call.latencyMs} ms
                </span>
              </div>
              <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-3">
                <span className="text-xs text-zinc-500 block">Results Returned</span>
                <span className="font-mono font-medium text-zinc-900">
                  {call.resultCount}
                </span>
              </div>
              <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-3">
                <span className="text-xs text-zinc-500 block">Cached</span>
                <span className="font-mono font-medium text-zinc-900">
                  {call.cached ? "Yes" : "No"}
                </span>
              </div>
            </div>

            {/* Parameters */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Request Parameters
              </h3>
              <div className="rounded-lg border border-zinc-200 bg-zinc-900 p-3 font-mono text-xs text-zinc-200 overflow-x-auto">
                {Object.entries(call.params).map(([k, v]) => (
                  <div key={k} className="py-0.5">
                    <span className="text-amber-400">{k}</span>:{" "}
                    <span className="text-emerald-400">&quot;{v}&quot;</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Timings & Quota */}
            <div className="space-y-2 text-xs text-zinc-600 font-mono">
              <div>Started: {call.startedAt}</div>
              <div>Attempts: {call.attempts}</div>
              {call.rateRemainingMonth !== null && (
                <div>Remaining Monthly Quota: {call.rateRemainingMonth}</div>
              )}
            </div>

            {/* Error info if any */}
            {call.error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 space-y-1">
                <div className="font-bold text-red-900">
                  Error: {call.error.code}
                </div>
                <div>{call.error.message}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
