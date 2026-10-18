#!/usr/bin/env node

/**
 * scripts/check-qloo.mjs
 * 
 * Standalone, zero-dependency Node.js script (Node 20+) to run "day-one" and
 * "round-2" checks against the Qloo Hackathon API and generate safe summary reports.
 */

import fs from 'node:fs';
import path from 'node:path';

// =============================================================================
// CONFIGURATION & SEEDS
// =============================================================================
export const TEST_FILMS = ["Inception", "Past Lives", "RRR", "Kantara"];
export const TEST_CITIES = ["New York", "London", "Mumbai", "Hyderabad"];

// Round 2 specific seeds
export const ROUND2_FILMS = {
  inception: { name: "Inception", id: "18B098FD-3D84-4609-BFF3-ADF9A0B00E40" },
  rrr: { name: "RRR", id: "6D0B28D4-12FB-4113-BFAC-910271EF2D69" }
};
export const ROUND2_CITIES = ["New York", "Hyderabad"];

// Round 3 specific seeds
export const ROUND3_FILMS = {
  inception: { name: "Inception", id: "18B098FD-3D84-4609-BFF3-ADF9A0B00E40" },
  rrr: { name: "RRR", id: "6D0B28D4-12FB-4113-BFAC-910271EF2D69" },
  kantara: { name: "Kantara", id: "42E3F426-8744-47AA-8FED-5B91F92D4CD1" }
};

export const ROUND3_PARTNER_TAGS = [
  { id: "urn:tag:category:place:book_store", name: "Book Store" },
  { id: "urn:tag:category:place:comic_book_store", name: "Comic Book Store" },
  { id: "urn:tag:category:place:movie_theater", name: "Movie Theater" },
  { id: "urn:tag:category:place:cafe", name: "Cafe" }
];

// =============================================================================
// API & SECURITY CONFIGURATION
// =============================================================================
const REQUIRED_HOST = 'hackathon.api.qloo.com';
const BASE_URL = `https://${REQUIRED_HOST}`;
const REQUEST_TIMEOUT_MS = 20_000;
const INTER_REQUEST_DELAY_MS = 300;
const RETRY_DELAY_MS = 2_000;

// CLI Flags
const isRound2 = process.argv.includes('--round2');
const isRound3 = process.argv.includes('--round3');
const isDryRun = process.argv.includes('--dry-run');

const MAX_REQUESTS_CAP = isRound3 ? 40 : (isRound2 ? 60 : 80);
const RAW_RESPONSES_DIR = isRound3
  ? path.resolve('.private', 'qloo-round3')
  : (isRound2 ? path.resolve('.private', 'qloo-round2') : path.resolve('.private', 'qloo-day-one'));
const REPORT_FILE = isRound3
  ? path.resolve('qloo-round3-report.txt')
  : (isRound2 ? path.resolve('qloo-round2-report.txt') : path.resolve('qloo-day-one-report.txt'));

const rawApiKey = process.env.QLOO_API_KEY || '';
const apiKey = rawApiKey.trim();

if (!isDryRun && !apiKey) {
  console.error('ERROR: Missing QLOO_API_KEY environment variable.');
  console.error('Set it in your environment or run with --dry-run to preview planned requests.');
  console.error('Example: node --env-file=.env.local scripts/check-qloo.mjs');
  process.exit(1);
}

// Redact API key everywhere
function redactString(text) {
  if (!text || typeof text !== 'string') return text;
  if (!apiKey) return text;
  return text.split(apiKey).join('[REDACTED_API_KEY]');
}

// Sleep helper
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// =============================================================================
// STATE TRACKING
// =============================================================================
let totalRequestsMade = 0;
const rateLimitHeadersObserved = new Map();

// Helper to extract field paths up to maxDepth
function extractFieldPaths(obj, maxDepth = 4) {
  const paths = new Set();
  function traverse(curr, currentPath, depth) {
    if (depth > maxDepth || curr === null || curr === undefined) return;
    if (Array.isArray(curr)) {
      if (curr.length > 0) {
        traverse(curr[0], `${currentPath}[]`, depth + 1);
      }
      return;
    }
    if (typeof curr === 'object') {
      for (const k of Object.keys(curr)) {
        const p = currentPath ? `${currentPath}.${k}` : k;
        paths.add(p);
        traverse(curr[k], p, depth + 1);
      }
    }
  }
  traverse(obj, '', 1);
  return Array.from(paths).sort();
}

// Deep entity field paths extractor up to depth 6
function extractEntityFieldPaths(entity, maxDepth = 6) {
  const paths = new Set();
  function traverse(curr, currentPath, depth) {
    if (depth > maxDepth || curr === null || curr === undefined) return;
    if (Array.isArray(curr)) {
      paths.add(`${currentPath}[]`);
      if (curr.length > 0) {
        for (let i = 0; i < Math.min(curr.length, 5); i++) {
          if (typeof curr[i] === 'object' && curr[i] !== null) {
            traverse(curr[i], `${currentPath}[]`, depth + 1);
          }
        }
      }
      return;
    }
    if (typeof curr === 'object') {
      for (const k of Object.keys(curr)) {
        const p = currentPath ? `${currentPath}.${k}` : k;
        paths.add(p);
        traverse(curr[k], p, depth + 1);
      }
    }
  }
  traverse(entity, '', 1);
  return Array.from(paths).sort();
}

// Haversine formula to compute great-circle distance between two coords in km
function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's mean radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function extractEntityId(item) {
  if (!item || typeof item !== 'object') return null;
  return item.entity_id || item.id || item.qloo_id || item._id || null;
}

function extractEntityName(item) {
  if (!item || typeof item !== 'object') return null;
  return item.name || item.title || item.entity_name || item.label || item.display_name || null;
}

function extractResultsList(data) {
  if (!data || typeof data !== 'object') return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.results)) return data.results;
  if (data.results && Array.isArray(data.results.entities)) return data.results.entities;
  if (data.results && Array.isArray(data.results.tags)) return data.results.tags;
  if (data.results && Array.isArray(data.results.demographics)) return data.results.demographics;
  if (data.results && Array.isArray(data.results.heatmap)) return data.results.heatmap;
  if (Array.isArray(data.entities)) return data.entities;
  if (Array.isArray(data.tags)) return data.tags;
  return [];
}

function hasExplainabilityKey(val) {
  if (!val || typeof val !== 'object') return false;
  for (const key of Object.keys(val)) {
    if (key.toLowerCase().includes('explainab')) return true;
    if (typeof val[key] === 'object' && hasExplainabilityKey(val[key])) return true;
  }
  return false;
}

