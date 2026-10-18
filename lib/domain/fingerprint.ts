/**
 * lib/domain/fingerprint.ts
 *
 * Fingerprint domain and item processing as specified in Section 9.3.
 */

import { FINGERPRINT } from "./constants";
import { CORE_DOMAINS, type Domain, type CompactEntity } from "../qloo/types";

export interface FingerprintItem {
  entityId: string;
  name: string;
  affinity: number | null;
  tags: string[];
  why: string;
}

export interface FingerprintDomain {
  domain: Domain;
  callId: string;
  strong: boolean;
  displayed: boolean;
  items: FingerprintItem[];
}

export function buildFingerprint(input: {
  domain: Domain;
  entities: CompactEntity[];
  callId: string;
}): FingerprintDomain {
  const { domain, entities, callId } = input;

  // 1. Keep first ITEMS_KEPT entities
  const kept = entities.slice(0, FINGERPRINT.ITEMS_KEPT);

  // 2. Determine strong
  // At least STRONG_MIN_COUNT non-null affinities AND mean affinity of top 3 >= 0.75
  const nonNullAffinities = kept
    .map((e) => e.affinity)
    .filter((a): a is number => a !== null && Number.isFinite(a));

  let strong = false;
  if (nonNullAffinities.length >= FINGERPRINT.STRONG_MIN_COUNT) {
    const top3 = nonNullAffinities.slice(0, 3);
    const mean = top3.reduce((sum, val) => sum + val, 0) / top3.length;
    strong = mean >= FINGERPRINT.STRONG_TOP3_MEAN_AFFINITY;
  }

  // 3. Determine displayed
  const isCore = (CORE_DOMAINS as readonly string[]).includes(domain);
  let displayed = false;
  if (isCore) {
    displayed = kept.length > 0;
  } else {
    displayed = strong;
  }

  // 4. Map items & build why text
  const items: FingerprintItem[] = kept.map((entity) => {
    let why = "";
    if (entity.affinity !== null && Number.isFinite(entity.affinity)) {
      why = `Affinity ${entity.affinity.toFixed(2)} with this film`;
    } else {
      why = "Related to this film";
    }

    if (entity.descriptors && entity.descriptors.length > 0) {
      const topDescriptors = entity.descriptors.slice(0, 2).join(", ");
      why += `; fans described as ${topDescriptors}`;
    } else if (entity.tags && entity.tags.length > 0) {
      const topTags = entity.tags.slice(0, 2).map((t) => t.name).join(", ");
      why += `; tagged ${topTags}`;
    }

    const tags = entity.tags.slice(0, FINGERPRINT.TAGS_PER_ITEM_SHOWN).map((t) => t.name);

    return {
      entityId: entity.entityId,
      name: entity.name,
      affinity: entity.affinity,
      tags,
      why,
    };
  });

  return {
    domain,
    callId,
    strong,
    displayed,
    items,
  };
}
