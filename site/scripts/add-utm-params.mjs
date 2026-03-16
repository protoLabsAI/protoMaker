#!/usr/bin/env node
/**
 * add-utm-params.mjs
 *
 * Injects UTM parameters into external links across all site HTML files.
 * Uses utm-config.json for centralized campaign configuration.
 *
 * Rules:
 * - Only processes href="https://..." attributes (external links)
 * - Skips URLs matching the skip list (PR links, CDNs, etc.)
 * - Skips URLs that already have utm_source= (idempotent)
 * - Appends UTM params with ? or & depending on existing query string
 * - Handles fragment identifiers (#section) correctly
 *
 * Usage: node site/scripts/add-utm-params.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const config = JSON.parse(readFileSync(resolve(__dirname, 'utm-config.json'), 'utf-8'));

const HTML_FILES = [
  resolve(__dirname, '../index.html'),
  resolve(__dirname, '../changelog/index.html'),
  resolve(__dirname, '../roadmap/index.html'),
  resolve(__dirname, '../consulting/index.html'),
  resolve(__dirname, '../report/index.html'),
];

/**
 * Check if a URL should be skipped (not tagged with UTM params).
 */
function shouldSkip(url) {
  for (const pattern of config.skip) {
    if (url.includes(pattern)) return true;
  }
  return false;
}

/**
 * Find the matching rule for a given URL.
 * Returns null if no rule matches.
 */
function findRule(url) {
  for (const rule of config.rules) {
    if (url.includes(rule.match)) return rule;
  }
  return null;
}

/**
 * Build the UTM query string from a rule.
 */
function buildUtmParams(rule) {
  return `utm_source=${rule.source}&utm_medium=${rule.medium}&utm_campaign=${rule.campaign}`;
}

/**
 * Append UTM parameters to a URL, handling existing query params and fragments.
 *
 * Examples:
 *   https://example.com          -> https://example.com?utm_source=...
 *   https://example.com?foo=bar  -> https://example.com?foo=bar&utm_source=...
 *   https://example.com#section  -> https://example.com?utm_source=...#section
 */
function appendUtmParams(url, utmParams) {
  // Separate fragment identifier if present
  const hashIndex = url.indexOf('#');
  const fragment = hashIndex !== -1 ? url.slice(hashIndex) : '';
  const baseUrl = hashIndex !== -1 ? url.slice(0, hashIndex) : url;

  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}${utmParams}${fragment}`;
}

/**
 * Process a single HTML file, injecting UTM params into matching links.
 * Returns the number of links tagged.
 */
function processFile(filePath) {
  let content;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch (err) {
    console.warn(`  SKIP ${filePath} (not found)`);
    return 0;
  }

  let taggedCount = 0;

  // Match all href="https://..." attributes
  const result = content.replace(/href="(https:\/\/[^"]+)"/g, (match, url) => {
    // Skip if already has UTM params (idempotent)
    if (url.includes('utm_source=')) return match;

    // Skip if URL matches skip list
    if (shouldSkip(url)) return match;

    // Find matching rule
    const rule = findRule(url);
    if (!rule) return match;

    const utmParams = buildUtmParams(rule);
    const taggedUrl = appendUtmParams(url, utmParams);
    taggedCount++;
    return `href="${taggedUrl}"`;
  });

  if (taggedCount > 0) {
    writeFileSync(filePath, result, 'utf-8');
  }

  return taggedCount;
}

/**
 * Main entry point.
 */
function main() {
  console.log('Adding UTM parameters to external links...\n');

  let totalTagged = 0;
  const start = Date.now();

  for (const filePath of HTML_FILES) {
    const shortPath = filePath.replace(process.cwd() + '/', '');
    const count = processFile(filePath);
    if (count > 0) {
      console.log(`  ${shortPath} — tagged ${count} link${count === 1 ? '' : 's'}`);
    } else {
      console.log(`  ${shortPath} — no changes`);
    }
    totalTagged += count;
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\nDone. Tagged ${totalTagged} link${totalTagged === 1 ? '' : 's'} in ${elapsed}s`);
}

main();
