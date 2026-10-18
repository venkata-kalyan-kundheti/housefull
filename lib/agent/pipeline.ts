/**
 * lib/agent/pipeline.ts
 *
 * Core TasteBrief agent pipeline orchestrating steps S0 through S12 (Section 10).
 */

import { createHash, randomUUID } from "node:crypto";
import { getConfig } from "@/lib/config";
import {
  getShowById,
  getBriefByHashAndMode,
  saveBrief,
  createRun,
  updateRun,
} from "@/lib/db/repo";
import { hoursUntil, now as getNow } from "@/lib/time/now";
import { Budget } from "@/lib/qloo/budget";
import {
  CallCounter,
  searchEntities,
  getDomainInsights,
  getHeatmap,
  getDemographics,
  getPlaces,
} from "@/lib/qloo/client";
import {
  CORE_DOMAINS,
  OPTIONAL_DOMAINS,
  type Domain,
  type QlooContext,
  type QlooCallRecord,
  type CompactPlace,
} from "@/lib/qloo/types";
import { resolveFilm } from "@/lib/domain/resolveFilm";
import { buildFingerprint, type FingerprintDomain } from "@/lib/domain/fingerprint";
import { describeSkew } from "@/lib/domain/demographics";
import { buildHotspots, type HotspotResult } from "@/lib/domain/geo";
import {
  PARTNER_CATEGORIES,
  assessPartners,
  type PartnerCategoryKey,
} from "@/lib/domain/partners";
import {
  generateChannelCandidates,
  collectPartnerCategories,
  type ChannelCandidate,
} from "@/lib/domain/channels";
import { generateSegments, type Segment } from "@/lib/domain/segments";
import { computeConfidence } from "@/lib/domain/confidence";
import { GeminiLlmClient } from "@/lib/llm/gemini";
import type { LlmClient } from "@/lib/llm/types";
import {
  SYSTEM_PROMPT,
  buildPlannerPrompt,
  buildChannelsPrompt,
  buildCopyPrompt,
  buildSummaryPrompt,
} from "@/lib/llm/prompts";
import {
  PlannerOut,
  ChannelsOut,
  CopyOut,
  SummaryOut,
} from "@/lib/llm/schemas";
import {
  validateChannelsOutput,
  validateCopyOutput,
  validateSummaryOutput,
} from "@/lib/validate/validator";
import { TraceEmitter, type TraceEvent } from "./trace";
import type {
  TasteBrief,
  RunInput,
  TasteBriefPartnerGroup,
  TasteBriefLlmCall,
} from "./briefTypes";
import {
  NotFoundError,
  ConflictError,
  PipelineError,
} from "@/lib/errors";


export const PIPELINE_VERSION = 1;
export const INCLUDE_CINEMA_PEERS = false;
export const RUN_TIMEOUT_MS = 50_000;
export const LLM_TIMEOUT_MS = 20_000;

export const ALL_DOMAINS: readonly Domain[] = [
  ...CORE_DOMAINS,
  ...OPTIONAL_DOMAINS,
];

const DOMAIN_SORT_ORDER: Record<Domain, number> = {
  artist: 0,
  movie: 1,
  tv_show: 2,
  brand: 3,
  destination: 4,
  book: 5,
  podcast: 6,
};

