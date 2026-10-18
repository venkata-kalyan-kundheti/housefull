/**
 * lib/qloo/paramGuard.ts
 *
 * Request parameter allowlists and validation rules.
 * As specified in Section 8.2.
 */

import { ParamGuardError } from "../errors";

export const ALLOWED_FILTER_TYPES = new Set([
  "urn:entity:artist",
  "urn:entity:book",
  "urn:entity:brand",
  "urn:entity:destination",
  "urn:entity:movie",
  "urn:entity:place",
  "urn:entity:podcast",
  "urn:entity:tv_show",
  "urn:heatmap",
  "urn:demographics",
]);

export const DOMAIN_FILTER_TYPES = new Set([
  "urn:entity:artist",
  "urn:entity:book",
  "urn:entity:brand",
  "urn:entity:destination",
  "urn:entity:movie",
  "urn:entity:podcast",
  "urn:entity:tv_show",
]);

const CONTROL_CHARS_REGEX = /[\x00-\x1F\x7F]/;
const ENTITY_ID_REGEX = /^[0-9A-Za-z-]{8,64}$/;

export function guardParams(
  endpoint: string,
  params: Record<string, string | number | undefined>
): Record<string, string> {
  // Convert all defined params to strings
  const stringParams: Record<string, string> = {};
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null) {
      stringParams[key] = String(val);
    }
  }

  // 1. Search endpoint
  if (endpoint === "/search") {
    const allowed = new Set(["query"]);
    for (const key of Object.keys(stringParams)) {
      if (!allowed.has(key)) {
        throw new ParamGuardError(
          "UNKNOWN_PARAM",
          `Unknown parameter "${key}" for /search`
        );
      }
    }
    const query = stringParams.query;
    if (!query) {
      throw new ParamGuardError("MISSING_PARAM", "Missing required param query");
    }
    if (
      query.trim() !== query ||
      query.length < 1 ||
      query.length > 120 ||
      CONTROL_CHARS_REGEX.test(query)
    ) {
      throw new ParamGuardError("BAD_VALUE", `Invalid query value: "${query}"`);
    }
    return stringParams;
  }

  // 2. Tags endpoint
  if (endpoint === "/v2/tags") {
    const allowed = new Set(["filter.query", "take"]);
    for (const key of Object.keys(stringParams)) {
      if (!allowed.has(key)) {
        throw new ParamGuardError(
          "UNKNOWN_PARAM",
          `Unknown parameter "${key}" for /v2/tags`
        );
      }
    }
    const filterQuery = stringParams["filter.query"];
    if (!filterQuery) {
      throw new ParamGuardError(
        "MISSING_PARAM",
        "Missing required param filter.query"
      );
    }
    if (
      filterQuery.trim() !== filterQuery ||
      filterQuery.length < 1 ||
      filterQuery.length > 120 ||
      CONTROL_CHARS_REGEX.test(filterQuery)
    ) {
      throw new ParamGuardError(
        "BAD_VALUE",
        `Invalid filter.query value: "${filterQuery}"`
      );
    }
    if (stringParams.take !== undefined) {
      validateTake(stringParams.take);
    }
    return stringParams;
  }

  // 3. Insights endpoint
  if (endpoint === "/v2/insights") {
    const filterType = stringParams["filter.type"];
    if (!filterType) {
      throw new ParamGuardError("MISSING_PARAM", "Missing required param filter.type");
    }
    if (!ALLOWED_FILTER_TYPES.has(filterType)) {
      throw new ParamGuardError(
        "UNSUPPORTED_TYPE",
        `Unsupported filter.type: "${filterType}"`
      );
    }

    // Check entity signal
    const signalEntity = stringParams["signal.interests.entities"];
    if (!signalEntity) {
      throw new ParamGuardError(
        "MISSING_PARAM",
        "Missing required param signal.interests.entities"
      );
    }
    if (signalEntity.includes(",") || !ENTITY_ID_REGEX.test(signalEntity)) {
      throw new ParamGuardError(
        "BAD_VALUE",
        `Invalid signal.interests.entities value: "${signalEntity}"`
      );
    }

    // Check take if provided
    if (stringParams.take !== undefined) {
      validateTake(stringParams.take);
    }

    // A. Heatmap or Demographics
    if (filterType === "urn:heatmap" || filterType === "urn:demographics") {
      const allowed = new Set([
        "filter.type",
        "signal.interests.entities",
        "filter.location.query",
      ]);
      for (const key of Object.keys(stringParams)) {
        if (!allowed.has(key)) {
          throw new ParamGuardError(
            "UNKNOWN_PARAM",
            `Unknown parameter "${key}" for ${filterType}`
          );
        }
      }
      const loc = stringParams["filter.location.query"];
      if (!loc) {
        throw new ParamGuardError(
          "MISSING_PARAM",
          `Missing required filter.location.query for ${filterType}`
        );
      }
      validateLocation(loc);
      return stringParams;
    }

    // B. Place insights
    if (filterType === "urn:entity:place") {
      const allowed = new Set([
        "filter.type",
        "signal.interests.entities",
        "filter.tags",
        "filter.location.query",
        "take",
        "feature.explainability",
      ]);
      for (const key of Object.keys(stringParams)) {
        if (!allowed.has(key)) {
          throw new ParamGuardError(
            "UNKNOWN_PARAM",
            `Unknown parameter "${key}" for place insights`
          );
        }
      }
      const tags = stringParams["filter.tags"];
      if (!tags) {
        throw new ParamGuardError(
          "MISSING_PARAM",
          "Missing required filter.tags for place insights"
        );
      }
      if (!tags.startsWith("urn:tag:")) {
        throw new ParamGuardError("BAD_VALUE", `filter.tags must start with urn:tag:`);
      }
      const loc = stringParams["filter.location.query"];
      if (!loc) {
        throw new ParamGuardError(
          "MISSING_PARAM",
          "Missing required filter.location.query for place insights"
        );
      }
      validateLocation(loc);
      return stringParams;
    }

    // C. Domain insights
    if (DOMAIN_FILTER_TYPES.has(filterType)) {
      // Check location not allowed rule
      if (stringParams["filter.location.query"] !== undefined) {
        throw new ParamGuardError(
          "LOCATION_NOT_ALLOWED",
          `filter.location.query is forbidden for domain insights type ${filterType}`
        );
      }
      const allowed = new Set([
        "filter.type",
        "signal.interests.entities",
        "take",
        "feature.explainability",
      ]);
      for (const key of Object.keys(stringParams)) {
        if (!allowed.has(key)) {
          throw new ParamGuardError(
            "UNKNOWN_PARAM",
            `Unknown parameter "${key}" for domain insights`
          );
        }
      }
      return stringParams;
    }
  }

  throw new ParamGuardError("UNKNOWN_PARAM", `Unsupported endpoint "${endpoint}"`);
}

function validateTake(takeVal: string): void {
  const num = Number(takeVal);
  if (!Number.isInteger(num) || num < 1 || num > 50) {
    throw new ParamGuardError(
      "BAD_VALUE",
      `take must be an integer between 1 and 50. Received: "${takeVal}"`
    );
  }
}

function validateLocation(loc: string): void {
  if (
    loc.trim() !== loc ||
    loc.length < 1 ||
    loc.length > 80 ||
    CONTROL_CHARS_REGEX.test(loc)
  ) {
    throw new ParamGuardError(
      "BAD_VALUE",
      `Invalid filter.location.query: "${loc}"`
    );
  }
}
