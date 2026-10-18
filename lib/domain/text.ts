/**
 * lib/domain/text.ts
 *
 * Pure text processing functions as specified in Section 9.1.
 */

/**
 * Normalizes film titles:
 * Unicode NFKD -> strip combining marks -> lowercase -> non-alphanumeric to spaces ->
 * collapse spaces -> trim -> strip leading "the ".
 */
export function normalizeTitle(s: string): string {
  if (!s) return "";
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^the\s+/, "");
}

/**
 * Truncates string to max characters, optionally appending an ellipsis.
 */
export function truncate(s: string, max: number, ellipsis = "…"): string {
  if (!s || s.length <= max) return s;
  const cut = Math.max(0, max - ellipsis.length);
  return s.slice(0, cut).trim() + ellipsis;
}
