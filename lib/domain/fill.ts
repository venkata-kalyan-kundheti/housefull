/**
 * lib/domain/fill.ts
 *
 * Calculations for expected sales progress, projected fill, and underfilled detection.
 * As specified in Section 9.8.
 */

/**
 * Expected fraction of final sales made at `h` hours before showtime.
 * Piecewise linear:
 *   h >= 72: 0.10
 *   72 -> 24: 0.10 -> 0.35
 *   24 -> 3:  0.35 -> 0.75
 *   3 -> 0:   0.75 -> 1.00
 *   h <= 0:   1.00
 */
export function expectedProgress(hoursToStart: number): number {
  if (hoursToStart >= 72) return 0.1;
  if (hoursToStart <= 0) return 1.0;

  if (hoursToStart > 24) {
    // Between 72 and 24 hours: interpolate 0.10 to 0.35
    const fraction = (72 - hoursToStart) / (72 - 24);
    return 0.1 + (0.35 - 0.1) * fraction;
  }

  if (hoursToStart > 3) {
    // Between 24 and 3 hours: interpolate 0.35 to 0.75
    const fraction = (24 - hoursToStart) / (24 - 3);
    return 0.35 + (0.75 - 0.35) * fraction;
  }

  // Between 3 and 0 hours: interpolate 0.75 to 1.00
  const fraction = (3 - hoursToStart) / (3 - 0);
  return 0.75 + (1.0 - 0.75) * fraction;
}

/**
 * Projected final fill fraction in [0, 1].
 * Formula: min(1, (sold / capacity) / expectedProgress(h))
 */
export function projectedFill(
  sold: number,
  capacity: number,
  hoursToStart: number
): number {
  if (capacity <= 0) return 0;
  const clampedSold = Math.max(0, Math.min(sold, capacity));
  const progress = expectedProgress(hoursToStart);
  if (progress <= 0) return 0;
  return Math.min(1, clampedSold / capacity / progress);
}

/**
 * Determines whether a show is underfilled.
 * True when 1 <= hoursToStart <= 72 AND projectedFill < threshold (default 0.5).
 */
export function isUnderfilled(args: {
  sold: number;
  capacity: number;
  hoursToStart: number;
  threshold?: number;
}): boolean {
  const { sold, capacity, hoursToStart, threshold = 0.5 } = args;
  if (hoursToStart < 1 || hoursToStart > 72) {
    return false;
  }
  const projected = projectedFill(sold, capacity, hoursToStart);
  return projected < threshold;
}
