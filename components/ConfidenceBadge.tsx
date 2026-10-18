/**
 * components/ConfidenceBadge.tsx
 *
 * Confidence badge with expandable reasons list conforming to Section 15.4.
 */

"use client";

import { useState } from "react";

interface ConfidenceBadgeProps {
  level: "high" | "medium" | "low";
  score: number;
  max?: number;
  reasons: string[];
}

export function ConfidenceBadge({
  level,
  score,
  max = 12,
  reasons,
}: ConfidenceBadgeProps) {
  const [expanded, setExpanded] = useState(false);

  const colors = {
    high: "bg-emerald-50 text-emerald-800 ring-emerald-600/20 border-emerald-200",
    medium: "bg-amber-50 text-amber-800 ring-amber-600/20 border-amber-200",
    low: "bg-rose-50 text-rose-800 ring-rose-600/20 border-rose-200",
  }[level];

  const dotColors = {
    high: "bg-emerald-500",
    medium: "bg-amber-500",
    low: "bg-rose-500",
  }[level];

  const capitalizedLevel =
    level.charAt(0).toUpperCase() + level.slice(1);

  return (
    <div className="inline-block space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${colors} hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-offset-1`}
          aria-expanded={expanded}
          aria-label={`Confidence: ${capitalizedLevel}, score ${score} of ${max}. Click to toggle explanation`}
        >
          <span className={`h-2 w-2 rounded-full ${dotColors}`} aria-hidden="true" />
          <span>Confidence: {capitalizedLevel}</span>
          <span className="text-zinc-500 font-normal">
            ({score}/{max})
          </span>
          <svg
            className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>

      {expanded && reasons.length > 0 && (
        <div className="mt-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700 shadow-sm max-w-md">
          <p className="font-medium text-zinc-900 mb-1.5">Confidence factors:</p>
          <ul className="space-y-1 list-disc list-inside">
            {reasons.map((reason, idx) => (
              <li key={idx} className="text-zinc-600">
                {reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
