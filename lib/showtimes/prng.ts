/**
 * lib/showtimes/prng.ts
 *
 * Deterministic PRNG implementation (mulberry32).
 * As specified in Section 9.10.
 */

/**
 * Creates a deterministic pseudorandom number generator using mulberry32.
 * Returns floats in [0, 1).
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
