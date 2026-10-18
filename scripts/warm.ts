/**
 * scripts/warm.ts
 *
 * Cache warming script as specified in Section 16.3.
 * Pre-populates the private cache before a demo or submission.
 *
 * Rules:
 *   - Requires APP_MODE=live, valid QLOO_API_KEY and LLM_API_KEY.
 *   - Runs the first underfilled show per demo film per theater (at most 12 shows).
 *   - Prints one line per show: title, theater, confidence level, number of Qloo calls, number cached.
 *   - Never prints Qloo data values.
 */

import { getConfig } from "../lib/config";
import { listTheaters, listShows } from "../lib/db/repo";
import { runPipeline } from "../lib/agent/pipeline";
import { TraceEmitter } from "../lib/agent/trace";
import { now } from "../lib/time/now";

async function main() {
  const config = getConfig();

  if (config.APP_MODE !== "live") {
    console.error("Warm script requires APP_MODE=live");
    process.exit(1);
  }

  if (!config.QLOO_API_KEY) {
    console.error("Warm script requires QLOO_API_KEY");
    process.exit(1);
  }

  if (!config.LLM_API_KEY) {
    console.error("Warm script requires LLM_API_KEY");
    process.exit(1);
  }

  const currentNow = now().toISOString();
  const sevenDaysLater = new Date(
    new Date(currentNow).getTime() + 7 * 24 * 3600 * 1000
  ).toISOString();

  const theaters = await listTheaters();
  const candidateShows: Array<{
    id: string;
    filmTitle: string;
    theaterName: string;
  }> = [];

  for (const theater of theaters) {
    const shows = await listShows({
      theaterId: theater.id,
      fromIso: currentNow,
      toIso: sevenDaysLater,
      underfilledOnly: true,
    });

    // Group by filmTitle, select first show per film
    const seenFilms = new Set<string>();
    for (const show of shows) {
      if (!seenFilms.has(show.filmTitle)) {
        seenFilms.add(show.filmTitle);
        candidateShows.push({
          id: show.id,
          filmTitle: show.filmTitle,
          theaterName: show.theaterName,
        });
      }
    }
  }

  // Cap at 12 shows per Section 16.3
  const targetShows = candidateShows.slice(0, 12);
  console.log(`Starting cache warm for ${targetShows.length} shows...\n`);

  let succeeded = 0;

  for (const show of targetShows) {
    const emitter = new TraceEmitter();
    let qlooCalls = 0;
    let cachedCalls = 0;

    emitter.addListener((event) => {
      if (event.type === "qloo.call") {
        qlooCalls++;
        if (event.call.cached) {
          cachedCalls++;
        }
      }
    });

    try {
      const brief = await runPipeline(
        {
          showId: show.id,
          force: true,
        },
        emitter
      );

      succeeded++;
      console.log(
        `✓ ${show.filmTitle.padEnd(25)} | ${show.theaterName.padEnd(25)} | Confidence: ${brief.confidence.level.toUpperCase()} | Qloo calls: ${qlooCalls} (cached: ${cachedCalls})`
      );
    } catch (err: unknown) {
      const errObj = err as { code?: string; message?: string };
      console.error(
        `✗ ${show.filmTitle.padEnd(25)} | ${show.theaterName.padEnd(25)} | Error: ${errObj?.code || errObj?.message}`
      );
    }
  }

  console.log(`\nWarm complete. ${succeeded}/${targetShows.length} shows processed successfully.`);
}

main().catch((err) => {
  console.error("Fatal warm error:", err);
  process.exit(1);
});
