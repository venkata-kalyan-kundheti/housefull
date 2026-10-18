/**
 * lib/qloo/client.ts
 *
 * Public Qloo client implementation conforming to Sections 8.1 to 8.11.
 * Orchestrates param guard, cache lookup, rate limiting, retry, and compaction.
 */

import { guardParams } from "./paramGuard";
import { getCachedQloo, setCachedQloo } from "./cache";
import { executeFetch } from "./request";
import { assessRetry } from "./retry";
import { getRateLimiter } from "./limiter";
import {
  compactSearch,
  compactEntities,
  compactPlaces,
  compactHeatmap,
  compactDemographics,
  compactTags,
} from "./compact";
import { BudgetExceededError, ReplayMissError, type AppError } from "../errors";
import { now } from "../time/now";
import type {
  Domain,
  QlooContext,
  QlooResult,
  QlooCallRecord,
  CompactSearchResult,
  CompactEntity,
  CompactPlace,
  HeatCell,
  DemographicsSkew,
  CompactTag,
} from "./types";

export class CallCounter {
  private count = 0;
  nextId(): string {
    this.count++;
    return `call_${String(this.count).padStart(2, "0")}`;
  }
}

async function executeQlooCall<T>(args: {
  ctx: QlooContext;
  endpoint: string;
  rawParams: Record<string, string | number | undefined>;
  compactFn: (data: unknown) => T;
  countFn: (compacted: T) => number;
  fetchImpl?: typeof fetch;
}): Promise<QlooResult<T>> {
  const { ctx, endpoint, rawParams, compactFn, countFn, fetchImpl } = args;

  // 1. Guard parameters (throws ParamGuardError on programmer error)
  const params = guardParams(endpoint, rawParams);

  // 2. Assign unique call ID for trace & evidence
  const callId = ctx.callCounter
    ? ctx.callCounter.nextId()
    : `call_01`;

  const startedAt = now().toISOString();

  // 3. Cache lookup
  const cached = await getCachedQloo<T>(endpoint, params);
  if (cached) {
    const call: QlooCallRecord = {
      id: callId,
      endpoint,
      params,
      status: cached.status,
      latencyMs: 1, // Cache hit lookup latency
      cached: true,
      attempts: 1,
      resultCount: cached.resultCount,
      error: null,
      startedAt,
      rateRemainingMonth: null,
    };
    ctx.trace?.emit({ type: "qloo.call", call });
    return { ok: true, data: cached.payload, call };
  }

  // 4. Cache Miss in Replay mode -> Never make network call
  if (ctx.mode === "replay") {
    const error = new ReplayMissError();
    const call: QlooCallRecord = {
      id: callId,
      endpoint,
      params,
      status: null,
      latencyMs: 0,
      cached: false,
      attempts: 0,
      resultCount: 0,
      error: { code: error.code, message: error.message },
      startedAt,
      rateRemainingMonth: null,
    };
    ctx.trace?.emit({ type: "qloo.call", call });
    return { ok: false, error, call };
  }

  // 5. Cache Miss in Live mode -> Consume budget
  if (!ctx.budget.tryConsume()) {
    const error = new BudgetExceededError();
    const call: QlooCallRecord = {
      id: callId,
      endpoint,
      params,
      status: null,
      latencyMs: 0,
      cached: false,
      attempts: 0,
      resultCount: 0,
      error: { code: error.code, message: error.message },
      startedAt,
      rateRemainingMonth: null,
    };
    ctx.trace?.emit({ type: "qloo.call", call });
    return { ok: false, error, call };
  }

  // 6. Rate Limiter acquisition
  const limiter = getRateLimiter();
  await limiter.acquire();

  // 7. Initial fetch attempt
  let attempts = 1;
  let fetchRes = await executeFetch(endpoint, params, fetchImpl);

  // 8. Retry evaluation (max 2 attempts)
  if (!fetchRes.ok) {
    const assessment = assessRetry(
      fetchRes.status,
      fetchRes.error?.code ?? null,
      fetchRes.rateLimits.secondReset
    );

    if (assessment.shouldRetry) {
      if (assessment.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, assessment.delayMs));
      }
      await limiter.acquire();
      attempts = 2;
      fetchRes = await executeFetch(endpoint, params, fetchImpl);
    }
  }

  // 9. If fetch ultimately failed
  if (!fetchRes.ok || fetchRes.error) {
    const err: AppError = fetchRes.error!;
    const call: QlooCallRecord = {
      id: callId,
      endpoint,
      params,
      status: fetchRes.status || null,
      latencyMs: fetchRes.latencyMs,
      cached: false,
      attempts,
      resultCount: 0,
      error: { code: err.code, message: err.message },
      startedAt,
      rateRemainingMonth: fetchRes.rateLimits.monthRemaining,
    };
    ctx.trace?.emit({ type: "qloo.call", call });
    return { ok: false, error: err, call };
  }

  // 10. Compact response
  const compacted = compactFn(fetchRes.data);
  const resultCount = countFn(compacted);

  // 11. Write to cache
  await setCachedQloo({
    endpoint,
    params,
    payload: compacted,
    status: fetchRes.status,
    resultCount,
  });

  const call: QlooCallRecord = {
    id: callId,
    endpoint,
    params,
    status: fetchRes.status,
    latencyMs: fetchRes.latencyMs,
    cached: false,
    attempts,
    resultCount,
    error: null,
    startedAt,
    rateRemainingMonth: fetchRes.rateLimits.monthRemaining,
  };

  ctx.trace?.emit({ type: "qloo.call", call });
  return { ok: true, data: compacted, call };
}

