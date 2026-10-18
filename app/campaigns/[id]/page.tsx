/**
 * app/campaigns/[id]/page.tsx
 *
 * Campaign page with experiment planner and results evaluation conforming to Section 15.5.
 */

"use client";

import { use, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ErrorBanner } from "@/components/ErrorBanner";
import type { Analysis } from "@/lib/stats/twoProportion";

interface ExperimentView {
  id: string;
  baseline: number;
  mdeAbs: number;
  alpha: number;
  power: number;
  nPerArm: number;
  totalPeople: number;
  baselineIsDefault: boolean;
  splitMethod: "list_split" | "geo_split";
  results: {
    control: { reached: number; converted: number };
    test: { reached: number; converted: number };
    analysis: Analysis;
  } | null;
}

interface CampaignDetailData {
  campaign: {
    id: string;
    briefId: string;
    offerSlug: string;
    offerText: string | null;
    selectedChannelIds: string[];
    selectedCopy: Array<{ segmentId: string; variantIndex: number }>;
    createdAt: string;
  };
  experiment: ExperimentView;
  brief: {
    id: string;
    film: { title: string; qlooEntityId: string };
    show: { id: string; theaterName?: string; startsAtLocal?: string };
  };
}

export default function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: campaignId } = use(params);

  const [data, setData] = useState<CampaignDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Experiment Planner State
  const [baselinePercent, setBaselinePercent] = useState<number>(5);
  const [mdePoints, setMdePoints] = useState<number>(2);
  const [plannedSampleSize, setPlannedSampleSize] = useState<{
    nPerArm: number;
    totalPeople: number;
  } | null>(null);
  const [planSaving, setPlanSaving] = useState(false);
  const [planSavedNotice, setPlanSavedNotice] = useState(false);

  // Results Form State
  const [controlReached, setControlReached] = useState<string>("500");
  const [controlConverted, setControlConverted] = useState<string>("25");
  const [testReached, setTestReached] = useState<string>("500");
  const [testConverted, setTestConverted] = useState<string>("40");
  const [resultsSubmitting, setResultsSubmitting] = useState(false);
  const [resultsError, setResultsError] = useState<string | null>(null);

  const [copiedLink, setCopiedLink] = useState(false);

  const fetchCampaign = useCallback(() => {
    setLoading(true);
    fetch(`/api/campaigns/${campaignId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Campaign not found");
        return res.json();
      })
      .then((resData: CampaignDetailData) => {
        setData(resData);
        setBaselinePercent(Number((resData.experiment.baseline * 100).toFixed(2)));
        setMdePoints(Number((resData.experiment.mdeAbs * 100).toFixed(2)));
        setPlannedSampleSize({
          nPerArm: resData.experiment.nPerArm,
          totalPeople: resData.experiment.totalPeople,
        });
        if (resData.experiment.results) {
          setControlReached(String(resData.experiment.results.control.reached));
          setControlConverted(String(resData.experiment.results.control.converted));
          setTestReached(String(resData.experiment.results.test.reached));
          setTestConverted(String(resData.experiment.results.test.converted));
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [campaignId]);

  useEffect(() => {
    fetchCampaign();
  }, [fetchCampaign]);

  // Debounced sample size recalculation
  useEffect(() => {
    const timer = setTimeout(async () => {
      const b = baselinePercent / 100;
      const m = mdePoints / 100;
      if (b > 0 && b < 1 && m > 0 && b + m < 1) {
        try {
          const res = await fetch("/api/experiments/plan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ baseline: b, mdeAbs: m }),
          });
          if (res.ok) {
            const plan = await res.json();
            setPlannedSampleSize({
              nPerArm: plan.nPerArm,
              totalPeople: plan.totalPeople,
            });
          }
        } catch {
          // Ignore
        }
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [baselinePercent, mdePoints]);

  const handleSavePlan = async () => {
    if (!data) return;
    setPlanSaving(true);
    try {
      const res = await fetch(`/api/experiments/${data.experiment.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseline: baselinePercent / 100,
          mdeAbs: mdePoints / 100,
        }),
      });
      if (res.ok) {
        setPlanSavedNotice(true);
        setTimeout(() => setPlanSavedNotice(false), 2500);
        fetchCampaign();
      }
    } catch {
      // Ignore
    } finally {
      setPlanSaving(false);
    }
  };

  const handleRecordResults = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data) return;
    setResultsSubmitting(true);
    setResultsError(null);

    try {
      const res = await fetch(`/api/experiments/${data.experiment.id}/results`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          control: {
            reached: Number.parseInt(controlReached, 10),
            converted: Number.parseInt(controlConverted, 10),
          },
          test: {
            reached: Number.parseInt(testReached, 10),
            converted: Number.parseInt(testConverted, 10),
          },
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson?.error?.message ?? "Failed to save results");
      }

      fetchCampaign();
    } catch (err: unknown) {
      setResultsError((err as Error)?.message ?? "Something went wrong");
    } finally {
      setResultsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse py-8">
        <div className="h-4 w-32 bg-zinc-200 rounded" />
        <div className="h-64 bg-zinc-100 rounded-xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4 py-8">
        <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-900 underline">
          ← Back to Schedule
        </Link>
        <ErrorBanner message={error ?? "Campaign not found"} />
      </div>
    );
  }

  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://housefull.example.com";
  const publicOfferUrl = `${origin}/offer/${data.campaign.offerSlug}`;

  const expResults = data.experiment.results;

  return (
    <div className="space-y-8 py-4">
      {/* Top Header */}
      <div>
        <Link
          href={`/shows/${data.brief.show.id}?briefId=${data.brief.id}`}
          className="text-xs text-zinc-500 hover:text-zinc-900 inline-flex items-center gap-1"
        >
          <span>←</span> Back to Brief
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-950 mt-2">
          Campaign: {data.brief.film.title}
        </h1>
        <p className="text-xs text-zinc-500 mt-1">
          Created on {new Date(data.campaign.createdAt).toLocaleDateString()}
        </p>
      </div>

      {/* Public Offer Link Block */}
      <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <span className="text-xs font-semibold text-zinc-900 block">
            Public landing offer page
          </span>
          <span className="text-xs font-mono text-zinc-600 break-all">
            {publicOfferUrl}
          </span>
        </div>

        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(publicOfferUrl);
            setCopiedLink(true);
            setTimeout(() => setCopiedLink(false), 2000);
          }}
          className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 shadow-xs ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50"
        >
          {copiedLink ? "Copied URL!" : "Copy Link"}
        </button>
      </div>

      {/* Campaign Details Summary */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5 space-y-4 shadow-xs">
        <h2 className="text-sm font-semibold text-zinc-950">
          Campaign Configuration
        </h2>

        {data.campaign.offerText && (
          <div className="rounded-lg bg-zinc-50 p-3 text-xs">
            <span className="text-zinc-500 block mb-0.5 font-medium">
              Public Offer Text:
            </span>
            <span className="text-zinc-900 font-semibold">
              &quot;{data.campaign.offerText}&quot;
            </span>
          </div>
        )}

        <div className="text-xs text-zinc-600">
          <span>Target Channels: </span>
          <span className="font-semibold text-zinc-900">
            {data.campaign.selectedChannelIds.join(", ")}
          </span>
        </div>
      </div>

      {/* Section 1: Experiment Planner */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 space-y-6 shadow-xs">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-zinc-950">
            A/B Experiment Planner
          </h2>
          <p className="text-xs text-zinc-500">
            Randomly split the people you will contact into a test group (gets the
            Housefull message) and a control group (business as usual).
          </p>
        </div>

        {data.experiment.baselineIsDefault && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            Baseline conversion is your own estimate. Replace the default with
            your cinema&apos;s real figure.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-700">
              Baseline conversion (%)
            </label>
            <input
              type="number"
              step="0.1"
              min="0.1"
              max="90"
              value={baselinePercent}
              onChange={(e) => setBaselinePercent(Number(e.target.value))}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 shadow-xs focus:ring-1 focus:ring-zinc-900"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-700">
              Smallest improvement worth detecting (percentage points)
            </label>
            <input
              type="number"
              step="0.1"
              min="0.1"
              max="50"
              value={mdePoints}
              onChange={(e) => setMdePoints(Number(e.target.value))}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 shadow-xs focus:ring-1 focus:ring-zinc-900"
            />
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-zinc-100 pt-4 flex-wrap gap-4 text-xs">
          <div className="space-y-1">
            <span className="text-zinc-500 block">Significance 5%, power 80%</span>
            {plannedSampleSize && (
              <span className="font-semibold text-zinc-900 text-sm">
                {plannedSampleSize.nPerArm} people per group (
                {plannedSampleSize.totalPeople} in total)
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleSavePlan}
            disabled={planSaving}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-zinc-800 disabled:opacity-50"
          >
            {planSaving
              ? "Saving..."
              : planSavedNotice
              ? "Plan Saved!"
              : "Save plan"}
          </button>
        </div>
      </div>

      {/* Section 2: Experiment Results Input & Verdict */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 space-y-6 shadow-xs">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-zinc-950">
            Record Experiment Results
          </h2>
          <p className="text-xs text-zinc-500">
            Enter the final reach and conversion numbers for both groups after
            running your campaign.
          </p>
        </div>

        {resultsError && <ErrorBanner message={resultsError} />}

        <form onSubmit={handleRecordResults} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Control Group */}
            <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-4 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-600">
                Control Group (Standard)
              </h3>
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-zinc-600">People reached</label>
                  <input
                    type="number"
                    min="1"
                    value={controlReached}
                    onChange={(e) => setControlReached(e.target.value)}
                    required
                    className="w-full rounded border border-zinc-300 bg-white px-2.5 py-1 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-600">Tickets booked</label>
                  <input
                    type="number"
                    min="0"
                    value={controlConverted}
                    onChange={(e) => setControlConverted(e.target.value)}
                    required
                    className="w-full rounded border border-zinc-300 bg-white px-2.5 py-1 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Test Group */}
            <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-4 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-600">
                Test Group (Housefull Message)
              </h3>
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-zinc-600">People reached</label>
                  <input
                    type="number"
                    min="1"
                    value={testReached}
                    onChange={(e) => setTestReached(e.target.value)}
                    required
                    className="w-full rounded border border-zinc-300 bg-white px-2.5 py-1 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-600">Tickets booked</label>
                  <input
                    type="number"
                    min="0"
                    value={testConverted}
                    onChange={(e) => setTestConverted(e.target.value)}
                    required
                    className="w-full rounded border border-zinc-300 bg-white px-2.5 py-1 text-xs"
                  />
                </div>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={resultsSubmitting}
            className="w-full rounded-lg bg-zinc-900 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-zinc-800 disabled:opacity-50"
          >
            {resultsSubmitting
              ? "Calculating Analysis..."
              : "Compute Experiment Verdict"}
          </button>
        </form>

        {/* ResultCard */}
        {expResults && expResults.analysis && (
          <div className="rounded-xl border border-zinc-300 bg-zinc-50 p-5 space-y-4 pt-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-700">
              Analysis Results
            </h3>

            {/* Verdict Box */}
            <div
              className={`rounded-lg p-4 space-y-1.5 border ${
                expResults.analysis.verdict === "positive"
                  ? "bg-emerald-50 border-emerald-300 text-emerald-950"
                  : expResults.analysis.verdict === "negative"
                  ? "bg-rose-50 border-rose-300 text-rose-950"
                  : "bg-amber-50 border-amber-300 text-amber-950"
              }`}
            >
              <p className="font-semibold text-sm">
                {expResults.analysis.verdict === "positive" &&
                  "The test group converted better than the control group, beyond what chance alone would usually explain."}
                {expResults.analysis.verdict === "negative" &&
                  "The test group converted worse than the control group, beyond what chance alone would usually explain."}
                {expResults.analysis.verdict === "inconclusive" &&
                  "We cannot tell. This is not evidence of no effect."}
              </p>
              <p className="text-xs opacity-90 italic">
                One experiment cannot prove a cause by itself. Check that groups
                were assigned at random.
              </p>
            </div>

            {/* Underpowered Warning */}
            {expResults.analysis.underpowered && (
              <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 border border-amber-200 font-medium">
                Underpowered: each group should have at least{" "}
                {data.experiment.nPerArm} people
              </div>
            )}

            {/* Lift and Statistical Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="rounded bg-white p-2.5 border border-zinc-200">
                <span className="text-zinc-500 block">Control Rate</span>
                <span className="font-mono font-bold text-zinc-900">
                  {(expResults.analysis.controlRate * 100).toFixed(2)}%
                </span>
              </div>
              <div className="rounded bg-white p-2.5 border border-zinc-200">
                <span className="text-zinc-500 block">Test Rate</span>
                <span className="font-mono font-bold text-zinc-900">
                  {(expResults.analysis.testRate * 100).toFixed(2)}%
                </span>
              </div>
              <div className="rounded bg-white p-2.5 border border-zinc-200">
                <span className="text-zinc-500 block">Absolute Lift</span>
                <span className="font-mono font-bold text-zinc-900">
                  {expResults.analysis.absoluteLift > 0 ? "+" : ""}
                  {(expResults.analysis.absoluteLift * 100).toFixed(2)}%
                </span>
              </div>
              <div className="rounded bg-white p-2.5 border border-zinc-200">
                <span className="text-zinc-500 block">p-value</span>
                <span className="font-mono font-bold text-zinc-900">
                  {expResults.analysis.pValue.toFixed(4)}
                </span>
              </div>
            </div>

            <div className="text-[11px] text-zinc-500 font-mono">
              95% Confidence Interval for difference: [
              {(expResults.analysis.diffCi[0] * 100).toFixed(2)}%,{" "}
              {(expResults.analysis.diffCi[1] * 100).toFixed(2)}%]
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
