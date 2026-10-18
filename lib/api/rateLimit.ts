/**
 * lib/api/rateLimit.ts
 *
 * In-memory best-effort rate limiter as specified in Section 14.1.
 * Route limits:
 *   - POST /api/briefs: 10 per hour
 *   - Other routes: 120 per minute
 */

interface RateBucket {
  timestamps: number[];
}

const store = new Map<string, RateBucket>();

// Clean up stale entries every 5 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanupStale(nowTime: number, maxWindowMs: number): void {
  if (nowTime - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = nowTime;
  for (const [key, bucket] of store.entries()) {
    bucket.timestamps = bucket.timestamps.filter((t) => nowTime - t < maxWindowMs);
    if (bucket.timestamps.length === 0) {
      store.delete(key);
    }
  }
}

export function checkRateLimit(
  ip: string,
  kind: "briefs" | "general"
): { allowed: boolean; retryAfterSeconds: number } {
  const nowTime = Date.now();
  const isBriefs = kind === "briefs";
  const limit = isBriefs ? 10 : 120;
  const windowMs = isBriefs ? 3600 * 1000 : 60 * 1000;

  cleanupStale(nowTime, windowMs);

  const key = `${kind}:${ip}`;
  let bucket = store.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    store.set(key, bucket);
  }

  // Remove timestamps outside window
  bucket.timestamps = bucket.timestamps.filter((t) => nowTime - t < windowMs);

  if (bucket.timestamps.length >= limit) {
    const oldest = bucket.timestamps[0] ?? nowTime;
    const retryAfterMs = Math.max(0, windowMs - (nowTime - oldest));
    const retryAfterSeconds = Math.ceil(retryAfterMs / 1000) || 1;
    return { allowed: false, retryAfterSeconds };
  }

  bucket.timestamps.push(nowTime);
  return { allowed: true, retryAfterSeconds: 0 };
}

export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}
