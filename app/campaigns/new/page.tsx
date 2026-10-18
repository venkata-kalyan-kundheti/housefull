/**
 * app/campaigns/new/page.tsx
 *
 * Campaign creation form allowing manager to set offerText and finalize channel choices (Section 14.7, 15.5).
 */

"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { TasteBrief } from "@/lib/agent/briefTypes";
import { ErrorBanner } from "@/components/ErrorBanner";

function NewCampaignContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const briefId = searchParams.get("briefId");
  const channelsParam = searchParams.get("channels");

  const [brief, setBrief] = useState<TasteBrief | null>(null);
  const [loadingBrief, setLoadingBrief] = useState(true);
  const [briefError, setBriefError] = useState<string | null>(null);

  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [selectedCopy, setSelectedCopy] = useState<
    Record<string, number>
  >({});
  const [offerText, setOfferText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<{
    code?: string;
    message?: string;
  } | null>(null);

  useEffect(() => {
    if (!briefId) {
      setBriefError("No brief ID provided");
      setLoadingBrief(false);
      return;
    }

    if (channelsParam) {
      setSelectedChannels(channelsParam.split(",").filter(Boolean));
    }

    fetch(`/api/briefs/${briefId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load brief");
        return res.json();
      })
      .then((data) => {
        setBrief(data);
        if (!channelsParam && data.channels) {
          setSelectedChannels(
            data.channels
              .filter((c: { priority: number | null }) => c.priority !== null)
              .slice(0, 2)
              .map((c: { id: string }) => c.id)
          );
        }
      })
      .catch((err) => setBriefError(err.message))
      .finally(() => setLoadingBrief(false));
  }, [briefId, channelsParam]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedChannels.length === 0) return;

    setSubmitting(true);
    setSubmitError(null);

    const copyArray = Object.entries(selectedCopy).map(
      ([segmentId, variantIndex]) => ({
        segmentId,
        variantIndex: variantIndex as 0 | 1 | 2,
      })
    );

    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          briefId,
          selectedChannelIds: selectedChannels,
          selectedCopy: copyArray,
          offerText: offerText.trim() ? offerText.trim() : undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData?.error?.message ?? "Failed to create campaign");
      }

      const data = await res.json();
      router.push(`/campaigns/${data.campaign.id}`);
    } catch (err: unknown) {
      setSubmitError({
        message: (err as Error)?.message ?? "Something went wrong",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingBrief) {
    return (
      <div className="max-w-2xl mx-auto space-y-4 animate-pulse py-8">
        <div className="h-4 w-32 bg-zinc-200 rounded" />
        <div className="h-64 bg-zinc-100 rounded-xl" />
      </div>
    );
  }

  if (briefError || !brief) {
    return (
      <div className="max-w-2xl mx-auto space-y-4 py-8">
        <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-900 underline">
          ← Back to Schedule
        </Link>
        <ErrorBanner message={briefError ?? "Brief not found"} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8 py-4">
      <div>
        <Link
          href={`/shows/${brief.show.id}?briefId=${brief.id}`}
          className="text-xs text-zinc-500 hover:text-zinc-900 inline-flex items-center gap-1"
        >
          <span>←</span> Back to Brief
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-950 mt-2">
          New Campaign for {brief.film.title}
        </h1>
        <p className="text-xs text-zinc-500 mt-1">
          {brief.show.theaterName} • {brief.show.startsAtLocal}
        </p>
      </div>

      {submitError && (
        <ErrorBanner
          code={submitError.code}
          message={submitError.message}
        />
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Selected Channels Review */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 space-y-3 shadow-xs">
          <h2 className="text-sm font-semibold text-zinc-950">
            Selected Channels ({selectedChannels.length})
          </h2>
          <div className="space-y-2">
            {brief.channels
              .filter((c) => selectedChannels.includes(c.id))
              .map((c) => (
                <div
                  key={c.id}
                  className="rounded-lg bg-zinc-50 p-2.5 text-xs flex items-center justify-between"
                >
                  <span className="font-medium text-zinc-900">{c.title}</span>
                  <span className="text-zinc-500 font-mono">
                    {c.priority !== null ? `Priority ${c.priority}` : "Unranked"}
                  </span>
                </div>
              ))}
          </div>
        </div>

        {/* Optional Offer Text */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <label
              htmlFor="offer-text"
              className="text-sm font-semibold text-zinc-950"
            >
              Public Offer Text (Optional)
            </label>
            <span className="text-xs text-zinc-400 font-mono">
              {offerText.length} / 120
            </span>
          </div>

          <p className="text-xs text-zinc-500">
            A special promotion or discount shown on the public landing page
            (e.g., &quot;Show your ticket at the café for 10% off&quot;). No contact info
            or links allowed.
          </p>

          <input
            id="offer-text"
            type="text"
            maxLength={120}
            value={offerText}
            onChange={(e) => setOfferText(e.target.value)}
            placeholder="e.g. Free small popcorn with your ticket"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 shadow-xs focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
        </div>

        {/* Copy Variants Selection */}
        {brief.copy.length > 0 && (
          <div className="rounded-xl border border-zinc-200 bg-white p-5 space-y-4 shadow-xs">
            <h2 className="text-sm font-semibold text-zinc-950">
              Message Variants for Segments
            </h2>

            <div className="space-y-4">
              {brief.copy.map((segCopy) => {
                const segInfo = brief.segments.find(
                  (s) => s.id === segCopy.segmentId
                );
                return (
                  <div
                    key={segCopy.segmentId}
                    className="space-y-2 border-b border-zinc-100 pb-3 last:border-b-0"
                  >
                    <p className="text-xs font-semibold text-zinc-800">
                      {segInfo?.label ?? segCopy.segmentId}
                    </p>
                    <div className="space-y-1.5">
                      {segCopy.variants.map((v, idx) => (
                        <label
                          key={idx}
                          className="flex items-start gap-2 p-2 rounded bg-zinc-50 text-xs cursor-pointer hover:bg-zinc-100/70"
                        >
                          <input
                            type="radio"
                            name={`seg_${segCopy.segmentId}`}
                            checked={selectedCopy[segCopy.segmentId] === idx}
                            onChange={() =>
                              setSelectedCopy((prev) => ({
                                ...prev,
                                [segCopy.segmentId]: idx,
                              }))
                            }
                            className="mt-0.5"
                          />
                          <span className="text-zinc-700">{v}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || selectedChannels.length === 0}
          className="w-full rounded-lg bg-zinc-900 py-3 text-sm font-semibold text-white shadow-xs hover:bg-zinc-800 disabled:opacity-50"
        >
          {submitting ? "Creating Campaign..." : "Launch Campaign & Experiment"}
        </button>
      </form>
    </div>
  );
}

export default function NewCampaignPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-4xl mx-auto py-12 px-4 text-center text-zinc-500">
          Loading campaign creator...
        </div>
      }
    >
      <NewCampaignContent />
    </Suspense>
  );
}