// -----------------------------------------------------------------------------
// Public Client API (Section 8.1)
// -----------------------------------------------------------------------------

export async function searchEntities(
  ctx: QlooContext,
  query: string,
  opts?: { take?: number; fetchImpl?: typeof fetch }
): Promise<QlooResult<CompactSearchResult[]>> {
  const take = opts?.take ?? 10;
  return executeQlooCall<CompactSearchResult[]>({
    ctx,
    endpoint: "/search",
    rawParams: { query },
    compactFn: (data) => compactSearch(data).slice(0, take),
    countFn: (res) => res.length,
    fetchImpl: opts?.fetchImpl,
  });
}

export async function getDomainInsights(
  ctx: QlooContext,
  domain: Domain,
  filmEntityId: string,
  opts?: { take?: number; fetchImpl?: typeof fetch }
): Promise<QlooResult<CompactEntity[]>> {
  const take = opts?.take ?? 10;
  return executeQlooCall<CompactEntity[]>({
    ctx,
    endpoint: "/v2/insights",
    rawParams: {
      "filter.type": `urn:entity:${domain}`,
      "signal.interests.entities": filmEntityId,
      take,
    },
    compactFn: (data) => compactEntities(data, take),
    countFn: (res) => res.length,
    fetchImpl: opts?.fetchImpl,
  });
}

export async function getPlaces(
  ctx: QlooContext,
  args: {
    categoryTag: string;
    city: string;
    filmEntityId: string;
    take?: number;
    fetchImpl?: typeof fetch;
  }
): Promise<QlooResult<CompactPlace[]>> {
  const take = args.take ?? 8;
  return executeQlooCall<CompactPlace[]>({
    ctx,
    endpoint: "/v2/insights",
    rawParams: {
      "filter.type": "urn:entity:place",
      "signal.interests.entities": args.filmEntityId,
      "filter.tags": args.categoryTag,
      "filter.location.query": args.city,
      take,
    },
    compactFn: (data) => compactPlaces(data, take),
    countFn: (res) => res.length,
    fetchImpl: args.fetchImpl,
  });
}

export async function getHeatmap(
  ctx: QlooContext,
  args: {
    filmEntityId: string;
    city: string;
    fetchImpl?: typeof fetch;
  }
): Promise<QlooResult<HeatCell[]>> {
  return executeQlooCall<HeatCell[]>({
    ctx,
    endpoint: "/v2/insights",
    rawParams: {
      "filter.type": "urn:heatmap",
      "signal.interests.entities": args.filmEntityId,
      "filter.location.query": args.city,
    },
    compactFn: (data) => compactHeatmap(data),
    countFn: (res) => res.length,
    fetchImpl: args.fetchImpl,
  });
}

export async function getDemographics(
  ctx: QlooContext,
  args: {
    filmEntityId: string;
    city: string;
    fetchImpl?: typeof fetch;
  }
): Promise<QlooResult<DemographicsSkew | null>> {
  return executeQlooCall<DemographicsSkew | null>({
    ctx,
    endpoint: "/v2/insights",
    rawParams: {
      "filter.type": "urn:demographics",
      "signal.interests.entities": args.filmEntityId,
      "filter.location.query": args.city,
    },
    compactFn: (data) => compactDemographics(data),
    countFn: (res) => (res ? 1 : 0),
    fetchImpl: args.fetchImpl,
  });
}

export async function searchTags(
  ctx: QlooContext,
  keyword: string,
  opts?: { take?: number; fetchImpl?: typeof fetch }
): Promise<QlooResult<CompactTag[]>> {
  const take = opts?.take ?? 10;
  return executeQlooCall<CompactTag[]>({
    ctx,
    endpoint: "/v2/tags",
    rawParams: {
      "filter.query": keyword,
      take,
    },
    compactFn: (data) => compactTags(data, take),
    countFn: (res) => res.length,
    fetchImpl: opts?.fetchImpl,
  });
}
