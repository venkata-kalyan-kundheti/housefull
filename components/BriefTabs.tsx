/**
 * components/BriefTabs.tsx
 *
 * Full TasteBrief tabbed viewer implementing all 8 tabs specified in Section 15.4.
 * Tabs: Summary, Fingerprint, Audience, Where, Channels, Partners, Messages, Evidence.
 */

"use client";

import { useState } from "react";
import Link from "next/link";
import type { TasteBrief } from "@/lib/agent/briefTypes";
import type { QlooCallRecord, AgeBand } from "@/lib/qloo/types";
import { AGE_LABELS, AGE_BANDS_ORDER } from "@/lib/domain/demographics";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { EvidenceDrawer } from "@/components/EvidenceDrawer";

interface BriefTabsProps {
  brief: TasteBrief;
}

type TabKey =
  | "summary"
  | "fingerprint"
  | "audience"
  | "where"
  | "channels"
  | "partners"
  | "messages"
  | "evidence";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "summary", label: "Summary" },
  { key: "fingerprint", label: "Fingerprint" },
  { key: "audience", label: "Audience" },
  { key: "where", label: "Where" },
  { key: "channels", label: "Channels" },
  { key: "partners", label: "Partners" },
  { key: "messages", label: "Messages" },
  { key: "evidence", label: "Evidence" },
];

const DOMAIN_TITLES: Record<string, string> = {
  artist: "Artists",
  movie: "Films",
  tv_show: "TV shows",
  brand: "Brands",
  destination: "Places they like to visit",
  book: "Books",
  podcast: "Podcasts",
};

