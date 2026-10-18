/**
 * components/DataBadges.tsx
 *
 * Header data badges conforming to Section 15.1 and 15.6.
 */

"use client";

import { useEffect, useState } from "react";

export function DataBadges() {
  const [appMode, setAppMode] = useState<string>("live");

  useEffect(() => {
    fetch("/api/health")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.mode) {
          setAppMode(data.mode);
        }
      })
      .catch(() => {
        // Fallback to live
      });
  }, []);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="inline-flex items-center rounded-md bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-600/20">
        SIMULATED SHOWTIMES
      </span>

      {appMode === "replay" && (
        <span className="inline-flex items-center rounded-md bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800 ring-1 ring-inset ring-sky-600/20">
          Recorded Qloo responses (replay mode)
        </span>
      )}
    </div>
  );
}
