#!/usr/bin/env node

/**
 * Changelog generation script for protoLabs public pages.
 * Parses git log for merged PRs (squash-merge commits with (#NNN) pattern),
 * categorizes them, groups by month, and outputs site/data/changelog.json.
 *
 * Usage:
 *   node site/scripts/generate-changelog.mjs
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const DATA_DIR = resolve(__dirname, '../data');
const OUTPUT = resolve(DATA_DIR, 'changelog.json');

const CHANGELOG_HTML = resolve(__dirname, '../changelog/index.html');
const STATS_JSON = resolve(DATA_DIR, 'stats.json');
const GITHUB_REPO = 'proto-labs-ai/automaker';

function run(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 }).trim();
}

/**
 * Categorize a commit message by keyword prefix.
 * Returns: feature | fix | improvement | infrastructure | docs | other
 */
function categorize(message) {
  const lower = message.toLowerCase();

  if (lower.startsWith('feat:') || lower.startsWith('feat(')) return 'feature';
  if (lower.startsWith('fix:') || lower.startsWith('fix(')) return 'fix';
  if (lower.startsWith('refactor:') || lower.startsWith('refactor(')) return 'improvement';
  if (lower.startsWith('perf:') || lower.startsWith('perf(')) return 'improvement';
  if (lower.startsWith('chore:') || lower.startsWith('chore(')) return 'infrastructure';
  if (lower.startsWith('ci:') || lower.startsWith('ci(')) return 'infrastructure';
  if (lower.startsWith('build:') || lower.startsWith('build(')) return 'infrastructure';
  if (lower.startsWith('docs:') || lower.startsWith('docs(')) return 'docs';
  if (lower.startsWith('test:') || lower.startsWith('test(')) return 'infrastructure';
  if (lower.startsWith('style:') || lower.startsWith('style(')) return 'improvement';

  // Keyword fallback for non-conventional commits
  if (/\badd\b|\bimplement\b|\bnew\b|\bcreate\b|\bship\b/.test(lower)) return 'feature';
  if (/\bfix\b|\bbug\b|\bpatch\b|\bresolve\b/.test(lower)) return 'fix';
  if (/\brefactor\b|\bclean\b|\bsimplif\b|\bextract\b|\bmigrat\b/.test(lower)) return 'improvement';
  if (/\bdoc\b|\breadme\b|\bcomment\b/.test(lower)) return 'docs';
  if (/\bci\b|\bdeploy\b|\bbuild\b|\binfra\b|\bconfig\b/.test(lower)) return 'infrastructure';

  return 'feature'; // default — most commits are features
}

/**
 * Clean up commit message for public display.
 * Strips conventional commit prefixes and PR number suffix.
 */
