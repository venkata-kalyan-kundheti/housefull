/**
 * lib/domain/limitations.ts
 *
 * Decides when a missing taste domain should be reported as a limitation
 * (README Section 26.1): core domains are reported when they failed or returned
 * nothing; optional domains (book, podcast) are reported only when the call failed.
 */

import { CORE_DOMAINS, type Domain } from "@/lib/qloo/types";

export function shouldReportMissingDomain(domain: Domain, callOk: boolean, itemCount: number): boolean {
  if (!callOk) return true;
  const isCore = (CORE_DOMAINS as readonly Domain[]).includes(domain);
  return isCore && itemCount === 0;
}