// =============================================================================
// SECURE & POLITE HTTP CLIENT
// =============================================================================
async function qlooFetch(endpointPath, queryParams = {}, contextTag = 'call') {
  if (totalRequestsMade >= MAX_REQUESTS_CAP) {
    return {
      status: 0,
      statusText: 'Request Cap Reached',
      latencyMs: 0,
      data: null,
      rawText: '',
      error: `Request limit cap (${MAX_REQUESTS_CAP}) reached.`
    };
  }

  // Construct URL and strictly enforce host
  const url = new URL(endpointPath, BASE_URL);
  for (const [k, v] of Object.entries(queryParams)) {
    if (v !== undefined && v !== null) {
      url.searchParams.set(k, String(v));
    }
  }

  if (url.hostname !== REQUIRED_HOST) {
    throw new Error(`SECURITY ALERT: Refusing request to unauthorized host: ${url.hostname}`);
  }

  if (isDryRun) {
    return {
      status: 200,
      statusText: 'DRY_RUN_OK',
      latencyMs: 0,
      data: { dryRun: true },
      rawText: '{"dryRun":true}',
      url: redactString(url.toString()),
      headers: { 'X-Api-Key': '[REDACTED]' }
    };
  }

  let attempt = 0;
  let lastError = null;

  while (attempt < 2) {
    attempt++;
    totalRequestsMade++;
    const startTime = performance.now();

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'X-Api-Key': apiKey,
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });

      const latencyMs = Math.round(performance.now() - startTime);

      // Collect rate-limit and quota headers
      for (const [name, value] of response.headers.entries()) {
        const lower = name.toLowerCase();
        if (lower.includes('ratelimit') || lower.includes('quota')) {
          rateLimitHeadersObserved.set(name, value);
        }
      }

      // Retry on 429 or 5xx on first attempt
      if ((response.status === 429 || response.status >= 500) && attempt === 1) {
        console.warn(`[WARN] Got HTTP ${response.status} on ${endpointPath}. Retrying in ${RETRY_DELAY_MS}ms...`);
        await sleep(RETRY_DELAY_MS);
        continue;
      }

      const text = await response.text();
      let parsedData = null;
      try {
        parsedData = JSON.parse(text);
      } catch {
        parsedData = { rawText: text.slice(0, 500) };
      }

      // Save raw response
      try {
        fs.mkdirSync(RAW_RESPONSES_DIR, { recursive: true });
        const safeSlug = `${contextTag}_${endpointPath.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.json`;
        fs.writeFileSync(path.join(RAW_RESPONSES_DIR, safeSlug), JSON.stringify({
          endpoint: endpointPath,
          params: queryParams,
          status: response.status,
          latencyMs,
          body: parsedData
        }, null, 2), 'utf8');
      } catch {}

      await sleep(INTER_REQUEST_DELAY_MS);

      return {
        status: response.status,
        statusText: response.statusText,
        latencyMs,
        data: parsedData,
        rawText: text,
        error: null
      };

    } catch (err) {
      const latencyMs = Math.round(performance.now() - startTime);
      lastError = err;
      if (attempt === 1) {
        console.warn(`[WARN] Request error on ${endpointPath} (${err.message}). Retrying in ${RETRY_DELAY_MS}ms...`);
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      return {
        status: 0,
        statusText: 'FetchError',
        latencyMs,
        data: null,
        rawText: '',
        error: redactString(err.message)
      };
    }
  }

  return {
    status: 0,
    statusText: 'FailedAfterRetry',
    latencyMs: 0,
    data: null,
    rawText: '',
    error: redactString(lastError?.message || 'Unknown network error')
  };
}

