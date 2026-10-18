/**
 * app/shows/[id]/page.tsx
 *
 * Show Workspace view conforming to Section 15.3.
 * Header card, radius control, generate/regenerate, live AgentTrace, alternates picker, BriefTabs.
 */

"use client";

import { use, useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { FillBar } from "@/components/FillBar";
import { ErrorBanner } from "@/components/ErrorBanner";
import { AgentTrace } from "@/components/AgentTrace";
import { BriefTabs } from "@/components/BriefTabs";
import { useBriefStream } from "@/lib/hooks/useBriefStream";
import type { TasteBrief } from "@/lib/agent/briefTypes";

interface ShowDetails {
  id: string;
  filmTitle: string;
  theaterId: string;
  theaterName: string;
  city: string;
  timeZone: string;
  startsAtIso: string;
  startsAtLocal: string;
  screen: number;
  capacity: number;
  sold: number;
  hoursToStart: number;
  projectedFill: number;
  underfilled: boolean;
  source: "synthetic" | "csv";
  latestBriefId: string | null;
  theater: {
    lat: number;
    lon: number;
  };
}

function ShowWorkspaceContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: showId } = use(params);
  const searchParams = useSearchParams();
  const queryBriefId = searchParams.get("briefId");

  const [show, setShow] = useState<ShowDetails | null>(null);
  const [loadingShow, setLoadingShow] = useState(true);
  const [showError, setShowError] = useState<string | null>(null);

  const [radiusKm, setRadiusKm] = useState<number>(15);
  const [activeBrief, setActiveBrief] = useState<TasteBrief | null>(null);
  const [loadingBrief, setLoadingBrief] = useState(false);

  // Hook for streaming execution
  const {
    status,
    events,
    briefId,
    error,
    alternates,
    start,
  } = useBriefStream({
    showId,
    radiusKm,
  });

  // Load show details
  useEffect(() => {
    let ignore = false;
    setLoadingShow(true);
    fetch(`/api/shows/${showId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Show not found");
        return res.json();
      })
      .then((data) => {
        if (!ignore) {
          setShow(data);
          setShowError(null);
        }
      })
      .catch((err) => {
        if (!ignore) setShowError(err.message);
      })
      .finally(() => {
        if (!ignore) setLoadingShow(false);
      });

    return () => {
      ignore = true;
    };
  }, [showId]);

  // Load existing brief if provided via query param or show.latestBriefId
  useEffect(() => {
    const idToFetch = briefId ?? queryBriefId ?? show?.latestBriefId;
    if (!idToFetch) return;

    let ignore = false;
    setLoadingBrief(true);
    fetch(`/api/briefs/${idToFetch}`)
      .then((res) => {
        if (!res.ok) throw new Error("Brief not found");
        return res.json();
      })
      .then((data) => {
        if (!ignore) {
          setActiveBrief(data);
        }
      })
      .catch(() => {
        // Ignore
      })
      .finally(() => {
        if (!ignore) setLoadingBrief(false);
      });

    return () => {
      ignore = true;
    };
  }, [briefId, queryBriefId, show?.latestBriefId]);

  const handleGenerate = (filmEntityIdOverride?: string) => {
    start({
      showId,
      radiusKm,
      filmEntityIdOverride,
      force: activeBrief !== null || !!filmEntityIdOverride,
    });
  };

  if (loadingShow) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-4 w-28 bg-zinc-200 rounded" />
        <div className="h-44 bg-zinc-100 rounded-xl" />
      </div>
    );
  }

  if (showError || !show) {
    return (
      <div className="space-y-4">
        <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-900 underline">
          ← Back to Schedule
        </Link>
        <ErrorBanner message={showError ?? "Show not found"} />
      </div>
    );
  }

  const isRunning = status === "connecting" || status === "running";
  const hasBrief = activeBrief !== null;

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-950 transition-colors"
        >
          <span>←</span> Back to Schedule
        </Link>
      </div>

      {/* Header Card */}
      <div
        className={`rounded-2xl border bg-white p-6 shadow-sm space-y-6 ${
          show.underfilled ? "border-amber-300 border-l-4" : "border-zinc-200"
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight text-zinc-950">
                {show.filmTitle}
              </h1>

              {show.underfilled && (
                <span className="inline-flex items-center rounded-md bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-600/20">
                  Underfilled
                </span>
              )}

              <span className="text-xs text-zinc-500 font-mono">
                Screen {show.screen}
              </span>
            </div>

            <div className="flex items-center gap-2 text-sm text-zinc-600 flex-wrap">
              <span className="font-semibold text-zinc-900">{show.theaterName}</span>
              <span>•</span>
              <span>{show.city}</span>
              <span>•</span>
              <span className="font-mono text-zinc-700">{show.startsAtLocal}</span>
              <span>•</span>
              <span className="text-zinc-500">
                starts in {show.hoursToStart.toFixed(1)}h
              </span>
            </div>
          </div>

          <div className="w-full md:w-72 shrink-0">
            <FillBar
              sold={show.sold}
              capacity={show.capacity}
              projectedFill={show.projectedFill}
            />
          </div>
        </div>

        {/* Controls Bar */}
        <div className="flex items-center justify-between border-t border-zinc-100 pt-4 flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <label htmlFor="radius-select" className="text-xs font-semibold text-zinc-700">
              Catchment radius:
            </label>
            <select
              id="radius-select"
              value={radiusKm}
              disabled={isRunning}
              onChange={(e) => setRadiusKm(Number(e.target.value))}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-900 shadow-xs focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 disabled:opacity-50"
            >
              <option value={5}>5 km</option>
              <option value={10}>10 km</option>
              <option value={15}>15 km (default)</option>
              <option value={25}>25 km</option>
              <option value={50}>50 km</option>
            </select>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={isRunning}
              onClick={() => handleGenerate()}
              className={`rounded-lg px-5 py-2.5 text-sm font-semibold shadow-xs transition-colors ${
                isRunning
                  ? "bg-zinc-200 text-zinc-400 cursor-not-allowed"
                  : "bg-zinc-900 text-white hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-950"
              }`}
            >
              {isRunning
                ? "Running Pipeline..."
                : hasBrief
                ? "Regenerate Brief"
                : "Generate Taste Brief"}
            </button>
          </div>
        </div>
      </div>

      {/* Alternate film choices (if match was approximate or manager override) */}
      {activeBrief && activeBrief.film.alternates.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 space-y-2">
          <span className="text-xs font-semibold text-zinc-700">
            Not the right film? Pick another match:
          </span>
          <div className="flex flex-wrap gap-2 pt-1">
            {activeBrief.film.alternates.map((alt) => (
              <button
                key={alt.entityId}
                type="button"
                disabled={isRunning}
                onClick={() => handleGenerate(alt.entityId)}
                className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-100 transition-colors shadow-xs"
              >
                Use &quot;{alt.name}&quot;
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error Banner on run failure */}
      {error && (
        <div className="space-y-4">
          <ErrorBanner code={error.code} message={error.message} />

          {error.code === "FILM_UNRESOLVED" && alternates.length > 0 && (
            <div className="rounded-xl border border-zinc-200 bg-white p-5 space-y-3">
              <h3 className="font-semibold text-sm text-zinc-900">
                Close matches found in the taste graph:
              </h3>
              <div className="space-y-2">
                {alternates.map((alt) => (
                  <div
                    key={alt.entityId}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-50 border border-zinc-100 text-xs"
                  >
                    <span className="font-medium text-zinc-800">{alt.name}</span>
                    <button
                      type="button"
                      onClick={() => handleGenerate(alt.entityId)}
                      className="rounded bg-zinc-900 px-3 py-1 font-semibold text-white hover:bg-zinc-800"
                    >
                      Use this one
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* AgentTrace Panel (visible during or after run) */}
      {(isRunning || events.length > 0) && (
        <AgentTrace events={events} active={isRunning} />
      )}

      {/* Brief Tabs when brief is loaded */}
      {loadingBrief && (
        <div className="h-64 rounded-xl border border-zinc-200 bg-white p-8 animate-pulse flex items-center justify-center text-zinc-400 text-sm">
          Loading brief content...
        </div>
      )}

      {activeBrief && !loadingBrief && <BriefTabs brief={activeBrief} />}
    </div>
  );
}

export default function ShowWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="max-w-6xl mx-auto py-12 px-4 text-center text-zinc-500">
          Loading show workspace...
        </div>
      }
    >
      <ShowWorkspaceContent params={params} />
    </Suspense>
  );
}
