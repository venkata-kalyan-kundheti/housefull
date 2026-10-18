#!/usr/bin/env node

/**
 * scripts/check-repo-clean.mjs
 *
 * Guard script to ensure no Qloo data, report files, or secrets are tracked in git.
 * Runs `git ls-files` and inspects only tracked files.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const UUID_REGEX = /[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}/;
const ENTITY_ID_WITH_UUID = new RegExp(`"entity_id"\\s*:\\s*"${UUID_REGEX.source}"`, 'i');
const SECRET_ASSIGNMENT_REGEX = /^\s*(?:export\s+)?(QLOO|LLM)_API_KEY\s*=\s*(\S+)/m;

function getTrackedFiles() {
  try {
    const stdout = execSync('git ls-files', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    return stdout
      .split('\n')
      .map(f => f.trim().replace(/\\/g, '/'))
      .filter(Boolean);
  } catch {
    // If git fails or not a repo yet, return empty list
    return [];
  }
}

function checkRules() {
  const trackedFiles = getTrackedFiles();
  if (trackedFiles.length === 0) {
    console.log('check:repo OK (no tracked files)');
    process.exit(0);
  }

  const violations = [];

  for (const file of trackedFiles) {
    const normalized = file.replace(/\\/g, '/');

    // Rule 1: A tracked path starts with .private/ or matches qloo-*-report.txt or *.report.txt
    if (
      normalized.startsWith('.private/') ||
      /^qloo-.*-report\.txt$/i.test(path.basename(normalized)) ||
      /\.report\.txt$/i.test(path.basename(normalized))
    ) {
      violations.push({ file: normalized, reason: 'Private or report file is tracked in git' });
      continue;
    }

    // Rule 4: .env.local or any .env.* other than .env.example is tracked
    const baseName = path.basename(normalized);
    if (/^\.env(\..+)?$/i.test(baseName) && baseName !== '.env.example') {
      violations.push({ file: normalized, reason: 'Environment file other than .env.example is tracked' });
      continue;
    }

    if (!fs.existsSync(normalized)) {
      continue;
    }

    let content;
    try {
      content = fs.readFileSync(normalized, 'utf8');
    } catch {
      continue; // Binary or unreadable
    }

    // Rule 2: A tracked file other than lib/qloo/** source files and README.md or docs/** contains "entity_id" with UUID
    const isAllowedForEntityId =
      normalized.startsWith('lib/qloo/') ||
      normalized === 'README.md' ||
      normalized === 'qloo-README.md' ||
      normalized.startsWith('docs/');

    if (!isAllowedForEntityId) {
      if (ENTITY_ID_WITH_UUID.test(content) || (content.includes('"entity_id"') && UUID_REGEX.test(content))) {
        // Double check if the UUID is associated with entity_id
        const lines = content.split('\n');
        for (const line of lines) {
          if (line.includes('entity_id') && UUID_REGEX.test(line)) {
            violations.push({ file: normalized, reason: 'Contains "entity_id" followed by a UUID-shaped value' });
            break;
          }
        }
      }
    }

    // Rule 3: Secret assignment line matching (QLOO|LLM)_API_KEY\s*=\s*\S+ not in .env.example with empty value
    if (normalized === '.env.example') {
      // In .env.example, values should be empty or default public non-secrets
      const lines = content.split('\n');
      for (const line of lines) {
        const match = line.match(/^\s*(?:export\s+)?(QLOO|LLM)_API_KEY\s*=\s*(\S+)/);
        if (match && match[2] && match[2].trim() !== '') {
          violations.push({ file: normalized, reason: '.env.example contains non-empty API key value' });
          break;
        }
      }
    } else {
      const lines = content.split('\n');
      for (const line of lines) {
        const match = line.match(SECRET_ASSIGNMENT_REGEX);
        if (match && match[2] && match[2].trim() !== '') {
          violations.push({ file: normalized, reason: `Contains secret assignment: ${match[1]}_API_KEY` });
          break;
        }
      }
    }
  }

  if (violations.length > 0) {
    console.error('check:repo FAILED: The following tracked files violate safety rules:');
    for (const v of violations) {
      console.error(`  - ${v.file}: ${v.reason}`);
    }
    process.exit(1);
  }

  console.log('check:repo OK');
}

checkRules();
