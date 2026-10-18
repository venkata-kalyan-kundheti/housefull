/**
 * app/api/briefs/route.ts
 *
 * POST /api/briefs endpoint streaming Server-Sent Events (Section 14.5).
 */

import { type NextRequest } from "next/server";
import { z } from "zod";
import { runPipeline } from "@/lib/agent/pipeline";
import { TraceEmitter, type TraceEvent } from "@/lib/agent/trace";
import { checkRateLimit, getClientIp } from "@/lib/api/rateLimit";
import {
  jsonValidationFailed,
  jsonRateLimited,
  jsonError,
} from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const briefBodySchema = z.object({
  showId: z.string().uuid("showId must be a valid UUID"),
  radiusKm: z.number().min(2).max(50).optional(),
  filmEntityIdOverride: z
    .string()
    .regex(/^[0-9A-Za-z-]{8,64}$/, "Invalid entity ID format")
    .optional(),
  force: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  // 1. Rate-limit check before streaming
  const ip = getClientIp(request.headers);
  const rateResult = checkRateLimit(ip, "briefs");
  if (!rateResult.allowed) {
    return jsonRateLimited(rateResult.retryAfterSeconds);
  }

  // 2. Parse and validate JSON body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("BAD_REQUEST", "Request body must be valid JSON", 400);
  }

  const parsed = briefBodySchema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    }));
    return jsonValidationFailed(issues, "Invalid brief request parameters");
  }

  const input = parsed.data;
  const emitter = new TraceEmitter();

  const encoder = new TextEncoder();
  let heartbeatTimer: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const sendEvent = (event: TraceEvent) => {
        try {
          const payload = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch {
          // Stream might be closed
        }
      };

      // Register listener
      emitter.addListener((event) => {
        sendEvent(event);
      });

      // Heartbeat every 10 seconds
      heartbeatTimer = setInterval(() => {
        sendEvent({
          type: "heartbeat",
          at: new Date().toISOString(),
        });
      }, 10_000);

      // Run pipeline in background
      runPipeline(input, emitter, { signal: request.signal })
        .catch(() => {
          // Errors are already handled by failRun emitting run.failed
        })
        .finally(() => {
          if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
          }
          try {
            controller.close();
          } catch {
            // Already closed
          }
        });
    },
    cancel() {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
