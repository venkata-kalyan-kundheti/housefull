/**
 * lib/hooks/useBriefStream.ts
 *
 * Client-side SSE stream reader hook conforming to Section 15.8.
 * Buffers chunks, handles split events, parses event/data lines, and manages state.
 */

"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { TraceEvent } from "@/lib/agent/trace";
import { createSseParser } from "./sse";

export type StreamStatus = "idle" | "connecting" | "running" | "ready" | "failed";

export interface UseBriefStreamParams {
  showId: string;
  radiusKm?: number;
  filmEntityIdOverride?: string;
  force?: boolean;
}

export interface UseBriefStreamResult {
  status: StreamStatus;
  events: TraceEvent[];
  briefId: string | null;
  error: { code: string; message: string } | null;
  alternates: Array<{ name: string; entityId: string }>;
  start: (overrides?: Partial<UseBriefStreamParams>) => void;
  cancel: () => void;
}

export function useBriefStream(
  initialParams: UseBriefStreamParams
): UseBriefStreamResult {
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [briefId, setBriefId] = useState<string | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(
    null
  );
  const [alternates, setAlternates] = useState<
    Array<{ name: string; entityId: string }>
  >([]);

  const abortControllerRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (status === "connecting" || status === "running") {
      setStatus("idle");
    }
  }, [status]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const start = useCallback(
    async (overrides?: Partial<UseBriefStreamParams>) => {
      cancel();

      const controller = new AbortController();
      abortControllerRef.current = controller;

      setStatus("connecting");
      setEvents([]);
      setBriefId(null);
      setError(null);
      setAlternates([]);

      const payload = {
        showId: overrides?.showId ?? initialParams.showId,
        radiusKm: overrides?.radiusKm ?? initialParams.radiusKm,
        filmEntityIdOverride:
          overrides?.filmEntityIdOverride ?? initialParams.filmEntityIdOverride,
        force: overrides?.force ?? initialParams.force,
      };

      try {
        const response = await fetch("/api/briefs", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (!response.ok) {
          let errJson: { error?: { code?: string; message?: string } } | null = null;
          try {
            errJson = (await response.json()) as { error?: { code?: string; message?: string } };
          } catch {
            errJson = { error: { code: "HTTP_ERROR", message: response.statusText } };
          }
          setStatus("failed");
          setError({
            code: errJson?.error?.code ?? "ERROR",
            message: errJson?.error?.message ?? "Failed to request brief",
          });
          return;
        }

        if (!response.body) {
          setStatus("failed");
          setError({ code: "NO_BODY", message: "Response body is empty" });
          return;
        }

        setStatus("running");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const parser = createSseParser();
        let finished = false;

        const handlePayload = (dataStr: string) => {
          try {
            const event = JSON.parse(dataStr) as TraceEvent;
            setEvents((prev) => [...prev, event]);

            if (event.type === "brief.ready") {
              finished = true;
              setBriefId(event.briefId);
              setStatus("ready");
            } else if (event.type === "run.failed") {
              finished = true;
              setStatus("failed");
              setError({ code: event.code, message: event.message });
              if (event.alternates) {
                setAlternates(event.alternates);
              }
            }
          } catch {
            // Ignore malformed data lines
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const payload of parser.push(decoder.decode(value, { stream: true }))) {
            handlePayload(payload);
          }
        }

        for (const payload of parser.flush()) {
          handlePayload(payload);
        }

        // The server closed the stream without a final event (for example the
        // hosting platform stopped the request). Do not leave the UI spinning.
        if (!finished) {
          setStatus("failed");
          setError({
            code: "STREAM_ENDED",
            message: "The connection closed before the brief was finished. Please try again.",
          });
        }
      } catch (err: unknown) {
        if ((err as Error)?.name === "AbortError") {
          return;
        }
        setStatus("failed");
        setError({
          code: "STREAM_ERROR",
          message: (err as Error)?.message ?? "Connection closed unexpectedly",
        });
      } finally {
        abortControllerRef.current = null;
      }
    },
    [cancel, initialParams]
  );

  return {
    status,
    events,
    briefId,
    error,
    alternates,
    start,
    cancel,
  };
}