export function BriefTabs({ brief }: BriefTabsProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("summary");

  // Selection state for campaign creation
  const [selectedChannels, setSelectedChannels] = useState<string[]>(() => {
    // Default: select the top 2 ranked channels
    return brief.channels
      .filter((c) => c.priority !== null)
      .slice(0, 2)
      .map((c) => c.id);
  });

  const [selectedVariants, setSelectedVariants] = useState<
    Record<string, number>
  >({});

  // Evidence drawer state
  const [selectedCall, setSelectedCall] = useState<QlooCallRecord | null>(null);
  const [citedItems, setCitedItems] = useState<string[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Copy-to-clipboard state
  const [copiedVariant, setCopiedVariant] = useState<string | null>(null);

  const openDrawerForCall = (callId: string, items: string[] = []) => {
    const call = brief.evidence.calls.find((c) => c.id === callId);
    if (call) {
      setSelectedCall(call);
      setCitedItems(items);
      setDrawerOpen(true);
    }
  };

  const handleCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedVariant(id);
      setTimeout(() => setCopiedVariant(null), 2000);
    } catch {
      // Fallback
    }
  };

  const toggleChannel = (id: string) => {
    setSelectedChannels((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const displayedFingerprint = brief.fingerprint.filter((f) => f.displayed);
  const weakFingerprint = brief.fingerprint.filter((f) => !f.displayed);

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div
        role="tablist"
        aria-label="Brief sections"
        className="flex border-b border-zinc-200 overflow-x-auto no-scrollbar gap-1"
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={isActive}
              aria-controls={`panel-${tab.key}`}
              id={`tab-${tab.key}`}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                isActive
                  ? "border-zinc-900 text-zinc-950 font-semibold"
                  : "border-transparent text-zinc-500 hover:text-zinc-800 hover:border-zinc-300"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 1. Summary Tab */}
      {/* ------------------------------------------------------------------ */}
      {activeTab === "summary" && (
        <div
          role="tabpanel"
          id="panel-summary"
          aria-labelledby="tab-summary"
          className="space-y-6"
        >
          {/* Film Match Info */}
          <div className="flex items-center gap-2 flex-wrap text-sm">
            <span className="text-zinc-600">Matched film:</span>
            <span className="font-semibold text-zinc-950">
              {brief.film.title}
            </span>
            {brief.film.resolution === "alternate" && (
              <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">
                Alternate match
              </span>
            )}
          </div>

          {/* Written summary */}
          <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-5 shadow-xs space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Audience Summary
            </h3>
            <p className="text-base text-zinc-800 leading-relaxed font-sans">
              {brief.summary ?? "No written summary is available for this brief."}
            </p>
          </div>

          {/* Confidence Badge */}
          <div className="pt-1">
            <ConfidenceBadge
              level={brief.confidence.level}
              score={brief.confidence.score}
              max={brief.confidence.max}
              reasons={brief.confidence.reasons}
            />
          </div>

          {/* Limitations */}
          {brief.limitations.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900">
                Limitations
              </h4>
              <ul className="list-disc list-inside space-y-1 text-xs text-amber-950">
                {brief.limitations.map((lim, idx) => (
                  <li key={idx} className="font-mono">
                    {lim}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Action to create campaign */}
          <div className="pt-4 border-t border-zinc-200 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs text-zinc-500">
                {selectedChannels.length} channel
                {selectedChannels.length === 1 ? "" : "s"} selected on Channels tab
              </p>
              {selectedChannels.length === 0 && (
                <p className="text-xs text-amber-600 font-medium">
                  Select at least one channel first.
                </p>
              )}
            </div>

            <Link
              href={
                selectedChannels.length > 0
                  ? `/campaigns/new?briefId=${brief.id}&channels=${selectedChannels.join(",")}`
                  : "#"
              }
              aria-disabled={selectedChannels.length === 0}
              className={`rounded-lg px-4 py-2.5 text-sm font-semibold shadow-xs transition-colors ${
                selectedChannels.length > 0
                  ? "bg-zinc-900 text-white hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-950"
                  : "bg-zinc-200 text-zinc-400 cursor-not-allowed pointer-events-none"
              }`}
            >
              Create campaign
            </Link>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 2. Fingerprint Tab */}
      {/* ------------------------------------------------------------------ */}
      {activeTab === "fingerprint" && (
        <div
          role="tabpanel"
          id="panel-fingerprint"
          aria-labelledby="tab-fingerprint"
          className="space-y-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {displayedFingerprint.map((domainObj) => {
              const title =
                DOMAIN_TITLES[domainObj.domain] ?? domainObj.domain;

              return (
                <div
                  key={domainObj.domain}
                  className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs space-y-3"
                >
                  <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
                    <h3 className="font-semibold text-sm text-zinc-900">
                      {title}
                    </h3>
                    <button
                      type="button"
                      onClick={() =>
                        openDrawerForCall(
                          domainObj.callId,
                          domainObj.items.map((i) => i.name)
                        )
                      }
                      className="text-xs text-zinc-500 hover:text-zinc-900 underline font-mono"
                    >
                      Evidence ({domainObj.callId})
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {domainObj.items.map((item) => (
                      <div
                        key={item.entityId}
                        className="rounded-lg bg-zinc-50/80 p-2.5 text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-zinc-950">
                            {item.name}
                          </span>
                          <span className="text-zinc-500 font-mono">
                            {item.affinity !== null
                              ? `Affinity ${item.affinity.toFixed(2)}`
                              : "Related"}
                          </span>
                        </div>

                        {item.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {item.tags.slice(0, 4).map((t, idx) => (
                              <span
                                key={idx}
                                className="rounded bg-white px-1.5 py-0.5 text-[10px] text-zinc-600 ring-1 ring-inset ring-zinc-200"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        )}

                        <p className="text-zinc-600 italic text-[11px]">
                          {item.why}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Undisplayed domains (weak signal) */}
          {weakFingerprint.length > 0 && (
            <details className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <summary className="cursor-pointer text-xs font-semibold text-zinc-600 uppercase tracking-wide">
                Other results (weak signal) — {weakFingerprint.length} domains
              </summary>
              <div className="mt-3 space-y-3">
                {weakFingerprint.map((d) => (
                  <div key={d.domain} className="text-xs text-zinc-700">
                    <span className="font-semibold">
                      {DOMAIN_TITLES[d.domain] ?? d.domain}:
                    </span>{" "}
                    {d.items.map((i) => i.name).join(", ") || "None"}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 3. Audience Tab */}
      {/* ------------------------------------------------------------------ */}
      {activeTab === "audience" && (
        <div
          role="tabpanel"
          id="panel-audience"
          aria-labelledby="tab-audience"
          className="space-y-6"
        >
          {brief.audience ? (
            <div className="space-y-6">
              {/* Evidence Link */}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() =>
                    openDrawerForCall(brief.audience!.callId, [
                      "Age and gender demographics",
                    ])
                  }
                  className="text-xs text-zinc-500 hover:text-zinc-900 underline font-mono"
                >
                  Evidence ({brief.audience.callId})
                </button>
              </div>

              {/* Natural language skew lines */}
              <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-4 space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Audience Tendencies
                </h3>
                <ul className="space-y-1 list-disc list-inside text-sm text-zinc-800">
                  {brief.audience.lines.map((line, idx) => (
                    <li key={idx}>{line}</li>
                  ))}
                </ul>
              </div>

              {/* Age Skew Diverging Bars */}
              <div className="rounded-xl border border-zinc-200 bg-white p-5 space-y-4 shadow-xs">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Age Skew Distribution
                </h3>

                <div className="space-y-2.5">
                  {AGE_BANDS_ORDER.map((band) => {
                    const val = brief.audience!.age[band as AgeBand] ?? 0;
                    const clampedVal = Math.max(-1, Math.min(1, val));
                    const isPos = clampedVal >= 0;
                    const barWidth = Math.abs(clampedVal) * 50; // percentage of half width

                    return (
                      <div
                        key={band}
                        className="grid grid-cols-[140px_1fr_40px] items-center gap-3 text-xs"
                      >
                        <span className="text-zinc-700">
                          {AGE_LABELS[band as AgeBand]}
                        </span>

                        <div className="relative h-4 w-full bg-zinc-100 rounded flex items-center">
                          {/* Center line */}
                          <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-zinc-300" />

                          {isPos ? (
                            <div
                              className="h-full bg-emerald-600 rounded-r"
                              style={{
                                marginLeft: "50%",
                                width: `${barWidth}%`,
                              }}
                            />
                          ) : (
                            <div
                              className="h-full bg-amber-600 rounded-l"
                              style={{
                                marginRight: "50%",
                                marginLeft: `${50 - barWidth}%`,
                                width: `${barWidth}%`,
                              }}
                            />
                          )}
                        </div>

                        <span className="font-mono text-right text-zinc-600">
                          {val > 0 ? `+${val.toFixed(2)}` : val.toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Gender Skew */}
              <div className="rounded-xl border border-zinc-200 bg-white p-5 space-y-4 shadow-xs">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Gender Skew
                </h3>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="rounded-lg bg-zinc-50 p-3 flex justify-between items-center">
                    <span className="text-zinc-600">Male skew</span>
                    <span className="font-mono font-semibold text-zinc-900">
                      {brief.audience.gender.male > 0
                        ? `+${brief.audience.gender.male.toFixed(2)}`
                        : brief.audience.gender.male.toFixed(2)}
                    </span>
                  </div>
                  <div className="rounded-lg bg-zinc-50 p-3 flex justify-between items-center">
                    <span className="text-zinc-600">Female skew</span>
                    <span className="font-mono font-semibold text-zinc-900">
                      {brief.audience.gender.female > 0
                        ? `+${brief.audience.gender.female.toFixed(2)}`
                        : brief.audience.gender.female.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Footnote */}
              <p className="text-xs text-zinc-500 italic">
                Relative skews, not shares. Use as context, not as a reason to
                exclude anyone.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-8 text-center text-zinc-500 text-sm">
              Audience age and gender data was unavailable.
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 4. Where Tab */}
      {/* ------------------------------------------------------------------ */}
      {activeTab === "where" && (
        <div
          role="tabpanel"
          id="panel-where"
          aria-labelledby="tab-where"
          className="space-y-6"
        >
          <div className="flex items-center justify-between flex-wrap gap-2 text-xs text-zinc-500">
            <p className="italic">
              Shows where this film&apos;s taste is strong, not where people live.
            </p>
            {brief.geography.status === "ok" && (
              <button
                type="button"
                onClick={() => {
                  if (brief.geography.status === "ok") {
                    openDrawerForCall(brief.geography.callId, [
                      "Catchment Heatmap Cells",
                    ]);
                  }
                }}
                className="underline font-mono text-zinc-600"
              >
                Evidence ({brief.geography.callId})
              </button>
            )}
          </div>

          <div className="text-xs font-semibold text-zinc-700">
            Catchment radius: {brief.geography.radiusKm} km
          </div>

          {brief.geography.status === "ok" ? (
            <div className="space-y-3">
              <div className="text-xs text-zinc-500">
                Found {brief.geography.cellsInCatchment} cells in catchment (
                {brief.geography.cellsTotal} total cells).
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {brief.geography.hotspots.map((spot) => (
                  <div
                    key={spot.id}
                    className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-sm text-zinc-950">
                        {spot.label}
                      </span>
                      <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-mono text-zinc-700 shrink-0">
                        Score {spot.meanAffinityRank.toFixed(2)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs text-zinc-500">
                      <span>{spot.distanceKm.toFixed(1)} km from theater</span>
                      <span>{spot.cellCount} cells</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : brief.geography.status === "no_cells_in_catchment" ? (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-8 text-center text-zinc-600 text-sm">
              No high-affinity areas were found within {brief.geography.radiusKm}{" "}
              km of the theater. Try a larger radius.
            </div>
          ) : (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-8 text-center text-zinc-500 text-sm">
              Location data was unavailable for this run.
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 5. Channels Tab */}
      {/* ------------------------------------------------------------------ */}
      {activeTab === "channels" && (
        <div
          role="tabpanel"
          id="panel-channels"
          aria-labelledby="tab-channels"
          className="space-y-4"
        >
          <div className="text-xs text-zinc-500">
            Select channels to include in your campaign plan.
          </div>

          <div className="space-y-3">
            {brief.channels.map((chan) => {
              const isSelected = selectedChannels.includes(chan.id);

              return (
                <div
                  key={chan.id}
                  className={`rounded-xl border p-4 transition-all shadow-xs ${
                    isSelected
                      ? "border-zinc-900 bg-zinc-50/50"
                      : "border-zinc-200 bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <label className="flex items-center gap-2 cursor-pointer font-semibold text-sm text-zinc-950">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleChannel(chan.id)}
                            className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-950"
                          />
                          <span>{chan.title}</span>
                        </label>

                        {chan.priority !== null ? (
                          <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-600/20">
                            Priority {chan.priority}
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                            Unranked
                          </span>
                        )}

                        {chan.suggestedPartnerCategory && (
                          <span className="rounded bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800 ring-1 ring-inset ring-sky-600/20">
                            Category: {chan.suggestedPartnerCategory}
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-zinc-600 leading-relaxed">
                        {chan.rationale ??
                          "Generated from target domain interests."}
                      </p>

                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {chan.items.map((item, idx) => (
                          <span
                            key={idx}
                            className="rounded bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-700"
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>

                    {chan.evidenceCallIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          openDrawerForCall(
                            chan.evidenceCallIds[0]!,
                            chan.items
                          )
                        }
                        className="text-xs text-zinc-400 hover:text-zinc-700 underline font-mono shrink-0"
                      >
                        Evidence
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 6. Partners Tab */}
      {/* ------------------------------------------------------------------ */}
      {activeTab === "partners" && (
        <div
          role="tabpanel"
          id="panel-partners"
          aria-labelledby="tab-partners"
          className="space-y-6"
        >
          <p className="text-xs text-zinc-500 italic">
            Matches the category filter; some results are loose fits. Check
            before contacting.
          </p>

          <div className="space-y-6">
            {brief.partners.map((group) => (
              <div key={group.categoryKey} className="space-y-3">
                <div className="flex items-center justify-between border-b border-zinc-200 pb-2">
                  <h3 className="font-semibold text-sm text-zinc-950">
                    {group.categoryLabel}
                  </h3>
                  <button
                    type="button"
                    onClick={() =>
                      openDrawerForCall(
                        group.callId,
                        group.places.map((p) => p.name)
                      )
                    }
                    className="text-xs text-zinc-500 hover:text-zinc-900 underline font-mono"
                  >
                    Evidence ({group.callId})
                  </button>
                </div>

                {group.places.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {group.places.map((place) => (
                      <div
                        key={place.entityId}
                        className="rounded-xl border border-zinc-200 bg-white p-3.5 space-y-2 shadow-xs"
                      >
                        <div className="flex items-start justify-between gap-1">
                          <span className="font-semibold text-xs text-zinc-900">
                            {place.name}
                          </span>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] shrink-0 font-medium ${
                              place.fit === "name_matches"
                                ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20"
                                : "bg-zinc-100 text-zinc-600"
                            }`}
                          >
                            {place.fit === "name_matches"
                              ? "Name matches"
                              : "Check manually"}
                          </span>
                        </div>

                        {place.distanceKm !== null && (
                          <div className="text-[11px] text-zinc-500">
                            {place.distanceKm.toFixed(1)} km from theater
                          </div>
                        )}

                        {place.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {place.tags.map((t, idx) => (
                              <span
                                key={idx}
                                className="rounded bg-zinc-50 px-1.5 py-0.5 text-[10px] text-zinc-600"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500">
                    No {group.categoryLabel} results in {brief.show.city}.
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 7. Messages Tab */}
      {/* ------------------------------------------------------------------ */}
      {activeTab === "messages" && (
        <div
          role="tabpanel"
          id="panel-messages"
          aria-labelledby="tab-messages"
          className="space-y-6"
        >
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <p className="italic">
              Review and edit before sending. Messages are suggestions only.
            </p>
          </div>

          {brief.copy.length > 0 ? (
            <div className="space-y-6">
              {brief.copy.map((segCopy) => {
                const segInfo = brief.segments.find(
                  (s) => s.id === segCopy.segmentId
                );
                const segLabel = segInfo ? segInfo.label : segCopy.segmentId;

                return (
                  <div
                    key={segCopy.segmentId}
                    className="rounded-xl border border-zinc-200 bg-white p-5 space-y-3 shadow-xs"
                  >
                    <h3 className="font-semibold text-sm text-zinc-950">
                      Segment: {segLabel}
                    </h3>

                    <div className="space-y-3">
                      {segCopy.variants.map((variant, vIdx) => {
                        const variantId = `${segCopy.segmentId}_${vIdx}`;
                        const isChosen =
                          selectedVariants[segCopy.segmentId] === vIdx;

                        return (
                          <div
                            key={vIdx}
                            className={`rounded-lg border p-3.5 space-y-2 transition-all ${
                              isChosen
                                ? "border-zinc-900 bg-zinc-50/70"
                                : "border-zinc-200 bg-zinc-50/30"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <label className="flex items-start gap-2.5 cursor-pointer flex-1">
                                <input
                                  type="radio"
                                  name={`seg_${segCopy.segmentId}`}
                                  checked={isChosen}
                                  onChange={() =>
                                    setSelectedVariants((prev) => ({
                                      ...prev,
                                      [segCopy.segmentId]: vIdx,
                                    }))
                                  }
                                  className="mt-0.5 h-4 w-4 text-zinc-900 border-zinc-300 focus:ring-zinc-950"
                                />
                                <span className="text-sm text-zinc-800 leading-relaxed font-sans">
                                  {variant}
                                </span>
                              </label>

                              <button
                                type="button"
                                onClick={() => handleCopy(variant, variantId)}
                                className="shrink-0 rounded bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 shadow-xs ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50"
                              >
                                {copiedVariant === variantId
                                  ? "Copied!"
                                  : "Copy"}
                              </button>
                            </div>

                            <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono">
                              <span>Variant {vIdx + 1}</span>
                              <span>{variant.length} chars</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-8 text-center text-zinc-500 text-sm">
              Messages could not be generated for this brief.
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 8. Evidence Tab */}
      {/* ------------------------------------------------------------------ */}
      {activeTab === "evidence" && (
        <div
          role="tabpanel"
          id="panel-evidence"
          aria-labelledby="tab-evidence"
          className="space-y-4"
        >
          <div className="text-xs text-zinc-500">
            Audit trail of all Qloo taste graph and location calls for this run.
            Click any row to view full payload.
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-200 text-left text-xs font-mono">
                <thead className="bg-zinc-50 text-zinc-600">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Call ID</th>
                    <th className="px-3 py-2 font-semibold">Endpoint</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">Latency</th>
                    <th className="px-3 py-2 font-semibold">Cached</th>
                    <th className="px-3 py-2 font-semibold">Results</th>
                    <th className="px-3 py-2 font-semibold">Attempts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 bg-white">
                  {brief.evidence.calls.map((call) => (
                    <tr
                      key={call.id}
                      onClick={() => openDrawerForCall(call.id)}
                      className="cursor-pointer hover:bg-zinc-50 transition-colors"
                    >
                      <td className="px-3 py-2 font-semibold text-zinc-900">
                        {call.id}
                      </td>
                      <td className="px-3 py-2 text-zinc-600">
                        {call.endpoint}
                      </td>
                      <td className="px-3 py-2">
                        {call.status === 200 ? (
                          <span className="text-emerald-700 font-semibold">
                            200
                          </span>
                        ) : (
                          <span className="text-red-700 font-semibold flex items-center gap-1">
                            <span>⚠</span>
                            <span>{call.error?.code ?? call.status}</span>
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-zinc-600">
                        {call.latencyMs} ms
                      </td>
                      <td className="px-3 py-2">
                        {call.cached ? (
                          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px]">
                            yes
                          </span>
                        ) : (
                          <span className="text-zinc-400">no</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-zinc-700">
                        {call.resultCount}
                      </td>
                      <td className="px-3 py-2 text-zinc-600">
                        {call.attempts}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Global Evidence Slide-Over Drawer */}
      <EvidenceDrawer
        call={selectedCall}
        citedItems={citedItems}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
