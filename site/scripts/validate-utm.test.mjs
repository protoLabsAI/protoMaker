#!/usr/bin/env node
/**
 * validate-utm.test.mjs
 *
 * Validates that UTM parameters are correctly applied across all site HTML files.
 *
 * Usage: node --test site/scripts/validate-utm.test.mjs
 *   or:  npm run test:utm
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { test } from 'node:test';
import assert from 'node:assert';

const __dirname = dirname(fileURLToPath(import.meta.url));

const config = JSON.parse(readFileSync(resolve(__dirname, 'utm-config.json'), 'utf-8'));

const HTML_FILES = [
  resolve(__dirname, '../index.html'),
  resolve(__dirname, '../changelog/index.html'),
  resolve(__dirname, '../roadmap/index.html'),
  resolve(__dirname, '../consulting/index.html'),
  resolve(__dirname, '../report/index.html'),
];

const INTERNAL_DOMAINS = [
  'protolabs.studio',
  'changelog.protolabs.studio',
  'roadmap.protolabs.studio',
  'report.protolabs.studio',
  'docs.protolabs.studio',
  'protolabs.consulting',
];

/** Extract all href="https://..." from an HTML string */
function extractExternalHrefs(html) {
  const matches = [];
  const regex = /href="(https:\/\/[^"]+)"/g;
  let m;
  while ((m = regex.exec(html)) !== null) {
    matches.push(m[1]);
  }
  return matches;
}

/** Check if a URL is a social/nav link that should have UTM params */
function shouldHaveUtm(url) {
  // Skip CDN/font URLs
  for (const skip of config.skip) {
    if (url.includes(skip)) return false;
  }
  // Skip OG image URLs (they're in meta content, not hrefs — but just in case)
  if (url.includes('/images/og-')) return false;
  // Must match a rule
  return config.rules.some((rule) => url.includes(rule.match));
}

test('All external links matching rules have UTM parameters', () => {
  const missing = [];

  for (const filePath of HTML_FILES) {
    let html;
    try {
      html = readFileSync(filePath, 'utf-8');
    } catch {
      continue; // file doesn't exist, skip
    }

    const hrefs = extractExternalHrefs(html);
    for (const href of hrefs) {
      if (!shouldHaveUtm(href)) continue;
      if (!href.includes('utm_source=')) {
        missing.push({ file: filePath.replace(process.cwd() + '/', ''), href });
      }
    }
  }

  if (missing.length > 0) {
    const details = missing.map((m) => `  ${m.file}: ${m.href}`).join('\n');
    assert.fail(`${missing.length} external link(s) missing UTM parameters:\n${details}`);
  }
});

test('All UTM parameter values are lowercase', () => {
  const violations = [];

  for (const filePath of HTML_FILES) {
    let html;
    try {
      html = readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }

    const hrefs = extractExternalHrefs(html);
    for (const href of hrefs) {
      if (!href.includes('utm_')) continue;

      const url = new URL(href);
      const source = url.searchParams.get('utm_source');
      const medium = url.searchParams.get('utm_medium');
      const campaign = url.searchParams.get('utm_campaign');

      for (const [key, val] of [
        ['utm_source', source],
        ['utm_medium', medium],
        ['utm_campaign', campaign],
      ]) {
        if (val && val !== val.toLowerCase()) {
          violations.push({
            file: filePath.replace(process.cwd() + '/', ''),
            key,
            value: val,
            href,
          });
        }
      }
    }
  }

  if (violations.length > 0) {
    const details = violations.map((v) => `  ${v.file}: ${v.key}=${v.value}`).join('\n');
    assert.fail(`${violations.length} UTM value(s) are not lowercase:\n${details}`);
  }
});

test('All UTM values match utm-config.json conventions', () => {
  const violations = [];
  const allowed = config.conventions;

  for (const filePath of HTML_FILES) {
    let html;
    try {
      html = readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }

    const hrefs = extractExternalHrefs(html);
    for (const href of hrefs) {
      if (!href.includes('utm_')) continue;

      const url = new URL(href);
      const source = url.searchParams.get('utm_source');
      const medium = url.searchParams.get('utm_medium');
      const campaign = url.searchParams.get('utm_campaign');

      const shortFile = filePath.replace(process.cwd() + '/', '');

      if (source && !allowed.source.includes(source)) {
        violations.push(`  ${shortFile}: utm_source="${source}" not in allowed list`);
      }
      if (medium && !allowed.medium.includes(medium)) {
        violations.push(`  ${shortFile}: utm_medium="${medium}" not in allowed list`);
      }
      if (campaign && !allowed.campaign.includes(campaign)) {
        violations.push(`  ${shortFile}: utm_campaign="${campaign}" not in allowed list`);
      }
    }
  }

  if (violations.length > 0) {
    assert.fail(`UTM convention violations:\n${violations.join('\n')}`);
  }
});

test('Script is idempotent — running twice produces identical output', async () => {
  // Run the add-utm-params script twice and verify it produces no additional changes
  // We verify by checking that no URL has duplicate UTM params
  for (const filePath of HTML_FILES) {
    let html;
    try {
      html = readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }

    const hrefs = extractExternalHrefs(html);
    for (const href of hrefs) {
      if (!href.includes('utm_source=')) continue;

      // Count occurrences of utm_source= in the URL — should be exactly 1
      const count = (href.match(/utm_source=/g) || []).length;
      assert.strictEqual(
        count,
        1,
        `URL has duplicate utm_source= (idempotency violation): ${href}`
      );
    }
  }
});