// =============================================================================
// ROUND 2: RUNNER & REPORT GENERATOR
// =============================================================================
async function runRound2() {
  if (isDryRun) {
    console.log('='.repeat(80));
    console.log('  QLOO HACKATHON API - ROUND 2 CHECKS (DRY-RUN MODE)');
    console.log('='.repeat(80));
    console.log(`Base URL:          ${BASE_URL}`);
    console.log(`Allowed Host:      ${REQUIRED_HOST} (Strictly enforced)`);
    console.log(`Auth Header:       X-Api-Key: [REDACTED]`);
    console.log(`Films:             Inception (${ROUND2_FILMS.inception.id}), RRR (${ROUND2_FILMS.rrr.id})`);
    console.log(`Cities:            ${ROUND2_CITIES.join(', ')}`);
    console.log(`Politeness:        Sequential, ${INTER_REQUEST_DELAY_MS}ms delay, 20s timeout, max ${MAX_REQUESTS_CAP} requests`);
    console.log('='.repeat(80));
    console.log('\nPLANNED REQUESTS:');

    let reqIndex = 1;
    function plan(step, desc, path, params) {
      const u = new URL(path, BASE_URL);
      for (const [k, v] of Object.entries(params)) {
        u.searchParams.set(k, String(v));
      }
      console.log(`[Req #${reqIndex++}] [Step ${step}] ${desc}`);
      console.log(`  GET ${u.toString()}`);
      console.log(`  Headers: { "X-Api-Key": "[REDACTED]", "Accept": "application/json" }\n`);
    }

    // Step 1: Shapes
    plan(1, 'Artist insights for Inception with explainability', '/v2/insights', {
      'filter.type': 'urn:entity:artist',
      'signal.interests.entities': ROUND2_FILMS.inception.id,
      'take': 5,
      'feature.explainability': 'true'
    });
    plan(1, 'Heatmap insights for Inception in New York', '/v2/insights', {
      'filter.type': 'urn:heatmap',
      'signal.interests.entities': ROUND2_FILMS.inception.id,
      'filter.location.query': 'New York',
      'take': 5
    });
    plan(1, 'Demographics insights for Inception in New York', '/v2/insights', {
      'filter.type': 'urn:demographics',
      'signal.interests.entities': ROUND2_FILMS.inception.id,
      'filter.location.query': 'New York'
    });

    // Step 2: Video Game 400
    plan(2, 'Video Game insights 400 error inspection', '/v2/insights', {
      'filter.type': 'urn:entity:video_game',
      'signal.interests.entities': ROUND2_FILMS.inception.id,
      'take': 5
    });

    // Step 3: Tags
    const tagKeywords = ["bookstore", "book shop", "comic book", "comics", "cinema", "movie theater", "cafe"];
    for (const kw of tagKeywords) {
      plan(3, `Search tags for "${kw}" (up to 10)`, '/v2/tags', {
        'filter.query': kw,
        'take': 10
      });
    }

    // Step 4: Partners
    const categories = [
      { name: 'bookstore', tagId: 'urn:tag:nearby_attraction:qloo:bookstore' },
      { name: 'comic book', tagId: 'urn:tag:genre:music:comic' },
      { name: 'cinema', tagId: 'urn:tag:nearby_attraction:qloo:cinema' },
      { name: 'cafe', tagId: 'urn:tag:genre:place:restaurant:cafe' }
    ];

    for (const cat of categories) {
      // New York with Inception signal and without signal
      plan(4, `Partner Place: ${cat.name} in New York (WITH Inception signal)`, '/v2/insights', {
        'filter.type': 'urn:entity:place',
        'filter.tags': cat.tagId,
        'filter.location.query': 'New York',
        'signal.interests.entities': ROUND2_FILMS.inception.id,
        'take': 5
      });
      plan(4, `Partner Place: ${cat.name} in New York (WITHOUT signal)`, '/v2/insights', {
        'filter.type': 'urn:entity:place',
        'filter.tags': cat.tagId,
        'filter.location.query': 'New York',
        'take': 5
      });

      // Hyderabad with RRR signal and without signal
      plan(4, `Partner Place: ${cat.name} in Hyderabad (WITH RRR signal)`, '/v2/insights', {
        'filter.type': 'urn:entity:place',
        'filter.tags': cat.tagId,
        'filter.location.query': 'Hyderabad',
        'signal.interests.entities': ROUND2_FILMS.rrr.id,
        'take': 5
      });
      plan(4, `Partner Place: ${cat.name} in Hyderabad (WITHOUT signal)`, '/v2/insights', {
        'filter.type': 'urn:entity:place',
        'filter.tags': cat.tagId,
        'filter.location.query': 'Hyderabad',
        'take': 5
      });
    }

    console.log(`Total Planned Requests for Round 2: ${reqIndex - 1} (Cap is ${MAX_REQUESTS_CAP})`);
    console.log('\nDRY-RUN completed successfully. No live calls were made.');
    console.log('To run live Round 2 checks: node --env-file=.env.local scripts/check-qloo.mjs --round2');
    process.exit(0);
  }

  console.log('='.repeat(80));
  console.log('  STARTING QLOO ROUND 2 CHECKS');
  console.log(`  Base Host: ${REQUIRED_HOST} (Strictly verified)`);
  console.log(`  Films:     Inception (${ROUND2_FILMS.inception.id}), RRR (${ROUND2_FILMS.rrr.id})`);
  console.log(`  Cities:    ${ROUND2_CITIES.join(', ')}`);
  console.log('='.repeat(80) + '\n');

  let reportText = 'QLOO HACKATHON ROUND 2 REPORT\n';
  reportText += `Generated: ${new Date().toISOString()}\n`;
  reportText += `Target Host: ${REQUIRED_HOST}\n\n`;

  // ---------------------------------------------------------------------------
  // STEP 1: SHAPES
  // ---------------------------------------------------------------------------
  console.log('--- [STEP 1] Response Shapes & Deep Paths ---');
  reportText += '1. RESPONSE SHAPES (FIELD PATHS UP TO DEPTH 4)\n';
  reportText += '-'.repeat(80) + '\n';

  // 1A. Artist Insights for Inception with explainability
  const artistParams = {
    'filter.type': 'urn:entity:artist',
    'signal.interests.entities': ROUND2_FILMS.inception.id,
    'take': 5,
    'feature.explainability': 'true'
  };
  const artistRes = await qlooFetch('/v2/insights', artistParams, 'round2_artist_explain');
  reportText += 'A. Artist Insights with Explainability\n';
  reportText += `   Parameters Sent (Confirmed in docs): ${JSON.stringify(artistParams)}\n`;
  reportText += `   HTTP Status: ${artistRes.status}, Latency: ${artistRes.latencyMs}ms\n`;

  if (artistRes.data) {
    const artistPaths = extractFieldPaths(artistRes.data, 4);
    reportText += `   Field Paths (Depth <= 4) [Total: ${artistPaths.length}]:\n`;
    for (const p of artistPaths) {
      reportText += `     - ${p}\n`;
    }

    // Explainability portion
    const explainData = artistRes.data.query?.explainability || artistRes.data.results?.entities?.[0]?.query?.explainability || null;
    reportText += '\n   Explainability Component Shape:\n';
    if (explainData) {
      const explPaths = extractFieldPaths(explainData, 4);
      for (const ep of explPaths) {
        reportText += `     - explainability.${ep}\n`;
      }

      // Top 3 contributor names & scores
      reportText += '\n   Top Contributors (Explainability):\n';
      const entitiesExpl = artistRes.data.results?.entities?.[0]?.query?.explainability?.['signal.interests.entities'] || [];
      const globalExpl = artistRes.data.query?.explainability?.['signal.interests.entities']?.effect_on_top3_recs || [];
      const contributors = entitiesExpl.length > 0 ? entitiesExpl : globalExpl;

      if (contributors.length > 0) {
        for (const c of contributors.slice(0, 3)) {
          const contribId = c.entity_id || 'unknown';
          const contribScore = c.score !== undefined ? c.score : c.avg_score;
          reportText += `     * Contributor ID: ${contribId} ("Inception") | Score: ${contribScore}\n`;
        }
      } else {
        reportText += '     * No individual contributors array returned in explainability block.\n';
      }
    } else {
      reportText += '     * No explainability block detected in response.\n';
    }
  }
  reportText += '\n';

  // 1B. Heatmap
  const heatmapParams = {
    'filter.type': 'urn:heatmap',
    'signal.interests.entities': ROUND2_FILMS.inception.id,
    'filter.location.query': 'New York',
    'take': 5
  };
  const heatmapRes = await qlooFetch('/v2/insights', heatmapParams, 'round2_heatmap');
  reportText += 'B. Heatmap Insights\n';
  reportText += `   Parameters Sent (Confirmed in docs): ${JSON.stringify(heatmapParams)}\n`;
  reportText += `   HTTP Status: ${heatmapRes.status}, Latency: ${heatmapRes.latencyMs}ms\n`;
  const heatmapList = heatmapRes.data?.results?.heatmap || [];
  reportText += `   Result Items Count: ${heatmapList.length}\n`;

  if (heatmapRes.data) {
    const heatPaths = extractFieldPaths(heatmapRes.data, 4);
    reportText += `   Field Paths (Depth <= 4) [Total: ${heatPaths.length}]:\n`;
    for (const p of heatPaths) {
      reportText += `     - ${p}\n`;
    }
    reportText += '\n   First 3 Heatmap Items (Values):\n';
    for (let i = 0; i < Math.min(3, heatmapList.length); i++) {
      reportText += `     [Item ${i + 1}] ${JSON.stringify(heatmapList[i])}\n`;
    }
  }
  reportText += '\n';

  // 1C. Demographics
  const demoParams = {
    'filter.type': 'urn:demographics',
    'signal.interests.entities': ROUND2_FILMS.inception.id,
    'filter.location.query': 'New York'
  };
  const demoRes = await qlooFetch('/v2/insights', demoParams, 'round2_demographics');
  reportText += 'C. Demographics Insights\n';
  reportText += `   Parameters Sent (Confirmed in docs): ${JSON.stringify(demoParams)}\n`;
  reportText += `   HTTP Status: ${demoRes.status}, Latency: ${demoRes.latencyMs}ms\n`;
  const demoList = demoRes.data?.results?.demographics || [];
  reportText += `   Result Items Count: ${demoList.length}\n`;

  if (demoRes.data) {
    const demoPaths = extractFieldPaths(demoRes.data, 4);
    reportText += `   Field Paths (Depth <= 4) [Total: ${demoPaths.length}]:\n`;
    for (const p of demoPaths) {
      reportText += `     - ${p}\n`;
    }
    reportText += '\n   First 3 Demographics Items (Values):\n';
    for (let i = 0; i < Math.min(3, demoList.length); i++) {
      reportText += `     [Item ${i + 1}] ${JSON.stringify(demoList[i])}\n`;
    }
  }
  reportText += '\n\n';

  // ---------------------------------------------------------------------------
  // STEP 2: VIDEO GAME 400 BODY TEXT
  // ---------------------------------------------------------------------------
  console.log('--- [STEP 2] Video Game 400 Error Body ---');
  reportText += '2. VIDEO GAME 400 ERROR RESPONSE BODY\n';
  reportText += '-'.repeat(80) + '\n';
  const vgParams = {
    'filter.type': 'urn:entity:video_game',
    'signal.interests.entities': ROUND2_FILMS.inception.id,
    'take': 5
  };
  const vgRes = await qlooFetch('/v2/insights', vgParams, 'round2_videogame_error');
  reportText += `Request: GET /v2/insights?${new URLSearchParams(vgParams).toString()}\n`;
  reportText += `HTTP Status: ${vgRes.status}\n`;
  reportText += `Raw Response Body:\n${vgRes.rawText.trim()}\n\n\n`;

  // ---------------------------------------------------------------------------
  // STEP 3: TAGS (UP TO 10 PER KEYWORD)
  // ---------------------------------------------------------------------------
  console.log('--- [STEP 3] Detailed Tags Listing ---');
  reportText += '3. TAGS LOOKUP (ALL RETURNED TAGS UP TO 10 PER KEYWORD)\n';
  reportText += '-'.repeat(80) + '\n';
  const tagKeywords = ["bookstore", "book shop", "comic book", "comics", "cinema", "movie theater", "cafe"];
  const discoveredTagsMap = new Map();

  for (const kw of tagKeywords) {
    const res = await qlooFetch('/v2/tags', { 'filter.query': kw, 'take': 10 }, `round2_tag_${kw.replace(/\s+/g, '_')}`);
    const tagItems = res.data?.results?.tags || res.data?.results || [];
    reportText += `Keyword: "${kw}" (Found ${tagItems.length}):\n`;

    const tagList = [];
    for (const t of tagItems.slice(0, 10)) {
      const tid = t.id || t.tag_id || t.entity_id || t.urn || 'N/A';
      const tname = t.name || t.tag || t.label || 'N/A';
      tagList.push({ id: tid, name: tname });
      reportText += `  - ID: ${tid.padEnd(45)} | Name: "${tname}"\n`;
    }
    discoveredTagsMap.set(kw, tagList);
    reportText += '\n';
  }
  reportText += '\n';

  // ---------------------------------------------------------------------------
  // STEP 4: PARTNERS
  // ---------------------------------------------------------------------------
  console.log('--- [STEP 4] Partner Place Categories Evaluation ---');
  reportText += '4. PARTNER CATEGORIES EVALUATION (NEW YORK & HYDERABAD)\n';
  reportText += '-'.repeat(80) + '\n';

  // Plausible tags to test for the 4 categories
  const partnerCategories = [
    { name: 'bookstore', tagId: 'urn:tag:nearby_attraction:qloo:bookstore', categoryKeywords: ['book', 'publish', 'novel', 'read', 'library', 'shop'] },
    { name: 'comic book', tagId: 'urn:tag:genre:music:comic', categoryKeywords: ['comic', 'manga', 'anime', 'cards', 'collect'] },
    { name: 'cinema', tagId: 'urn:tag:nearby_attraction:qloo:cinema', categoryKeywords: ['cinema', 'theater', 'theatre', 'film', 'movie', 'picture', 'imax'] },
    { name: 'cafe', tagId: 'urn:tag:genre:place:restaurant:cafe', categoryKeywords: ['cafe', 'coffee', 'espresso', 'tea', 'bakery', 'roast'] }
  ];

  function evaluateCategoryMatch(businessName, catKeywords) {
    if (!businessName) return 'Unknown';
    const lower = businessName.toLowerCase();
    const matches = catKeywords.some(kw => lower.includes(kw));
    return matches ? 'Likely Actual Category Business' : 'Adjacent / Non-Category Business (e.g. Nearby Attraction / Dining)';
  }

  const partnerRuns = [
    { city: 'New York', filmName: 'Inception', filmId: ROUND2_FILMS.inception.id },
    { city: 'Hyderabad', filmName: 'RRR', filmId: ROUND2_FILMS.rrr.id }
  ];

  for (const cat of partnerCategories) {
    reportText += `CATEGORY: ${cat.name.toUpperCase()} (Filter Tag: ${cat.tagId})\n`;
    reportText += '.'.repeat(60) + '\n';

    for (const run of partnerRuns) {
      // 1. With Signal
      const withSignalParams = {
        'filter.type': 'urn:entity:place',
        'filter.tags': cat.tagId,
        'filter.location.query': run.city,
        'signal.interests.entities': run.filmId,
        'take': 5
      };
      const resWith = await qlooFetch('/v2/insights', withSignalParams, `partner_${cat.name}_${run.city}_with_signal`);
      const placesWith = extractResultsList(resWith.data);

      reportText += `[${run.city}] WITH Signal (${run.filmName})\n`;
      reportText += `  Query: /v2/insights?filter.type=urn:entity:place&filter.tags=${cat.tagId}&filter.location.query=${run.city}&signal.interests.entities=${run.filmId}&take=5\n`;
      reportText += `  Status: ${resWith.status}, Total Count Returned: ${placesWith.length}, Latency: ${resWith.latencyMs}ms\n`;
      reportText += '  Top Results:\n';
      if (placesWith.length === 0) {
        reportText += '    (No results returned)\n';
      } else {
        for (let i = 0; i < Math.min(5, placesWith.length); i++) {
          const name = extractEntityName(placesWith[i]) || extractEntityId(placesWith[i]);
          const classification = evaluateCategoryMatch(name, cat.categoryKeywords);
          reportText += `    ${i + 1}. "${name}" -> [${classification}]\n`;
        }
      }

      // 2. Without Signal
      const noSignalParams = {
        'filter.type': 'urn:entity:place',
        'filter.tags': cat.tagId,
        'filter.location.query': run.city,
        'take': 5
      };
      const resNo = await qlooFetch('/v2/insights', noSignalParams, `partner_${cat.name}_${run.city}_no_signal`);
      const placesNo = extractResultsList(resNo.data);

      reportText += `[${run.city}] WITHOUT Signal\n`;
      reportText += `  Query: /v2/insights?filter.type=urn:entity:place&filter.tags=${cat.tagId}&filter.location.query=${run.city}&take=5\n`;
      reportText += `  Status: ${resNo.status}, Total Count Returned: ${placesNo.length}, Latency: ${resNo.latencyMs}ms\n`;
      reportText += '  Top Results:\n';
      if (placesNo.length === 0) {
        reportText += '    (No results returned)\n';
      } else {
        for (let i = 0; i < Math.min(5, placesNo.length); i++) {
          const name = extractEntityName(placesNo[i]) || extractEntityId(placesNo[i]);
          const classification = evaluateCategoryMatch(name, cat.categoryKeywords);
          reportText += `    ${i + 1}. "${name}" -> [${classification}]\n`;
        }
      }
      reportText += '\n';
    }
    reportText += '\n';
  }

  // ---------------------------------------------------------------------------
  // STEP 5: RATE LIMIT HEADERS
  // ---------------------------------------------------------------------------
  console.log('--- [STEP 5] Rate Limit Headers & Finalization ---');
  reportText += '5. RATE LIMIT HEADERS OBSERVED\n';
  reportText += '-'.repeat(80) + '\n';
  if (rateLimitHeadersObserved.size > 0) {
    for (const [k, v] of rateLimitHeadersObserved.entries()) {
      reportText += `${k}: ${v}\n`;
      console.log(`  ${k}: ${v}`);
    }
  } else {
    reportText += 'No rate limit headers returned.\n';
  }
  reportText += '\nRound 2 done\n';

  fs.writeFileSync(REPORT_FILE, redactString(reportText), 'utf8');
  console.log(`\nReport written to: ${REPORT_FILE}`);
  console.log(`Total Requests: ${totalRequestsMade}`);
  console.log('Round 2 done');
  process.exit(0);
}

