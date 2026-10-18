/**
 * lib/domain/constants.ts
 *
 * Configurable domain thresholds and constants as specified in Section 9.3 and 12.3.
 */

export const FINGERPRINT = {
  ITEMS_KEPT: 8,
  STRONG_MIN_COUNT: 3,
  STRONG_TOP3_MEAN_AFFINITY: 0.75,
  TAGS_PER_ITEM_SHOWN: 4,
} as const;
