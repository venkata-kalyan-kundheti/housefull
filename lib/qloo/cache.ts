/**
 * lib/qloo/cache.ts
 *
 * Postgres-backed cache for compacted Qloo responses as specified in Section 8.6.
 * Fails soft: DB issues are logged as warnings and never fail requests.
 */

import { createHash } from "node:crypto";
import { eq, gt, and } from "drizzle-orm";
import { getDb } from "../db/client";
import * as schema from "../db/schema";
import { getConfig } from "../config";
import { log } from "../log";
import { COMPACTION_VERSION } from "./compact";
import { now } from "../time/now";

export interface CacheEntry<T> {
  payload: T;
  status: number;
  resultCount: number;
  fetchedAt: Date;
}

export function computeCacheKey(
  endpoint: string,
  params: Record<string, string>
): string {
  const sortedKeys = Object.keys(params).sort();
  const searchParams = new URLSearchParams();
  for (const k of sortedKeys) {
    searchParams.set(k, params[k]!);
  }
  const rawKey = `${endpoint}?${searchParams.toString()}|c${COMPACTION_VERSION}`;
  return createHash("sha256").update(rawKey).digest("hex");
}

export async function getCachedQloo<T>(
  endpoint: string,
  params: Record<string, string>
): Promise<CacheEntry<T> | null> {
  const key = computeCacheKey(endpoint, params);
  const currentTime = now();

  try {
    const db = getDb();
    const rows = await db
      .select({
        payload: schema.qlooCache.payload,
        status: schema.qlooCache.status,
        resultCount: schema.qlooCache.resultCount,
        fetchedAt: schema.qlooCache.fetchedAt,
      })
      .from(schema.qlooCache)
      .where(
        and(
          eq(schema.qlooCache.key, key),
          gt(schema.qlooCache.expiresAt, currentTime)
        )
      )
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    // Check expiration
    return {
      payload: row.payload as T,
      status: row.status,
      resultCount: row.resultCount,
      fetchedAt: row.fetchedAt,
    };
  } catch (err) {
    log.warn("Qloo cache read failed. Treating as cache miss.", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function setCachedQloo<T>(args: {
  endpoint: string;
  params: Record<string, string>;
  payload: T;
  status: number;
  resultCount: number;
}): Promise<void> {
  const { endpoint, params, payload, status, resultCount } = args;

  // Only cache HTTP 200 responses
  if (status !== 200) return;

  const key = computeCacheKey(endpoint, params);
  let ttlHours = 168;
  try {
    ttlHours = getConfig().QLOO_CACHE_TTL_HOURS;
  } catch {
    ttlHours = 168;
  }
  // Empty results get min(TTL, 6 hours)
  const effectiveTtlHours = resultCount === 0 ? Math.min(ttlHours, 6) : ttlHours;

  const fetchedAt = now();
  const expiresAt = new Date(fetchedAt.getTime() + effectiveTtlHours * 3600 * 1000);

  try {
    const db = getDb();
    await db
      .insert(schema.qlooCache)
      .values({
        key,
        endpoint,
        payload: payload as Record<string, unknown>,
        status,
        resultCount,
        compactionVersion: COMPACTION_VERSION,
        fetchedAt,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: schema.qlooCache.key,
        set: {
          payload: payload as Record<string, unknown>,
          status,
          resultCount,
          compactionVersion: COMPACTION_VERSION,
          fetchedAt,
          expiresAt,
        },
      });
  } catch (err) {
    log.warn("Qloo cache write failed. Ignoring.", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