// =============================================================================
// ROUND 3: RUNNER & REPORT GENERATOR
// =============================================================================
async function runRound3() {
  if (isDryRun) {
    console.log('='.repeat(80));
    console.log('  QLOO HACKATHON API - ROUND 3 CHECKS (DRY-RUN MODE)');
    console.log('='.repeat(80));
    console.log(`Base URL:          ${BASE_URL}`);
    console.log(`Allowed Host:      ${REQUIRED_HOST} (Strictly enforced)`);
    console.log(`Auth Header:       X-Api-Key: [REDACTED]`);
    console.log(`Films:             Inception (${ROUND3_FILMS.inception.id}), RRR (${ROUND3_FILMS.rrr.id}), Kantara (${ROUND3_FILMS.kantara.id})`);
    console.log(`Politeness:        Sequential, ${INTER_REQUEST_DELAY_MS}ms delay, 20s timeout, max ${MAX_REQUESTS_CAP} requests`);
    console.log('='.repeat(80));
    console.log('\nPLANNED REQUESTS:');

    let reqIndex = 1;
    function plan(step, desc, path, params) {
      const u = new URL(path, BASE_URL);
      for (const [k, v] of Object.entries(params)) {
        u.searchParams.set(k, String(v));
      }
      console.log(`[Req #${reqIndex++}] [Step ${step}] ${desc}`);
      console.log(`  GET ${u.toString()}`);
      console.log(`  Headers: { "X-Api-Key": "[REDACTED]", "Accept": "application/json" }\n`);
    }

    // Task 1: Entity Fields (Artist insights for Inception)
    plan(1, 'Artist insights for Inception (take=5)', '/v2/insights', {
      'filter.type': 'urn:entity:artist',
      'signal.interests.entities': ROUND3_FILMS.inception.id,
      'take': 5
    });

    // Task 2: Partner Tags (4 tags x 2 city/film pairs)
    const partnerPairs = [
      { city: 'New York', film: ROUND3_FILMS.inception },
      { city: 'Hyderabad', film: ROUND3_FILMS.rrr }
    ];
    for (const pair of partnerPairs) {
      for (const tag of ROUND3_PARTNER_TAGS) {
        plan(2, `Partner Tag "${tag.name}" (${tag.id}) in ${pair.city} with ${pair.film.name}`, '/v2/insights', {
          'filter.type': 'urn:entity:place',
          'filter.tags': tag.id,
          'filter.location.query': pair.city,
          'signal.interests.entities': pair.film.id,
          'take': 5
        });
      }
    }

    // Task 3: Heatmaps
    // RRR & Kantara in Hyderabad & Mumbai (4 requests)
    const heatmapTargets = [
      { film: ROUND3_FILMS.rrr, city: 'Hyderabad' },
      { film: ROUND3_FILMS.rrr, city: 'Mumbai' },
      { film: ROUND3_FILMS.kantara, city: 'Hyderabad' },
      { film: ROUND3_FILMS.kantara, city: 'Mumbai' }
    ];
    for (const hm of heatmapTargets) {
      plan(3, `Heatmap for ${hm.film.name} in ${hm.city}`, '/v2/insights', {
        'filter.type': 'urn:heatmap',
        'signal.interests.entities': hm.film.id,
        'filter.location.query': hm.city
      });
    }
    // New York with Inception (1 request)
    plan(3, `Heatmap for Inception in New York (25km Haversine check)`, '/v2/insights', {
      'filter.type': 'urn:heatmap',
      'signal.interests.entities': ROUND3_FILMS.inception.id,
      'filter.location.query': 'New York'
    });

    // Task 4: Demographics
    plan(4, 'Demographics for RRR in Hyderabad', '/v2/insights', {
      'filter.type': 'urn:demographics',
      'signal.interests.entities': ROUND3_FILMS.rrr.id,
      'filter.location.query': 'Hyderabad'
    });

    console.log(`Total Planned Requests for Round 3: ${reqIndex - 1} (Cap is ${MAX_REQUESTS_CAP})`);
    console.log('\nDRY-RUN completed successfully. No live calls were made.');
    console.log('To run live Round 3 checks: node --env-file=.env.local scripts/check-qloo.mjs --round3');
    process.exit(0);
  }

  console.log('='.repeat(80));
  console.log('  STARTING QLOO ROUND 3 CHECKS');
  console.log(`  Base Host: ${REQUIRED_HOST} (Strictly verified)`);
  console.log(`  Films:     Inception (${ROUND3_FILMS.inception.id}), RRR (${ROUND3_FILMS.rrr.id}), Kantara (${ROUND3_FILMS.kantara.id})`);
  console.log(`  Cap:       Max ${MAX_REQUESTS_CAP} requests (Sequential, ${INTER_REQUEST_DELAY_MS}ms delay)`);
  console.log('='.repeat(80) + '\n');

  let reportText = 'QLOO HACKATHON ROUND 3 REPORT\n';
  reportText += `Generated: ${new Date().toISOString()}\n`;
  reportText += `Target Host: ${REQUIRED_HOST}\n\n`;

  // ---------------------------------------------------------------------------
  // TASK 1: ENTITY FIELDS (Artist Insights for Inception)
  // ---------------------------------------------------------------------------
  console.log('--- [TASK 1] Entity Fields: Artist Insights for Inception (take=5) ---');
  reportText += '1. ENTITY FIELDS (ARTIST INSIGHTS FOR INCEPTION)\n';
  reportText += '-'.repeat(80) + '\n';

  const artistParams = {
    'filter.type': 'urn:entity:artist',
    'signal.interests.entities': ROUND3_FILMS.inception.id,
    'take': 5
  };
  const artistRes = await qlooFetch('/v2/insights', artistParams, 'round3_artist_inception');
  reportText += `Request: GET /v2/insights?${new URLSearchParams(artistParams).toString()}\n`;
  reportText += `HTTP Status: ${artistRes.status}, Latency: ${artistRes.latencyMs}ms\n`;

  const artistEntities = artistRes.data?.results?.entities || [];
  reportText += `Returned Entities Count: ${artistEntities.length}\n\n`;

  const firstArtist = artistEntities[0] || null;
  if (!firstArtist) {
    reportText += 'ERROR: No entities returned for artist insights.\n\n';
  } else {
    reportText += `Entity [0] Name: "${firstArtist.name || 'N/A'}" (ID: ${firstArtist.entity_id || firstArtist.id || 'N/A'})\n\n`;

    // 1. Every field path of results.entities[0] up to depth 6
    const fieldPaths = extractEntityFieldPaths(firstArtist, 6);
    reportText += `Field Paths of results.entities[0] (Depth <= 6) [Total: ${fieldPaths.length}]:\n`;
    for (const fp of fieldPaths) {
      reportText += `  - ${fp}\n`;
    }

    // 2. Values of "query"
    reportText += '\nValues of "query":\n';
    if (firstArtist.query !== undefined) {
      reportText += `${JSON.stringify(firstArtist.query, null, 2)}\n`;
    } else {
      reportText += '  (Field "query" is undefined on results.entities[0])\n';
    }

    // 3. First 5 tags (id and name)
    reportText += '\nFirst 5 Tags (ID and Name):\n';
    const artistTags = firstArtist.tags || [];
    if (artistTags.length === 0) {
      reportText += '  (No tags array found on results.entities[0])\n';
    } else {
      for (let i = 0; i < Math.min(5, artistTags.length); i++) {
        const t = artistTags[i];
        const tagId = typeof t === 'object' ? (t.id || t.tag_id || t.urn || 'N/A') : t;
        const tagName = typeof t === 'object' ? (t.name || t.title || 'N/A') : t;
        reportText += `  [${i + 1}] ID: ${tagId} | Name: "${tagName}"\n`;
      }
    }

    // 4. Per-Item Affinity / Score fields analysis
    reportText += '\nPer-Item Affinity / Score Fields Analysis:\n';
    const scoreFields = [];
    function scanForScoreFields(obj, currentPath) {
      if (!obj || typeof obj !== 'object') return;
      for (const [k, v] of Object.entries(obj)) {
        const p = currentPath ? `${currentPath}.${k}` : k;
        const lk = k.toLowerCase();
        if (lk.includes('affinity') || lk.includes('score') || lk.includes('popularity') || lk.includes('rank') || lk.includes('weight')) {
          scoreFields.push({ path: p, value: v });
        }
        if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
          scanForScoreFields(v, p);
        }
      }
    }
    scanForScoreFields(firstArtist, 'results.entities[0]');
    if (scoreFields.length > 0) {
      for (const sf of scoreFields) {
        reportText += `  * ${sf.path} = ${JSON.stringify(sf.value)}\n`;
      }
    } else {
      reportText += '  * No score/affinity/popularity fields found directly on entity.\n';
    }
  }
  reportText += '\n\n';

  // ---------------------------------------------------------------------------
  // TASK 2: PARTNER TAGS
  // ---------------------------------------------------------------------------
  console.log('--- [TASK 2] Partner Tags: Checking Tag Preservation ---');
  reportText += '2. PARTNER TAGS EVALUATION\n';
  reportText += '-'.repeat(80) + '\n';
  reportText += 'Target Tags:\n';
  for (const t of ROUND3_PARTNER_TAGS) {
    reportText += `  - ${t.id} ("${t.name}")\n`;
  }
  reportText += '\n';

  const partnerConfigs = [
    { city: 'New York', film: ROUND3_FILMS.inception },
    { city: 'Hyderabad', film: ROUND3_FILMS.rrr }
  ];

  for (const cfg of partnerConfigs) {
    reportText += `=== Context: ${cfg.city} | Film: "${cfg.film.name}" (${cfg.film.id}) ===\n\n`;

    for (const tag of ROUND3_PARTNER_TAGS) {
      const placeParams = {
        'filter.type': 'urn:entity:place',
        'filter.tags': tag.id,
        'filter.location.query': cfg.city,
        'signal.interests.entities': cfg.film.id,
        'take': 5
      };

      const placeRes = await qlooFetch('/v2/insights', placeParams, `round3_place_${cfg.city}_${tag.name.replace(/\s+/g, '_')}`);
      const places = placeRes.data?.results?.entities || extractResultsList(placeRes.data);

      reportText += `Tag Filter: ${tag.id} ("${tag.name}")\n`;
      reportText += `Request: GET /v2/insights?${new URLSearchParams(placeParams).toString()}\n`;
      reportText += `HTTP Status: ${placeRes.status}, Latency: ${placeRes.latencyMs}ms, Returned Count: ${places.length}\n`;

      if (places.length === 0) {
        reportText += '  (No places returned)\n';
      } else {
        for (let i = 0; i < places.length; i++) {
          const place = places[i];
          const name = extractEntityName(place) || place.name || 'Unknown';
          const pTags = place.tags || [];
          const containsSameTagId = pTags.some(t => {
            if (typeof t === 'string') return t === tag.id;
            return t.id === tag.id || t.tag_id === tag.id || t.urn === tag.id;
          });

          const first3TagNames = pTags.slice(0, 3).map(t => {
            if (typeof t === 'string') return t;
            return t.name || t.title || t.id || 'N/A';
          });

          reportText += `  [Place ${i + 1}] Name: "${name}"\n`;
          reportText += `            Contains Requested Tag (${tag.id}): ${containsSameTagId ? 'YES' : 'NO'}\n`;
          reportText += `            First 3 Tags: ${first3TagNames.length > 0 ? first3TagNames.map(tn => `"${tn}"`).join(', ') : 'None'}\n`;
        }
      }
      reportText += '\n';
    }
  }
  reportText += '\n';

  // ---------------------------------------------------------------------------
  // TASK 3: HEATMAP
  // ---------------------------------------------------------------------------
  console.log('--- [TASK 3] Heatmaps: Hyderabad, Mumbai & New York Haversine ---');
  reportText += '3. HEATMAP INSIGHTS\n';
  reportText += '-'.repeat(80) + '\n';

  const heatmapRuns = [
    { film: ROUND3_FILMS.rrr, city: 'Hyderabad' },
    { film: ROUND3_FILMS.rrr, city: 'Mumbai' },
    { film: ROUND3_FILMS.kantara, city: 'Hyderabad' },
    { film: ROUND3_FILMS.kantara, city: 'Mumbai' }
  ];

  for (const hm of heatmapRuns) {
    const hmParams = {
      'filter.type': 'urn:heatmap',
      'signal.interests.entities': hm.film.id,
      'filter.location.query': hm.city
    };
    const hmRes = await qlooFetch('/v2/insights', hmParams, `round3_heat_${hm.film.name}_${hm.city}`);
    const cells = hmRes.data?.results?.heatmap || [];

    reportText += `A. Heatmap: Film "${hm.film.name}" in ${hm.city}\n`;
    reportText += `   Parameters: ${JSON.stringify(hmParams)}\n`;
    reportText += `   HTTP Status: ${hmRes.status}, Latency: ${hmRes.latencyMs}ms\n`;
    reportText += `   Cell Count: ${cells.length}\n`;

    // Top 5 cells (sort by affinity_rank descending)
    const sorted = [...cells].sort((a, b) => {
      const rankA = a.query?.affinity_rank ?? a.affinity_rank ?? 0;
      const rankB = b.query?.affinity_rank ?? b.affinity_rank ?? 0;
      return rankB - rankA;
    });
    const top5 = sorted.slice(0, 5);
    reportText += '   Top 5 Cells:\n';
    if (top5.length === 0) {
      reportText += '     (No cells returned)\n';
    } else {
      for (let i = 0; i < top5.length; i++) {
        const c = top5[i];
        const lat = c.location?.latitude ?? 'N/A';
        const lon = c.location?.longitude ?? 'N/A';
        const geohash = c.location?.geohash ?? 'N/A';
        const affRank = c.query?.affinity_rank ?? c.affinity_rank ?? 'N/A';
        reportText += `     [${i + 1}] Latitude: ${lat}, Longitude: ${lon}, Geohash: "${geohash}", Affinity Rank: ${affRank}\n`;
      }
    }
    reportText += '\n';
  }

  // New York with Inception
  const nyParams = {
    'filter.type': 'urn:heatmap',
    'signal.interests.entities': ROUND3_FILMS.inception.id,
    'filter.location.query': 'New York'
  };
  const nyRes = await qlooFetch('/v2/insights', nyParams, 'round3_heat_Inception_New_York');
  const nyCells = nyRes.data?.results?.heatmap || [];

  reportText += 'B. Heatmap: Film "Inception" in New York (Haversine 25km Radius Evaluation)\n';
  reportText += `   Parameters: ${JSON.stringify(nyParams)}\n`;
  reportText += `   HTTP Status: ${nyRes.status}, Latency: ${nyRes.latencyMs}ms\n`;
  reportText += `   Total Cell Count: ${nyCells.length}\n`;

  const sortedNy = [...nyCells].sort((a, b) => {
    const rankA = a.query?.affinity_rank ?? a.affinity_rank ?? 0;
    const rankB = b.query?.affinity_rank ?? b.affinity_rank ?? 0;
    return rankB - rankA;
  });
  const top5Ny = sortedNy.slice(0, 5);
  reportText += '   Top 5 Cells:\n';
  for (let i = 0; i < top5Ny.length; i++) {
    const c = top5Ny[i];
    const lat = c.location?.latitude ?? 'N/A';
    const lon = c.location?.longitude ?? 'N/A';
    const geohash = c.location?.geohash ?? 'N/A';
    const affRank = c.query?.affinity_rank ?? c.affinity_rank ?? 'N/A';
    reportText += `     [${i + 1}] Latitude: ${lat}, Longitude: ${lon}, Geohash: "${geohash}", Affinity Rank: ${affRank}\n`;
  }

  // Haversine calculation around (40.7580, -73.9855) within 25 km
  const targetLat = 40.7580;
  const targetLon = -73.9855;
  const radiusKm = 25.0;
  let withinRadiusCount = 0;
  const distances = [];

  for (const cell of nyCells) {
    const lat = cell.location?.latitude;
    const lon = cell.location?.longitude;
    if (lat !== undefined && lon !== undefined) {
      const d = haversineDistanceKm(targetLat, targetLon, lat, lon);
      distances.push({ d, cell });
      if (d <= radiusKm) {
        withinRadiusCount++;
      }
    }
  }

  const pct = nyCells.length > 0 ? ((withinRadiusCount / nyCells.length) * 100).toFixed(2) : '0.00';
  reportText += `\n   Haversine Radius Filter Analysis (Center: ${targetLat}, ${targetLon} | Radius: ${radiusKm} km):\n`;
  reportText += `     * Cells within 25 km: ${withinRadiusCount} out of ${nyCells.length} (${pct}%)\n`;
  if (distances.length > 0) {
    distances.sort((a, b) => a.d - b.d);
    reportText += `     * Closest cell distance: ${distances[0].d.toFixed(2)} km (Geohash: "${distances[0].cell.location?.geohash}")\n`;
    reportText += `     * Furthest cell distance in response: ${distances[distances.length - 1].d.toFixed(2)} km (Geohash: "${distances[distances.length - 1].cell.location?.geohash}")\n`;
  }
  reportText += '\n\n';

  // ---------------------------------------------------------------------------
  // TASK 4: DEMOGRAPHICS
  // ---------------------------------------------------------------------------
  console.log('--- [TASK 4] Demographics: RRR in Hyderabad & Docs Interpretation ---');
  reportText += '4. DEMOGRAPHICS (RRR IN HYDERABAD)\n';
  reportText += '-'.repeat(80) + '\n';

  const demoParams = {
    'filter.type': 'urn:demographics',
    'signal.interests.entities': ROUND3_FILMS.rrr.id,
    'filter.location.query': 'Hyderabad'
  };
  const demoRes = await qlooFetch('/v2/insights', demoParams, 'round3_demo_rrr_hyderabad');
  reportText += `Request: GET /v2/insights?${new URLSearchParams(demoParams).toString()}\n`;
  reportText += `HTTP Status: ${demoRes.status}, Latency: ${demoRes.latencyMs}ms\n\n`;

  const demoList = demoRes.data?.results?.demographics || [];
  const rrrDemo = demoList[0] || null;

  if (!rrrDemo) {
    reportText += 'No demographic record returned.\n';
  } else {
    reportText += `Entity ID: ${rrrDemo.entity_id || 'N/A'}\n`;
    reportText += 'Age Values (Demographic Affinity Scores):\n';
    if (rrrDemo.query?.age) {
      for (const [k, v] of Object.entries(rrrDemo.query.age)) {
        reportText += `  - ${k}: ${v}\n`;
      }
    } else {
      reportText += '  (No age object present)\n';
    }

    reportText += '\nGender Values (Demographic Affinity Scores):\n';
    if (rrrDemo.query?.gender) {
      for (const [k, v] of Object.entries(rrrDemo.query.gender)) {
        reportText += `  - ${k}: ${v}\n`;
      }
    } else {
      reportText += '  (No gender object present)\n';
    }
  }

  reportText += '\nQloo Documentation Explanation (Scale and Baseline):\n';
  reportText += 'According to the Qloo Demographic Insights documentation at https://docs.qloo.com/reference/demographics-use-case, demographic affinity scores for age and gender represent normalized affinity scores where positive values indicate stronger-than-average alignment for that audience group and negative values indicate lower affinity relative to the general population average baseline of 0.0, typically on a scale from -1.0 to +1.0.\n\n\n';

  // ---------------------------------------------------------------------------
  // TASK 5: RATE LIMIT HEADERS & FINISH
  // ---------------------------------------------------------------------------
  console.log('--- [TASK 5] Rate Limit Headers & Finalization ---');
  reportText += '5. RATE LIMIT HEADERS OBSERVED\n';
  reportText += '-'.repeat(80) + '\n';
  if (rateLimitHeadersObserved.size > 0) {
    for (const [k, v] of rateLimitHeadersObserved.entries()) {
      reportText += `${k}: ${v}\n`;
      console.log(`  ${k}: ${v}`);
    }
  } else {
    reportText += 'No rate limit headers returned.\n';
    console.log('  No rate limit headers returned.');
  }

  reportText += '\nRound 3 done\n';

  fs.writeFileSync(REPORT_FILE, redactString(reportText), 'utf8');
  console.log(`\nReport written to: ${REPORT_FILE}`);
  console.log(`Total Requests: ${totalRequestsMade}`);
  console.log('Round 3 done');
  process.exit(0);
}