export interface PipelineOptions {
  qlooContext?: Partial<QlooContext>;
  llmClient?: LlmClient;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

/**
 * Computes deterministic input hash (Section 10.2).
 */
export function computeInputHash(params: {
  showId: string;
  filmEntityIdOverride?: string;
  radiusKm: number;
  pipelineVersion: number;
  includeCinemaPeers: boolean;
}): string {
  const payload = {
    showId: params.showId,
    filmEntityIdOverride: params.filmEntityIdOverride ?? null,
    radiusKm: params.radiusKm,
    pipelineVersion: params.pipelineVersion,
    includeCinemaPeers: params.includeCinemaPeers,
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

/**
 * Builds the allowedNames whitelist for V3 known-name validation (Section 12.2).
 */
export function buildAllowedNames(params: {
  filmTitle: string;
  theaterName: string;
  city: string;
  fingerprint: FingerprintDomain[];
  channels: Array<{ title: string }>;
  segments: Segment[];
  partnerGroups: TasteBriefPartnerGroup[];
  hotspotResult: HotspotResult;
  allowedTokens: string[];
}): string[] {
  const set = new Set<string>();

  const add = (s?: string | null) => {
    if (s && s.trim()) set.add(s.trim().toLowerCase());
  };

  add(params.filmTitle);
  add(params.theaterName);
  add(params.city);

  for (const f of params.fingerprint) {
    if (f.displayed) {
      for (const item of f.items) {
        add(item.name);
      }
    }
  }

  for (const c of params.channels) {
    add(c.title);
  }

  for (const seg of params.segments) {
    add(seg.label);
  }

  for (const g of params.partnerGroups) {
    for (const p of g.places) {
      add(p.name);
    }
  }

  if (params.hotspotResult.status === "ok") {
    for (const h of params.hotspotResult.hotspots) {
      add(h.label);
      const short = h.label.split("(")[0]?.trim();
      add(short);
    }
  }

  for (const token of params.allowedTokens) {
    add(token);
    for (const word of token.split(/\s+/)) {
      add(word);
    }
  }

  return Array.from(set);
}

/**
 * Executes the full agent pipeline.
 */
export async function runPipeline(
  input: RunInput,
  emitter: TraceEmitter,
  options?: PipelineOptions
): Promise<TasteBrief> {
  const config = getConfig();
  const startTime = Date.now();
  const runId = randomUUID();
  const signal = options?.signal;

  const checkTimeoutOrAbort = (): boolean => {
    if (signal?.aborted) return true;
    return Date.now() - startTime >= RUN_TIMEOUT_MS;
  };

  const mode = config.APP_MODE;
  const radiusKm = input.radiusKm ?? config.CATCHMENT_RADIUS_KM;

  emitter.emit({
    type: "run.started",
    runId,
    showId: input.showId,
    at: new Date().toISOString(),
  });

  // Track run in DB (non-blocking / best-effort)
  try {
    await createRun({ id: runId, showId: input.showId, status: "running" });
  } catch {
    // Non-fatal if runs table insert fails
  }

  const failRun = async (
    code:
      | "SHOW_NOT_FOUND"
      | "SHOW_ALREADY_STARTED"
      | "FILM_UNRESOLVED"
      | "QLOO_UNAVAILABLE",
    message: string,
    alternates?: { name: string; entityId: string }[]
  ): Promise<never> => {
    emitter.emit({
      type: "run.failed",
      code,
      message,
      alternates,
    });
    try {
      await updateRun(runId, {
        status: "failed",
        errorCode: code,
        events: emitter.getEvents(),
      });
    } catch {
      // Ignore
    }
    if (code === "SHOW_NOT_FOUND") {
      throw new NotFoundError("SHOW_NOT_FOUND", message);
    }
    if (code === "SHOW_ALREADY_STARTED") {
      throw new ConflictError(message);
    }
    throw new PipelineError(code, message, alternates);
  };

  // ---------------------------------------------------------------------------
  // S0: Load show and gate
  // ---------------------------------------------------------------------------
  const show = await getShowById(input.showId);
  if (!show) {
    return failRun("SHOW_NOT_FOUND", `Show "${input.showId}" not found`);
  }

  const currentNow = getNow();
  const hoursToStart = hoursUntil(show.startsAtIso, currentNow);
  if (hoursToStart <= 0) {
    return failRun(
      "SHOW_ALREADY_STARTED",
      `Show "${input.showId}" has already started (${hoursToStart.toFixed(1)}h)`
    );
  }

  const inputHash = computeInputHash({
    showId: input.showId,
    filmEntityIdOverride: input.filmEntityIdOverride,
    radiusKm,
    pipelineVersion: PIPELINE_VERSION,
    includeCinemaPeers: INCLUDE_CINEMA_PEERS,
  });

  if (!input.force) {
    const cached = await getBriefByHashAndMode(input.showId, inputHash, mode);
    if (cached) {
      emitter.emit({
        type: "brief.ready",
        briefId: cached.id,
        fromCache: true,
      });
      try {
        await updateRun(runId, {
          status: "finished",
          events: emitter.getEvents(),
        });
      } catch {
        // Ignore
      }
      return cached.content as TasteBrief;
    }
  }

  // Set up Qloo context & LLM client
  const callCounter = new CallCounter();
  const budgetTracker = new Budget(config.QLOO_BUDGET_PER_BRIEF);
  const qlooCallsMap = new Map<string, QlooCallRecord>();

  const qlooCtx: QlooContext = {
    runId,
    budget: budgetTracker,
    mode,
    callCounter,
    trace: {
      emit: (event) => emitter.emit(event as TraceEvent),
    },
    ...options?.qlooContext,
  };

  const llmClient =
    options?.llmClient ??
    new GeminiLlmClient({
      model: config.LLM_MODEL,
    });

  const limitations: string[] = [];
  const addLimitation = (lim: string) => {
    if (!limitations.includes(lim)) {
      limitations.push(lim);
    }
  };

  const llmCalls: TasteBriefLlmCall[] = [];

  // ---------------------------------------------------------------------------
  // S1: Resolve film
  // ---------------------------------------------------------------------------
  emitter.emitStepStarted("resolve_film");

  let filmChosenEntityId: string;
  let filmChosenTitle: string = show.filmTitle;
  let filmResolution: "exact" | "alternate" = "exact";
  let filmAlternates: { name: string; entityId: string }[] = [];
  let filmWarnings: string[] = [];

  if (input.filmEntityIdOverride) {
    filmChosenEntityId = input.filmEntityIdOverride;
    filmResolution = "exact";
    filmWarnings.push("manager_override");
  } else {
    const searchRes = await searchEntities(qlooCtx, show.filmTitle, {
      take: 10,
      fetchImpl: options?.fetchImpl,
    });
    if (searchRes.call) qlooCallsMap.set(searchRes.call.id, searchRes.call);

    if (!searchRes.ok) {
      return failRun(
        "QLOO_UNAVAILABLE",
        `Qloo search failed: ${searchRes.error.message}`
      );
    }

    const resolved = resolveFilm({ title: show.filmTitle }, searchRes.data);
    if (resolved.resolution === "unresolved") {
      const topAlternates = resolved.alternates.slice(0, 5).map((a) => ({
        name: a.name,
        entityId: a.entityId,
      }));
      return failRun(
        "FILM_UNRESOLVED",
        `Could not resolve film "${show.filmTitle}"`,
        topAlternates
      );
    }

    filmChosenEntityId = resolved.chosen.entityId;
    filmChosenTitle = resolved.chosen.name;
    filmResolution = resolved.resolution;
    filmWarnings = resolved.warnings;
    filmAlternates = resolved.alternates.slice(0, 5).map((a) => ({
      name: a.name,
      entityId: a.entityId,
    }));

    if (filmResolution === "alternate") {
      addLimitation("L_FILM_ALTERNATE");
    }
  }

  emitter.emitStepFinished(
    "resolve_film",
    `Film resolved as ${filmResolution} (${filmChosenEntityId})`
  );

  // ---------------------------------------------------------------------------
  // S2: Fan-out: 7 domains, heatmap, demographics (9 parallel calls)
  // ---------------------------------------------------------------------------
  emitter.emitStepStarted("fan_out");

  const [
    artistRes,
    brandRes,
    movieRes,
    tvShowRes,
    destRes,
    bookRes,
    podcastRes,
    heatmapRes,
    demoRes,
  ] = await Promise.all([
    getDomainInsights(qlooCtx, "artist", filmChosenEntityId, {
      take: 10,
      fetchImpl: options?.fetchImpl,
    }),
    getDomainInsights(qlooCtx, "brand", filmChosenEntityId, {
      take: 10,
      fetchImpl: options?.fetchImpl,
    }),
    getDomainInsights(qlooCtx, "movie", filmChosenEntityId, {
      take: 10,
      fetchImpl: options?.fetchImpl,
    }),
    getDomainInsights(qlooCtx, "tv_show", filmChosenEntityId, {
      take: 10,
      fetchImpl: options?.fetchImpl,
    }),
    getDomainInsights(qlooCtx, "destination", filmChosenEntityId, {
      take: 10,
      fetchImpl: options?.fetchImpl,
    }),
    getDomainInsights(qlooCtx, "book", filmChosenEntityId, {
      take: 10,
      fetchImpl: options?.fetchImpl,
    }),
    getDomainInsights(qlooCtx, "podcast", filmChosenEntityId, {
      take: 10,
      fetchImpl: options?.fetchImpl,
    }),
    getHeatmap(qlooCtx, {
      filmEntityId: filmChosenEntityId,
      city: show.city,
      fetchImpl: options?.fetchImpl,
    }),
    getDemographics(qlooCtx, {
      filmEntityId: filmChosenEntityId,
      city: show.city,
      fetchImpl: options?.fetchImpl,
    }),
  ]);

  const domainCallResults: Array<{
    domain: Domain;
    res: typeof artistRes;
  }> = [
    { domain: "artist", res: artistRes },
    { domain: "brand", res: brandRes },
    { domain: "movie", res: movieRes },
    { domain: "tv_show", res: tvShowRes },
    { domain: "destination", res: destRes },
    { domain: "book", res: bookRes },
    { domain: "podcast", res: podcastRes },
  ];

  let successfulFanoutCount = 0;

  for (const { domain, res } of domainCallResults) {
    if (res.call) qlooCallsMap.set(res.call.id, res.call);
    if (!res.ok || res.data.length === 0) {
      addLimitation(`L_DOMAIN_MISSING:${domain}`);
    } else {
      successfulFanoutCount++;
    }
  }

  if (heatmapRes.call) qlooCallsMap.set(heatmapRes.call.id, heatmapRes.call);
  if (heatmapRes.ok && heatmapRes.data.length > 0) {
    successfulFanoutCount++;
  }

  if (demoRes.call) qlooCallsMap.set(demoRes.call.id, demoRes.call);
  if (demoRes.ok && demoRes.data !== null) {
    successfulFanoutCount++;
  }

  // If heatmap and all seven domain calls fail, stop with QLOO_UNAVAILABLE
  const allDomainsFailed = domainCallResults.every(
    (d) => !d.res.ok || d.res.data.length === 0
  );
  if (allDomainsFailed && (!heatmapRes.ok || heatmapRes.data.length === 0)) {
    return failRun(
      "QLOO_UNAVAILABLE",
      "Qloo taste graph and heatmap calls returned no data"
    );
  }

  emitter.emitStepFinished(
    "fan_out",
    `${successfulFanoutCount} of 9 calls returned data`
  );

  // ---------------------------------------------------------------------------
  // S3: Derive (pure code)
  // ---------------------------------------------------------------------------
  emitter.emitStepStarted("derive");

  // 1. Build fingerprint
  const rawFingerprints: FingerprintDomain[] = [];
  for (const { domain, res } of domainCallResults) {
    if (res.ok && res.data.length > 0) {
      rawFingerprints.push(
        buildFingerprint({
          domain,
          entities: res.data,
          callId: res.call.id,
        })
      );
    }
  }

  // Sort: displayed first in DOMAIN_SORT_ORDER, then non-displayed in DOMAIN_SORT_ORDER
  rawFingerprints.sort((a, b) => {
    if (a.displayed !== b.displayed) {
      return a.displayed ? -1 : 1;
    }
    return DOMAIN_SORT_ORDER[a.domain] - DOMAIN_SORT_ORDER[b.domain];
  });

  // 2. Demographics skew
  let audience: TasteBrief["audience"] = null;
  if (demoRes.ok && demoRes.data) {
    const lines = describeSkew(demoRes.data);
    audience = {
      age: demoRes.data.age,
      gender: demoRes.data.gender,
      lines,
      callId: demoRes.call.id,
    };
  } else {
    addLimitation("L_DEMO_MISSING");
  }

  // 3. Hotspots
  let hotspotResult: HotspotResult;
  let geography: TasteBrief["geography"];

  if (heatmapRes.ok && heatmapRes.data.length > 0) {
    hotspotResult = buildHotspots({
      cells: heatmapRes.data,
      theater: show.theater,
      radiusKm,
    });
    if (hotspotResult.status === "ok") {
      geography = {
        status: "ok",
        radiusKm,
        theaterLat: show.theater.lat,
        theaterLon: show.theater.lon,
        precisionUsed: hotspotResult.precisionUsed,
        cellsInCatchment: hotspotResult.cellsInCatchment,
        cellsTotal: hotspotResult.cellsTotal,
        hotspots: hotspotResult.hotspots,
        callId: heatmapRes.call.id,
      };
    } else {
      geography = {
        status: "no_cells_in_catchment",
        radiusKm,
        cellsTotal:
          "cellsTotal" in hotspotResult ? hotspotResult.cellsTotal : undefined,
      };
      addLimitation("L_GEO_EMPTY");
    }
  } else {
    hotspotResult = { status: "unavailable" };
    geography = {
      status: "unavailable",
      radiusKm,
    };
    addLimitation("L_GEO_UNAVAILABLE");
  }


  // 4. Candidates & Segments & Partner categories
  const candidates = generateChannelCandidates({
    fingerprint: rawFingerprints,
    hotspots: hotspotResult,
    heatmapCallId: heatmapRes.ok ? heatmapRes.call.id : undefined,
  });

  const segments = generateSegments({
    fingerprint: rawFingerprints,
    hotspots: hotspotResult,
  });

  let partnerCategoryKeys: PartnerCategoryKey[] = collectPartnerCategories(
    candidates,
    { includeCinemaPeers: INCLUDE_CINEMA_PEERS }
  );

  emitter.emitStepFinished(
    "derive",
    `Derived fingerprint (${rawFingerprints.length} domains), ${candidates.length} channels, ${segments.length} segments`
  );

  // ---------------------------------------------------------------------------
  // S4: Plan (optional LLM)
  // ---------------------------------------------------------------------------
  emitter.emitStepStarted("plan");

  if (!checkTimeoutOrAbort()) {
    const topInterests: string[] = [];
    for (const f of rawFingerprints) {
      if (f.displayed) {
        for (const item of f.items.slice(0, 2)) {
          topInterests.push(item.name);
          if (topInterests.length === 5) break;
        }
      }
      if (topInterests.length === 5) break;
    }

    const plannerPrompt = buildPlannerPrompt({
      filmTitle: filmChosenTitle,
      topInterests,
      alreadyPlanned: partnerCategoryKeys,
    });

    const planRes = await llmClient.generateJson({
      purpose: "planner",
      system: SYSTEM_PROMPT,
      user: plannerPrompt,
      schema: PlannerOut,
      maxOutputTokens: 250,
      timeoutMs: LLM_TIMEOUT_MS,
    });

    llmCalls.push({
      purpose: "planner",
      latencyMs: planRes.latencyMs,
      ok: planRes.ok,
    });

    emitter.emit({
      type: "llm.call",
      purpose: "planner",
      ok: planRes.ok,
      latencyMs: planRes.latencyMs,
    });

    if (planRes.ok && planRes.data.actions) {
      for (const act of planRes.data.actions) {
        if (
          act.tool === "find_partners" &&
          !partnerCategoryKeys.includes(act.category) &&
          partnerCategoryKeys.length < 4
        ) {
          partnerCategoryKeys.push(act.category);
        }
      }
    }
  }

  // Cap at 4 partner categories
  partnerCategoryKeys = partnerCategoryKeys.slice(0, 4);

  emitter.emitStepFinished(
    "plan",
    `Targeting ${partnerCategoryKeys.length} partner categories`
  );

  // ---------------------------------------------------------------------------
  // S5: Partners
  // ---------------------------------------------------------------------------
  emitter.emitStepStarted("partners");

  const partnerGroups: TasteBriefPartnerGroup[] = [];
  let totalPlacesFound = 0;

  if (partnerCategoryKeys.length > 0 && !checkTimeoutOrAbort()) {
    const partnerCalls = await Promise.all(
      partnerCategoryKeys.map(async (key) => {
        const cat = PARTNER_CATEGORIES.find((c) => c.key === key);
        if (!cat) return null;

        const res = await getPlaces(qlooCtx, {
          categoryTag: cat.tag,
          city: show.city,
          filmEntityId: filmChosenEntityId,
          take: 8,
          fetchImpl: options?.fetchImpl,
        });

        if (res.call) qlooCallsMap.set(res.call.id, res.call);

        let places: CompactPlace[] = [];
        if (res.ok) {
          places = res.data;
        }

        const assessed = assessPartners(places, cat, show.theater);
        return {
          categoryKey: cat.key,
          categoryLabel: cat.label,
          callId: res.call.id,
          places: assessed,
        };
      })
    );

    for (const g of partnerCalls) {
      if (g) {
        partnerGroups.push(g);
        totalPlacesFound += g.places.length;
      }
    }
  }

  if (partnerGroups.length === 0 || totalPlacesFound === 0) {
    addLimitation("L_PARTNERS_NONE");
  }

  emitter.emitStepFinished(
    "partners",
    `Found ${totalPlacesFound} partner places across ${partnerGroups.length} categories`
  );

  // ---------------------------------------------------------------------------
  // S6, S7, S8: Rank channels, Copy, Summary (Parallel LLM calls)
  // ---------------------------------------------------------------------------
  emitter.emitStepStarted("compose");

  const allowedTokens: string[] = [show.startsAtLocal];
  const allowedNames = buildAllowedNames({
    filmTitle: filmChosenTitle,
    theaterName: show.theaterName,
    city: show.city,
    fingerprint: rawFingerprints,
    channels: candidates,
    segments,
    partnerGroups,
    hotspotResult,
    allowedTokens,
  });

  const timedOut = checkTimeoutOrAbort();
  if (timedOut) {
    addLimitation("L_TIMEOUT");
  }

  let rankedChannelsResult: Array<{
    id: string;
    priority: number | null;
    rationale: string | null;
  }> = candidates.map((c) => ({
    id: c.id,
    priority: null,
    rationale: null,
  }));

  let copyResult: Array<{ segmentId: string; variants: [string, string, string] }> = [];
  let summaryResult: string | null = null;

  if (!timedOut) {
    const candidateIds = candidates.map((c) => c.id);
    const segmentIds = segments.map((s) => s.id);

    // Prepare inputs
    const channelsPromptInput = {
      filmTitle: filmChosenTitle,
      theaterName: show.theaterName,
      city: show.city,
      candidates: candidates.map((c) => ({
        id: c.id,
        type: c.type,
        title: c.title,
        items: c.items,
        evidenceCallIds: c.evidenceCallIds,
      })),
    };

    const copyPromptInput = {
      filmTitle: filmChosenTitle,
      theaterName: show.theaterName,
      showtimeText: show.startsAtLocal,
      offerText: null,
      allowedTokens,
      segments: segments.map((s) => {
        let interests: string[] = [];
        if (s.id === "s_music") {
          const dom = rawFingerprints.find((f) => f.domain === "artist");
          interests = dom ? dom.items.slice(0, 3).map((i) => i.name) : [];
        } else if (s.id === "s_screen") {
          const m = rawFingerprints.find((f) => f.domain === "movie");
          const tv = rawFingerprints.find((f) => f.domain === "tv_show");
          interests = [
            ...(m ? m.items.map((i) => i.name) : []),
            ...(tv ? tv.items.map((i) => i.name) : []),
          ].slice(0, 3);
        } else if (s.id === "s_taste") {
          const b = rawFingerprints.find((f) => f.domain === "brand");
          const d = rawFingerprints.find((f) => f.domain === "destination");
          interests = [
            ...(b ? b.items.map((i) => i.name) : []),
            ...(d ? d.items.map((i) => i.name) : []),
          ].slice(0, 3);
        } else if (s.id === "s_local" && geography.status === "ok") {
          const topH = geography.hotspots[0];
          interests = topH ? [topH.label.split("(")[0]?.trim() ?? topH.label] : [];
        }
        return {
          segmentId: s.id,
          label: s.label,
          interests,
        };
      }),
    };

    const topInterestsList: string[] = [];
    for (const f of rawFingerprints) {
      if (f.displayed) {
        for (const item of f.items.slice(0, 2)) {
          topInterestsList.push(item.name);
          if (topInterestsList.length === 5) break;
        }
      }
      if (topInterestsList.length === 5) break;
    }

    const summaryPromptInput = {
      filmTitle: filmChosenTitle,
      city: show.city,
      topInterests: topInterestsList,
      topAreaLabel:
        geography.status === "ok" && geography.hotspots[0]
          ? geography.hotspots[0].label
          : null,
      skewLines: audience?.lines ?? [],
      confidenceLevel: "medium", // provisional
      limitations,
    };

    const [chRes, cpRes, smRes] = await Promise.all([
      llmClient.generateJson({
        purpose: "channels",
        system: SYSTEM_PROMPT,
        user: buildChannelsPrompt(channelsPromptInput),
        schema: ChannelsOut,
        maxOutputTokens: 600,
        timeoutMs: LLM_TIMEOUT_MS,
      }),
      llmClient.generateJson({
        purpose: "copy",
        system: SYSTEM_PROMPT,
        user: buildCopyPrompt(copyPromptInput),
        schema: CopyOut,
        maxOutputTokens: 900,
        timeoutMs: LLM_TIMEOUT_MS,
      }),
      llmClient.generateJson({
        purpose: "summary",
        system: SYSTEM_PROMPT,
        user: buildSummaryPrompt(summaryPromptInput),
        schema: SummaryOut,
        maxOutputTokens: 400,
        timeoutMs: LLM_TIMEOUT_MS,
      }),
    ]);

    llmCalls.push(
      { purpose: "channels", latencyMs: chRes.latencyMs, ok: chRes.ok },
      { purpose: "copy", latencyMs: cpRes.latencyMs, ok: cpRes.ok },
      { purpose: "summary", latencyMs: smRes.latencyMs, ok: smRes.ok }
    );

    emitter.emit({
      type: "llm.call",
      purpose: "channels",
      ok: chRes.ok,
      latencyMs: chRes.latencyMs,
    });
    emitter.emit({
      type: "llm.call",
      purpose: "copy",
      ok: cpRes.ok,
      latencyMs: cpRes.latencyMs,
    });
    emitter.emit({
      type: "llm.call",
      purpose: "summary",
      ok: smRes.ok,
      latencyMs: smRes.latencyMs,
    });

    // -------------------------------------------------------------------------
    // S10: Validate & Regenerate-once (Section 12)
    // -------------------------------------------------------------------------
    emitter.emitStepStarted("validate");

    // --- Validate Channels ---
    if (!chRes.ok) {
      addLimitation("L_LLM_PART:channels");
    } else {
      const issues = validateChannelsOutput(chRes.data, candidateIds, allowedNames);
      const hasError = issues.some((i) => i.severity === "error");
      const regenIssues = issues.filter((i) => i.severity === "regenerate-once");

      if (hasError) {
        addLimitation("L_LLM_PART:channels");
        emitter.emit({
          type: "validation.result",
          part: "channels",
          violations: issues.map((i) => i.message),
          regenerated: false,
        });
      } else if (regenIssues.length > 0) {
        // Regenerate once with feedback
        const feedbackPrompt = `${buildChannelsPrompt(channelsPromptInput)}\n\nFix these problems and return the full JSON again: ${regenIssues.map((i) => `${i.rule}: ${(i.snippet ?? i.message).slice(0, 60)}`).join("; ")}`;
        const retryRes = await llmClient.generateJson({
          purpose: "channels",
          system: SYSTEM_PROMPT,
          user: feedbackPrompt,
          schema: ChannelsOut,
          maxOutputTokens: 600,
          timeoutMs: LLM_TIMEOUT_MS,
        });

        llmCalls.push({
          purpose: "channels_retry",
          latencyMs: retryRes.latencyMs,
          ok: retryRes.ok,
        });

        if (retryRes.ok) {
          const retryIssues = validateChannelsOutput(
            retryRes.data,
            candidateIds,
            allowedNames
          );
          if (retryIssues.length === 0) {
            emitter.emit({
              type: "validation.result",
              part: "channels",
              violations: [],
              regenerated: true,
            });
            rankedChannelsResult = processChannelsOutput(
              retryRes.data,
              candidates
            );
          } else {
            addLimitation("L_LLM_PART:channels");
            addLimitation("L_TEXT_REMOVED");
            emitter.emit({
              type: "validation.result",
              part: "channels",
              violations: retryIssues.map((i) => i.message),
              regenerated: true,
            });
          }
        } else {
          addLimitation("L_LLM_PART:channels");
          addLimitation("L_TEXT_REMOVED");
        }
      } else {
        emitter.emit({
          type: "validation.result",
          part: "channels",
          violations: [],
          regenerated: false,
        });
        rankedChannelsResult = processChannelsOutput(chRes.data, candidates);
      }
    }

    // --- Validate Copy ---
    if (!cpRes.ok) {
      addLimitation("L_LLM_PART:copy");
    } else {
      const issues = validateCopyOutput(
        cpRes.data,
        segmentIds,
        allowedNames,
        allowedTokens,
        filmChosenTitle,
        show.startsAtLocal
      );
      const hasError = issues.some((i) => i.severity === "error");
      const regenIssues = issues.filter((i) => i.severity === "regenerate-once");

      if (hasError) {
        addLimitation("L_LLM_PART:copy");
        emitter.emit({
          type: "validation.result",
          part: "copy",
          violations: issues.map((i) => i.message),
          regenerated: false,
        });
      } else if (regenIssues.length > 0) {
        const feedbackPrompt = `${buildCopyPrompt(copyPromptInput)}\n\nFix these problems and return the full JSON again: ${regenIssues.map((i) => `${i.rule}: ${(i.snippet ?? i.message).slice(0, 60)}`).join("; ")}`;
        const retryRes = await llmClient.generateJson({
          purpose: "copy",
          system: SYSTEM_PROMPT,
          user: feedbackPrompt,
          schema: CopyOut,
          maxOutputTokens: 900,
          timeoutMs: LLM_TIMEOUT_MS,
        });

        llmCalls.push({
          purpose: "copy_retry",
          latencyMs: retryRes.latencyMs,
          ok: retryRes.ok,
        });

        if (retryRes.ok) {
          const retryIssues = validateCopyOutput(
            retryRes.data,
            segmentIds,
            allowedNames,
            allowedTokens,
            filmChosenTitle,
            show.startsAtLocal
          );
          if (retryIssues.filter((i) => i.severity !== "warn").length === 0) {
            emitter.emit({
              type: "validation.result",
              part: "copy",
              violations: retryIssues.map((i) => i.message),
              regenerated: true,
            });
            copyResult = retryRes.data.segments.map((s) => ({
              segmentId: s.segmentId,
              variants: [s.variants[0]!, s.variants[1]!, s.variants[2]!],
            }));
          } else {
            addLimitation("L_LLM_PART:copy");
            addLimitation("L_TEXT_REMOVED");
            emitter.emit({
              type: "validation.result",
              part: "copy",
              violations: retryIssues.map((i) => i.message),
              regenerated: true,
            });
          }
        } else {
          addLimitation("L_LLM_PART:copy");
          addLimitation("L_TEXT_REMOVED");
        }
      } else {
        emitter.emit({
          type: "validation.result",
          part: "copy",
          violations: issues.map((i) => i.message),
          regenerated: false,
        });
        copyResult = cpRes.data.segments.map((s) => ({
          segmentId: s.segmentId,
          variants: [s.variants[0]!, s.variants[1]!, s.variants[2]!],
        }));
      }
    }

    // --- Validate Summary ---
    if (!smRes.ok) {
      addLimitation("L_LLM_PART:summary");
    } else {
      const issues = validateSummaryOutput(smRes.data.summary, allowedNames);
      const regenIssues = issues.filter((i) => i.severity === "regenerate-once");

      if (regenIssues.length > 0) {
        const feedbackPrompt = `${buildSummaryPrompt(summaryPromptInput)}\n\nFix these problems and return the full JSON again: ${regenIssues.map((i) => `${i.rule}: ${(i.snippet ?? i.message).slice(0, 60)}`).join("; ")}`;
        const retryRes = await llmClient.generateJson({
          purpose: "summary",
          system: SYSTEM_PROMPT,
          user: feedbackPrompt,
          schema: SummaryOut,
          maxOutputTokens: 400,
          timeoutMs: LLM_TIMEOUT_MS,
        });

        llmCalls.push({
          purpose: "summary_retry",
          latencyMs: retryRes.latencyMs,
          ok: retryRes.ok,
        });

        if (retryRes.ok) {
          const retryIssues = validateSummaryOutput(
            retryRes.data.summary,
            allowedNames
          );
          if (retryIssues.length === 0) {
            emitter.emit({
              type: "validation.result",
              part: "summary",
              violations: [],
              regenerated: true,
            });
            summaryResult = retryRes.data.summary;
          } else {
            addLimitation("L_LLM_PART:summary");
            addLimitation("L_TEXT_REMOVED");
            emitter.emit({
              type: "validation.result",
              part: "summary",
              violations: retryIssues.map((i) => i.message),
              regenerated: true,
            });
          }
        } else {
          addLimitation("L_LLM_PART:summary");
          addLimitation("L_TEXT_REMOVED");
        }
      } else {
        emitter.emit({
          type: "validation.result",
          part: "summary",
          violations: [],
          regenerated: false,
        });
        summaryResult = smRes.data.summary;
      }
    }

    emitter.emitStepFinished("validate", "Validated LLM outputs");
  } else {
    addLimitation("L_LLM_PART:channels");
    addLimitation("L_LLM_PART:copy");
    addLimitation("L_LLM_PART:summary");
  }

  emitter.emitStepFinished("compose", "Composed channels, copy, and summary");

  // ---------------------------------------------------------------------------
  // S9: Assemble TasteBrief channels
  // ---------------------------------------------------------------------------
  const rankedMap = new Map<
    string,
    { priority: number | null; rationale: string | null }
  >();
  for (const r of rankedChannelsResult) {
    rankedMap.set(r.id, r);
  }

  const finalChannels = candidates.map((cand) => {
    const rankInfo = rankedMap.get(cand.id);
    return {
      id: cand.id,
      type: cand.type,
      title: cand.title,
      items: cand.items,
      priority: rankInfo?.priority ?? null,
      rationale: rankInfo?.rationale ?? null,
      evidenceCallIds: cand.evidenceCallIds.filter((cid) =>
        qlooCallsMap.has(cid)
      ),
      suggestedPartnerCategory: cand.suggestedPartnerCategory,
    };
  });

  // Sort channels: ranked first (priority ascending), then unranked
  finalChannels.sort((a, b) => {
    if (a.priority !== null && b.priority !== null) {
      return a.priority - b.priority;
    }
    if (a.priority !== null && b.priority === null) return -1;
    if (a.priority === null && b.priority !== null) return 1;
    return 0; // retain rulebook order
  });

  // ---------------------------------------------------------------------------
  // S11: Score confidence
  // ---------------------------------------------------------------------------
  emitter.emitStepStarted("score");

  const coreDomainsWithData = rawFingerprints.filter(
    (f) =>
      (CORE_DOMAINS as readonly string[]).includes(f.domain) &&
      f.items.filter((i) => i.affinity !== null).length >= 3
  ).length;

  const geographyOk = geography.status === "ok";
  const demographicsOk = audience !== null;
  const anyPartners = partnerGroups.some((g) => g.places.length > 0);

  const confidence = computeConfidence({
    resolution: filmResolution,
    coreDomainsWithData,
    geographyOk,
    demographicsOk,
    anyPartners,
    qlooCallCount: qlooCallsMap.size,
  });

  emitter.emitStepFinished(
    "score",
    `Confidence score ${confidence.score}/12 (${confidence.level})`
  );

  // ---------------------------------------------------------------------------
  // S12: Save and emit
  // ---------------------------------------------------------------------------
  emitter.emitStepStarted("save");

  const briefId = randomUUID();
  const brief: TasteBrief = {
    version: 1,
    id: briefId,
    generatedAt: new Date().toISOString(),
    mode,
    dataBadges: {
      showtimes: show.source,
      qloo: mode === "live" ? "live" : "recorded",
    },
    show: {
      id: show.id,
      filmTitle: show.filmTitle,
      theaterName: show.theaterName,
      city: show.city,
      timeZone: show.timeZone,
      startsAtIso: show.startsAtIso,
      startsAtLocal: show.startsAtLocal,
      capacity: show.capacity,
      sold: show.sold,
      hoursToStart: show.hoursToStart,
      projectedFill: show.projectedFill,
      underfilled: show.underfilled,
    },
    film: {
      title: filmChosenTitle,
      qlooEntityId: filmChosenEntityId,
      resolution: filmResolution,
      alternates: filmAlternates,
      warnings: filmWarnings,
    },
    fingerprint: rawFingerprints,
    audience,
    geography,
    channels: finalChannels,
    partners: partnerGroups,
    segments,
    copy: copyResult,
    summary: summaryResult,
    confidence,
    limitations,
    evidence: {
      calls: Array.from(qlooCallsMap.values()),
    },
    llmCalls,
  };

  await saveBrief({
    id: briefId,
    showId: show.id,
    inputHash,
    mode,
    confidenceLevel: confidence.level,
    content: brief,
  });

  try {
    await updateRun(runId, {
      status: "finished",
      events: emitter.getEvents(),
    });
  } catch {
    // Ignore
  }

  emitter.emitStepFinished("save", `Saved brief ${briefId}`);

  emitter.emit({
    type: "brief.ready",
    briefId,
    fromCache: false,
  });

  return brief;
}

function processChannelsOutput(
  output: {
    ranked: Array<{ id: string; priority: number; rationale: string }>;
    dropped: Array<{ id: string; reason: string }>;
  },
  candidates: ChannelCandidate[]
): Array<{ id: string; priority: number | null; rationale: string | null }> {
  const rankedMap = new Map<
    string,
    { priority: number; rationale: string }
  >();
  for (const item of output.ranked) {
    rankedMap.set(item.id, {
      priority: item.priority,
      rationale: item.rationale,
    });
  }

  return candidates.map((cand) => {
    const r = rankedMap.get(cand.id);
    if (r) {
      return {
        id: cand.id,
        priority: r.priority,
        rationale: r.rationale,
      };
    }
    return {
      id: cand.id,
      priority: null,
      rationale: null,
    };
  });
}
