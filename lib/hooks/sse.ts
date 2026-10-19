/**
 * lib/hooks/sse.ts
 *
 * Pure Server-Sent Events parser used by useBriefStream (README Sections 14.5 and 15.8).
 * Handles events split across chunks, CRLF line endings, comment lines and
 * multi-line data fields. No browser APIs, so it is unit-testable.
 */

export interface SseParser {
  /** Feed a decoded text chunk. Returns the data payload of each completed event. */
  push(chunk: string): string[];
  /** Call when the stream ends. Returns the payload of a final unterminated event, if any. */
  flush(): string[];
}

function extractData(block: string): string | null {
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith(":")) continue; // comment or keep-alive
    if (line.startsWith("data:")) {
      const value = line.slice(5);
      dataLines.push(value.startsWith(" ") ? value.slice(1) : value);
    }
  }
  if (dataLines.length === 0) return null;
  const joined = dataLines.join("\n").trim();
  return joined.length > 0 ? joined : null;
}

export function createSseParser(): SseParser {
  let buffer = "";

  return {
    push(chunk: string): string[] {
      buffer += chunk.replace(/\r\n/g, "\n");
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      const out: string[] = [];
      for (const part of parts) {
        const data = extractData(part);
        if (data !== null) out.push(data);
      }
      return out;
    },
    flush(): string[] {
      const rest = buffer;
      buffer = "";
      const data = rest.trim() ? extractData(rest) : null;
      return data !== null ? [data] : [];
    },
  };
}
