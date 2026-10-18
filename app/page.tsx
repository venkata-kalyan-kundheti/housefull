/**
 * app/page.tsx
 *
 * Schedule Board view conforming to Section 15.2.
 * Shows next 7 days of shows, theater dropdown, underfilled filter, FillBar, and brief links.
 */

"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { FillBar } from "@/components/FillBar";
import { ErrorBanner } from "@/components/ErrorBanner";

interface ShowItem {
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
}

interface TheaterItem {
  id: string;
  name: string;
  city: string;
}

export default function ScheduleBoardPage() {
  const [shows, setShows] = useState<ShowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedTheaterId, setSelectedTheaterId] = useState<string>("all");
  const [underfilledOnly, setUnderfilledOnly] = useState(false);

  const fetchShows = async () => {
    setLoading(true);
    setError(null);
    try {
      const now = new Date();
      const in7Days = new Date(now.getTime() + 7 * 24 * 3600 * 1000);

      const params = new URLSearchParams({
        from: now.toISOString(),
        to: in7Days.toISOString(),
      });

      const res = await fetch(`/api/shows?${params.toString()}`);
      if (!res.ok) {
        throw new Error("Could not load shows.");
      }
      const data = await res.json();
      setShows(data.shows ?? []);
    } catch {
      setError("Could not load shows.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShows();
  }, []);

  // Compute unique theaters list from shows
  const theaters = useMemo(() => {
    const map = new Map<string, TheaterItem>();
    for (const show of shows) {
      if (!map.has(show.theaterId)) {
        map.set(show.theaterId, {
          id: show.theaterId,
          name: show.theaterName,
          city: show.city,
        });
      }
    }
    return Array.from(map.values());
  }, [shows]);

  // Filter shows based on controls
  const filteredShows = useMemo(() => {
    return shows.filter((show) => {
      if (selectedTheaterId !== "all" && show.theaterId !== selectedTheaterId) {
        return false;
      }
      if (underfilledOnly && !show.underfilled) {
        return false;
      }
      return true;
    });
  }, [shows, selectedTheaterId, underfilledOnly]);

  return (
    <div className="space-y-6">
      {/* Title & Description */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950">
            Shows in the next 7 days
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Real-time occupancy projections and AI-powered audience targeting for cinema managers.
          </p>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-zinc-50/70 p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <label htmlFor="theater-select" className="text-xs font-semibold text-zinc-700">
            Theater:
          </label>
          <select
            id="theater-select"
            value={selectedTheaterId}
            onChange={(e) => setSelectedTheaterId(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-900 shadow-xs focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          >
            <option value="all">All Theaters</option>
            {theaters.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.city})
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-zinc-800">
          <input
            type="checkbox"
            checked={underfilledOnly}
            onChange={(e) => setUnderfilledOnly(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-950"
          />
          <span>Underfilled only</span>
        </label>
      </div>

      {/* Error state */}
      {error && <ErrorBanner message={error} onRetry={fetchShows} />}

      {/* Loading Skeleton */}
      {loading && !error && (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((idx) => (
            <div
              key={idx}
              className="rounded-xl border border-zinc-200 bg-white p-5 animate-pulse flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="space-y-2 flex-1">
                <div className="h-4 w-1/3 bg-zinc-200 rounded" />
                <div className="h-3 w-1/4 bg-zinc-100 rounded" />
              </div>
              <div className="h-8 w-48 bg-zinc-100 rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && filteredShows.length === 0 && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-12 text-center space-y-2">
          <p className="text-base font-semibold text-zinc-900">
            No shows in this window.
          </p>
          <p className="text-xs text-zinc-500">
            Try choosing another theater or unchecking the &quot;Underfilled only&quot; filter.
          </p>
        </div>
      )}

      {/* Shows List */}
      {!loading && !error && filteredShows.length > 0 && (
        <div className="space-y-3">
          {filteredShows.map((show) => {
            return (
              <div
                key={show.id}
                className={`rounded-xl border bg-white p-5 transition-all shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-5 ${
                  show.underfilled
                    ? "border-amber-300 border-l-4"
                    : "border-zinc-200 hover:border-zinc-300"
                }`}
              >
                {/* Film & Theater Details */}
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h2 className="font-bold text-base text-zinc-950 truncate">
                      {show.filmTitle}
                    </h2>

                    {show.underfilled && (
                      <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-600/20">
                        Underfilled
                      </span>
                    )}

                    <span className="text-xs text-zinc-500 font-mono">
                      Screen {show.screen}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-zinc-600 flex-wrap">
                    <span className="font-medium text-zinc-900">
                      {show.theaterName}
                    </span>
                    <span>•</span>
                    <span>{show.city}</span>
                    <span>•</span>
                    <span className="font-mono text-zinc-700">
                      {show.startsAtLocal}
                    </span>
                    <span>•</span>
                    <span className="text-zinc-500">
                      starts in {show.hoursToStart.toFixed(1)}h
                    </span>
                  </div>
                </div>

                {/* Fill bar */}
                <div className="w-full md:w-64 shrink-0">
                  <FillBar
                    sold={show.sold}
                    capacity={show.capacity}
                    projectedFill={show.projectedFill}
                  />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
                  <Link
                    href={`/shows/${show.id}`}
                    className={`rounded-lg px-4 py-2 text-xs font-semibold shadow-xs transition-colors text-center ${
                      show.underfilled
                        ? "bg-zinc-900 text-white hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-950"
                        : "bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                    }`}
                  >
                    Generate Taste Brief
                  </Link>

                  {show.latestBriefId && (
                    <Link
                      href={`/shows/${show.id}?briefId=${show.latestBriefId}`}
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                    >
                      View last brief
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