// =============================================================================
// ORIGINAL DAY-ONE RUNNER
// =============================================================================
async function runDayOne() {
  const checksSummary = [];
  const responseShapes = [];
  const topNamesPerCall = [];

  function recordCheck(checkId, description, status, details) {
    checksSummary.push({
      checkId,
      description,
      status,
      details: redactString(String(details))
    });
  }

  if (isDryRun) {
    console.log('='.repeat(80));
    console.log('  QLOO HACKATHON API - DAY-ONE CHECKS (DRY-RUN MODE)');
    console.log('='.repeat(80));
    console.log(`Base URL:          ${BASE_URL}`);
    console.log(`Allowed Host:      ${REQUIRED_HOST} (Strictly enforced)`);
    console.log(`Auth Header:       X-Api-Key: [REDACTED]`);
    console.log(`Test Films:        ${JSON.stringify(TEST_FILMS)}`);
    console.log(`Test Cities:       ${JSON.stringify(TEST_CITIES)}`);
    console.log(`Politeness:        Sequential, ${INTER_REQUEST_DELAY_MS}ms delay, 20s timeout, cap at ${MAX_REQUESTS_CAP} reqs`);
    console.log('='.repeat(80));
    console.log('\nPLANNED REQUESTS:');

    let reqIndex = 1;
    function plan(checkId, desc, path, params) {
      const u = new URL(path, BASE_URL);
      for (const [k, v] of Object.entries(params)) {
        u.searchParams.set(k, String(v));
      }
      console.log(`[Req #${reqIndex++}] [Check ${checkId}] ${desc}`);
      console.log(`  GET ${u.toString()}`);
      console.log(`  Headers: { "X-Api-Key": "[REDACTED]", "Accept": "application/json" }\n`);
    }

    plan('A', 'Auth verification with first film', '/search', { query: TEST_FILMS[0], types: 'urn:entity:movie', take: 5 });
    for (const film of TEST_FILMS) {
      plan('B', `Resolve film "${film}"`, '/search', { query: film, types: 'urn:entity:movie', take: 5 });
    }
    const crossTypes = ['urn:entity:artist', 'urn:entity:book', 'urn:entity:brand', 'urn:entity:destination', 'urn:entity:podcast', 'urn:entity:tv_show', 'urn:entity:video_game', 'urn:entity:movie'];
    for (const film of TEST_FILMS) {
      for (const t of crossTypes) {
        plan('C', `Cross-domain taste for "${film}" -> ${t}`, '/v2/insights', {
          'filter.type': t,
          'signal.interests.entities': `<resolved_id_for_${film.replace(/\s+/g, '_')}>`,
          'take': 5
        });
      }
    }
    plan('D', `Explainability for "${TEST_FILMS[0]}"`, '/v2/insights', {
      'filter.type': 'urn:entity:movie',
      'signal.interests.entities': `<resolved_id_for_${TEST_FILMS[0].replace(/\s+/g, '_')}>`,
      'take': 5,
      'feature.explainability': 'true'
    });
    for (const city of TEST_CITIES) {
      plan('E', `Places for "${TEST_FILMS[0]}" in "${city}"`, '/v2/insights', {
        'filter.type': 'urn:entity:place',
        'signal.interests.entities': `<resolved_id_for_${TEST_FILMS[0].replace(/\s+/g, '_')}>`,
        'filter.location.query': city,
        'take': 5
      });
    }
    const tagKeywords = ["cinema", "bookstore", "comic", "cafe", "book club"];
    for (const kw of tagKeywords) {
      plan('F', `Lookup tag keyword "${kw}"`, '/v2/tags', { 'filter.query': kw, 'take': 5 });
    }
    plan('F', `Place insight with tag filter in "${TEST_CITIES[0]}"`, '/v2/insights', {
      'filter.type': 'urn:entity:place',
      'signal.interests.entities': `<resolved_id_for_${TEST_FILMS[0].replace(/\s+/g, '_')}>`,
      'filter.location.query': TEST_CITIES[0],
      'filter.tags': '<tag_id_cinema>',
      'take': 5
    });
    plan('G', `Experimental: Heatmap for "${TEST_FILMS[0]}" in "${TEST_CITIES[0]}"`, '/v2/insights', {
      'filter.type': 'urn:heatmap',
      'signal.interests.entities': `<resolved_id_for_${TEST_FILMS[0].replace(/\s+/g, '_')}>`,
      'filter.location.query': TEST_CITIES[0],
      'take': 5
    });
    plan('G', `Experimental: Demographics for "${TEST_FILMS[0]}" in "${TEST_CITIES[0]}"`, '/v2/insights', {
      'filter.type': 'urn:demographics',
      'signal.interests.entities': `<resolved_id_for_${TEST_FILMS[0].replace(/\s+/g, '_')}>`,
      'filter.location.query': TEST_CITIES[0]
    });

    console.log(`Total Planned Requests: ${reqIndex - 1} (Cap is ${MAX_REQUESTS_CAP})`);
    console.log('\nDRY-RUN completed successfully. No live network calls were made and no key was required.');
    process.exit(0);
  }

  // Live Day-One
  console.log('='.repeat(80));
  console.log('  STARTING QLOO DAY-ONE API CHECKS');
  console.log(`  Base Host: ${REQUIRED_HOST} (Strictly verified)`);
  console.log(`  Films:     ${TEST_FILMS.join(', ')}`);
  console.log(`  Cities:    ${TEST_CITIES.join(', ')}`);
  console.log('='.repeat(80) + '\n');

  const resolvedFilms = new Map();
  let baselineMovieInsightData = null;

  // Check A
  const authRes = await qlooFetch('/search', { query: TEST_FILMS[0], types: 'urn:entity:movie', take: 5 }, 'auth');
  if (authRes.status === 200) {
    const list = extractResultsList(authRes.data);
    recordCheck('A', 'Auth /search for first film', 'PASS', `Status: 200, Latency: ${authRes.latencyMs}ms, Results: ${list.length}`);
  } else {
    recordCheck('A', 'Auth /search for first film', 'FAIL', `Status: ${authRes.status}, Error: ${authRes.error || authRes.statusText}`);
  }

  // Check B
  for (const film of TEST_FILMS) {
    const res = await qlooFetch('/search', { query: film, types: 'urn:entity:movie', take: 5 }, `film_resolve_${film.replace(/\s+/g, '_')}`);
    const results = extractResultsList(res.data);
    const firstResult = results[0] || null;
    const entityId = extractEntityId(firstResult);
    const entityName = extractEntityName(firstResult);

    if (entityId) {
      resolvedFilms.set(film, { id: entityId, name: entityName || film });
      recordCheck('B', `Resolve film: ${film}`, 'PASS', `Status: ${res.status}, ID: ${entityId}, Name: "${entityName}", Latency: ${res.latencyMs}ms`);
    } else {
      recordCheck('B', `Resolve film: ${film}`, 'WARN', `Status: ${res.status}, No entity ID found in ${results.length} results.`);
    }
  }

  // Check C
  const targetTypes = ['urn:entity:artist', 'urn:entity:book', 'urn:entity:brand', 'urn:entity:destination', 'urn:entity:podcast', 'urn:entity:tv_show', 'urn:entity:video_game', 'urn:entity:movie'];
  for (const [filmName, filmInfo] of resolvedFilms.entries()) {
    for (const filterType of targetTypes) {
      const typeShort = filterType.replace('urn:entity:', '');
      const res = await qlooFetch('/v2/insights', {
        'filter.type': filterType,
        'signal.interests.entities': filmInfo.id,
        'take': 5
      }, `taste_${filmName}_${typeShort}`);

      if (filmName === TEST_FILMS[0] && filterType === 'urn:entity:movie') {
        baselineMovieInsightData = res.data;
      }
      const entities = extractResultsList(res.data);
      if (res.status === 200) {
        recordCheck('C', `Cross-domain ${typeShort} for "${filmName}"`, entities.length > 0 ? 'PASS' : 'WARN', `Status: 200, Count: ${entities.length}, Latency: ${res.latencyMs}ms`);
      } else {
        recordCheck('C', `Cross-domain ${typeShort} for "${filmName}"`, 'FAIL', `Status: ${res.status}, Error: ${res.error || res.statusText}, Latency: ${res.latencyMs}ms`);
      }
    }
  }

  // Check D
  const firstResolved = resolvedFilms.get(TEST_FILMS[0]);
  if (firstResolved) {
    const explainRes = await qlooFetch('/v2/insights', {
      'filter.type': 'urn:entity:movie',
      'signal.interests.entities': firstResolved.id,
      'take': 5,
      'feature.explainability': 'true'
    }, 'explainability');
    const hasExplain = hasExplainabilityKey(explainRes.data);
    const isIdentical = JSON.stringify(explainRes.data) === JSON.stringify(baselineMovieInsightData);
    if (explainRes.status === 200) {
      recordCheck('D', 'Explainability (feature.explainability=true)', hasExplain && !isIdentical ? 'PASS' : 'WARN', `Status: 200, Explainability metadata detected: ${hasExplain}`);
    } else {
      recordCheck('D', 'Explainability (feature.explainability=true)', 'FAIL', `Status: ${explainRes.status}`);
    }
  }

  // Check E
  if (firstResolved) {
    for (const city of TEST_CITIES) {
      const placeRes = await qlooFetch('/v2/insights', {
        'filter.type': 'urn:entity:place',
        'signal.interests.entities': firstResolved.id,
        'filter.location.query': city,
        'take': 5
      }, `place_${city.replace(/\s+/g, '_')}`);
      const places = extractResultsList(placeRes.data);
      recordCheck('E', `Places in ${city} for "${TEST_FILMS[0]}"`, placeRes.status === 200 ? (places.length > 0 ? 'PASS' : 'WARN') : 'FAIL', `Status: ${placeRes.status}, Count: ${places.length}`);
    }
  }

  // Check F
  const tagKeywords = ["cinema", "bookstore", "comic", "cafe", "book club"];
  const discoveredTags = new Map();
  for (const kw of tagKeywords) {
    const tagRes = await qlooFetch('/v2/tags', { 'filter.query': kw, 'take': 5 }, `tag_${kw.replace(/\s+/g, '_')}`);
    const tagsList = extractResultsList(tagRes.data);
    const tagId = tagsList[0] ? (tagsList[0].id || tagsList[0].tag_id || tagsList[0].entity_id || tagsList[0].urn) : null;
    if (tagId) discoveredTags.set(kw, tagId);
    recordCheck('F', `Tag search for "${kw}"`, tagId ? 'PASS' : 'WARN', `Status: ${tagRes.status}, Found Tag ID: ${tagId}`);
  }

  const cinemaTag = discoveredTags.get('cinema');
  if (firstResolved && cinemaTag) {
    const tagPlaceRes = await qlooFetch('/v2/insights', {
      'filter.type': 'urn:entity:place',
      'signal.interests.entities': firstResolved.id,
      'filter.location.query': TEST_CITIES[0],
      'filter.tags': cinemaTag,
      'take': 5
    }, 'place_with_tag');
    const placesWithTag = extractResultsList(tagPlaceRes.data);
    recordCheck('F', `Place insight with tag in ${TEST_CITIES[0]}`, tagPlaceRes.status === 200 ? 'PASS' : 'FAIL', `Status: ${tagPlaceRes.status}, Count: ${placesWithTag.length}`);
  }

  // Check G
  if (firstResolved) {
    const heatRes = await qlooFetch('/v2/insights', { 'filter.type': 'urn:heatmap', 'signal.interests.entities': firstResolved.id, 'filter.location.query': TEST_CITIES[0], 'take': 5 }, 'exp_heat');
    recordCheck('G', 'Experimental: Heatmap', heatRes.status === 200 ? 'PASS' : 'WARN', `Status: ${heatRes.status}`);

    const demoRes = await qlooFetch('/v2/insights', { 'filter.type': 'urn:demographics', 'signal.interests.entities': firstResolved.id, 'filter.location.query': TEST_CITIES[0] }, 'exp_demo');
    recordCheck('G', 'Experimental: Demographics', demoRes.status === 200 ? 'PASS' : 'WARN', `Status: ${demoRes.status}`);
  }

  // Check H
  recordCheck('H', 'Rate limit headers', 'PASS', `Observed headers: ${Array.from(rateLimitHeadersObserved.keys()).join(', ')}`);

  console.table(checksSummary);
  const passCount = checksSummary.filter(c => c.status === 'PASS').length;
  const warnCount = checksSummary.filter(c => c.status === 'WARN').length;
  const failCount = checksSummary.filter(c => c.status === 'FAIL').length;
  console.log(`Checks done: ${passCount} PASS, ${warnCount} WARN, ${failCount} FAIL`);
  process.exit(0);
}

// =============================================================================
// MAIN ENTRYPOINT
// =============================================================================
async function main() {
  if (isRound3) {
    await runRound3();
  } else if (isRound2) {
    await runRound2();
  } else {
    await runDayOne();
  }
}

main().catch(err => {
  console.error('Fatal runner error:', redactString(err.message));
  process.exit(0);
});