function cleanTitle(message) {
  let title = message;

  // Remove conventional commit prefix (feat: , fix(scope): , etc.)
  title = title.replace(/^[a-z]+(\([^)]*\))?:\s*/i, '');

  // Remove PR number suffix (#NNN)
  title = title.replace(/\s*\(#\d+\)\s*$/, '');

  // Capitalize first letter
  title = title.charAt(0).toUpperCase() + title.slice(1);

  return title;
}

function getMonthKey(dateStr) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthLabel(monthKey) {
  const [year, month] = monthKey.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
}

function parseCommits() {
  // Get all commits with PR numbers in the message — these are squash-merged PRs
  // Format: hash|date|message
  const SEP = '|||';
  const log = run(`git log --grep='(#' --format='%H${SEP}%aI${SEP}%s'`);

  if (!log) return [];

  const entries = [];
  const prRegex = /\(#(\d+)\)/;

  for (const line of log.split('\n')) {
    if (!line.trim()) continue;

    const parts = line.split(SEP);
    if (parts.length < 3) continue;

    const [hash, date, ...msgParts] = parts;
    const message = msgParts.join(SEP); // rejoin in case message contained separator

    const prMatch = message.match(prRegex);
    if (!prMatch) continue;

    const prNumber = parseInt(prMatch[1], 10);
    const category = categorize(message);
    const title = cleanTitle(message);

    entries.push({
      hash: hash.substring(0, 8),
      date: date,
      title,
      prNumber,
      prUrl: `https://github.com/${GITHUB_REPO}/pull/${prNumber}`,
      category,
    });
  }

  return entries;
}

function groupByMonth(entries) {
  const grouped = {};

  for (const entry of entries) {
    const key = getMonthKey(entry.date);
    if (!grouped[key]) {
      grouped[key] = {
        month: key,
        label: getMonthLabel(key),
        entries: [],
      };
    }
    grouped[key].entries.push(entry);
  }

  // Sort months newest-first, entries within each month newest-first
  return Object.values(grouped)
    .sort((a, b) => b.month.localeCompare(a.month))
    .map((group) => ({
      ...group,
      entries: group.entries.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      ),
    }));
}

function computeSummary(entries) {
  const categories = {};
  for (const e of entries) {
    categories[e.category] = (categories[e.category] || 0) + 1;
  }

  const dates = entries.map((e) => new Date(e.date).getTime());
  const firstDate = dates.length ? new Date(Math.min(...dates)).toISOString() : null;
  const latestDate = dates.length ? new Date(Math.max(...dates)).toISOString() : null;

  return {
    totalEntries: entries.length,
    categories,
    firstDate,
    latestDate,
  };
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function formatNumber(n) {
  return n.toLocaleString('en-US');
}

/**
 * Generate static HTML for all changelog entries grouped by month.
 */
function generateHtml(months) {
  const parts = [];

  for (const group of months) {
    parts.push(`          <div class="month-group mb-12">`);
    parts.push(
      `            <h2 class="text-xl font-semibold text-white mb-6 sticky top-16 bg-surface-0/90 backdrop-blur-sm py-2 z-10">${escapeHtml(group.label)}<span class="text-sm font-normal text-muted ml-3">${group.entries.length} changes</span></h2>`
    );
    parts.push(`            <div class="relative pl-8">`);
    parts.push(`              <div class="timeline-line"></div>`);

    for (const entry of group.entries) {
      const cat = escapeHtml(entry.category);
      const title = escapeHtml(entry.title);
      const date = formatDate(entry.date);
      parts.push(`              <div class="mb-4 relative" data-category="${cat}">`);
      parts.push(
        `                <div class="absolute -left-8 top-1.5 w-2.5 h-2.5 rounded-full bg-surface-3 border-2 border-accent/50"></div>`
      );
      parts.push(`                <div class="flex flex-wrap items-center gap-2">`);
      parts.push(
        `                  <span class="category-${cat} inline-block px-2 py-0.5 rounded text-[11px] font-medium uppercase tracking-wider">${cat}</span>`
      );
      parts.push(
        `                  <a href="${entry.prUrl}" target="_blank" rel="noopener" class="text-zinc-300 hover:text-white transition-colors">${title}</a>`
      );
      parts.push(
        `                  <span class="text-xs text-zinc-600 font-mono">#${entry.prNumber}</span>`
      );
      parts.push(`                  <span class="text-xs text-zinc-600">${date}</span>`);
      parts.push(`                </div>`);
      parts.push(`              </div>`);
    }

    parts.push(`            </div>`);
    parts.push(`          </div>`);
  }

  return parts.join('\n');
}

/**
 * Inject generated HTML and stats into the changelog page.
 */
function injectIntoHtml(months) {
  if (!existsSync(CHANGELOG_HTML)) {
    console.warn('  Changelog HTML not found, skipping injection');
    return;
  }

  let html = readFileSync(CHANGELOG_HTML, 'utf-8');

  // Inject changelog entries between markers
  const entriesHtml = generateHtml(months);
  html = html.replace(
    /<!--CHANGELOG_START-->[\s\S]*?<!--CHANGELOG_END-->/,
    `<!--CHANGELOG_START-->\n${entriesHtml}\n          <!--CHANGELOG_END-->`
  );

  // Inject stats from stats.json if available
  if (existsSync(STATS_JSON)) {
    const stats = JSON.parse(readFileSync(STATS_JSON, 'utf-8'));
    html = html.replace('<!--STAT:prCount-->', formatNumber(stats.prCount));
    html = html.replace('<!--STAT:commitCount-->', formatNumber(stats.commitCount));
    html = html.replace('<!--STAT:featureCount-->', formatNumber(stats.featureCount));
    html = html.replace('<!--STAT:locCount-->', formatNumber(stats.locCount));
  }

  writeFileSync(CHANGELOG_HTML, html);
  console.log(
    `  Injected ${months.reduce((n, m) => n + m.entries.length, 0)} entries into ${CHANGELOG_HTML}`
  );
}

function main() {
  console.log('Generating changelog...');

  const entries = parseCommits();
  console.log(`  Found ${entries.length} PR merge commits`);

  const months = groupByMonth(entries);
  console.log(`  Grouped into ${months.length} months`);

  const summary = computeSummary(entries);
  console.log(`  Categories: ${JSON.stringify(summary.categories)}`);

  const changelog = {
    summary,
    months,
    generatedAt: new Date().toISOString(),
  };

  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(OUTPUT, JSON.stringify(changelog, null, 2) + '\n');
  console.log(`  JSON written to ${OUTPUT}`);

  // Inject into HTML page
  injectIntoHtml(months);

  console.log('\nChangelog generation complete.');
}

main();
