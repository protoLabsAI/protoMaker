#!/usr/bin/env node

/**
 * Stats generation script for protoLabs public pages.
 * Fetches metrics from git history and optionally from the Automaker ledger API.
 * Outputs site/data/stats.json consumed by static HTML pages.
 *
 * Usage:
 *   node site/scripts/generate-stats.mjs
 *   node site/scripts/generate-stats.mjs --with-ledger  # also fetch from running server
 */

import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const DATA_DIR = resolve(__dirname, '../data');
const OUTPUT = resolve(DATA_DIR, 'stats.json');

// Only include features from the protoMaker era (post-rebrand)
const CUTOFF_DATE = '2026-02-04T00:00:00Z';

const withLedger = process.argv.includes('--with-ledger');

function run(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf-8' }).trim();
}

function getGitStats() {
  const commitCount = parseInt(run('git log --oneline | wc -l'), 10);

  // PRs: use gh CLI for accurate merged count, fall back to git-grep
  let prCount;
  try {
    prCount = parseInt(
      run("gh pr list --state merged --json number --jq 'length' --limit 5000"),
      10
    );
  } catch {
    prCount = parseInt(run("git log --oneline --grep='(#' | wc -l"), 10);
  }

  // Lines of code: TypeScript + TSX files only
  const locOutput = run("git ls-files '*.ts' '*.tsx' | xargs wc -l 2>/dev/null | tail -1");
  const locCount = parseInt(locOutput.replace(/[^0-9]/g, ''), 10) || 0;

  // Contributors
  const contributorCount = parseInt(run('git log --format="%aN" | sort -u | wc -l'), 10);

  // First commit date
  const firstCommitDate = run('git log --reverse --format="%aI" | head -1');

  // Latest commit date
  const latestCommitDate = run('git log -1 --format="%aI"');

  // Files in repo
  const fileCount = parseInt(run('git ls-files | wc -l'), 10);

  // TypeScript files
  const tsFileCount = parseInt(run("git ls-files '*.ts' '*.tsx' | wc -l"), 10);

  return {
    commitCount,
    prCount,
    locCount,
    contributorCount,
    firstCommitDate,
    latestCommitDate,
    fileCount,
    tsFileCount,
  };
}

/**
 * Fetch metrics from the Automaker server (AnalyticsService and Langfuse proxy).
 * Tries to call:
 * 1. POST /api/metrics/summary - for project metrics (avgCostPerFeature, totalCost, successRate, throughputPerDay, avgCycleTimeMs)
 * 2. POST /api/langfuse/costs - for costByModel breakdown
 * If server is not available, returns null (fields will remain null).
 */
async function fetchMetrics() {
  const baseUrl = process.env.AUTOMAKER_API_URL || `http://localhost:${process.env.PORT || 3008}`;
  const apiKey = process.env.AUTOMAKER_API_KEY || '';

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['x-api-key'] = apiKey;

  try {
    // 1. Fetch project metrics from /api/metrics/summary
    const metricsRes = await fetch(`${baseUrl}/api/metrics/summary`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ projectPath: ROOT }),
    });

    if (!metricsRes.ok) {
      console.warn(`Metrics API returned ${metricsRes.status}. Cost data unavailable.`);
      return null;
    }

    const metrics = await metricsRes.json();

    // Extract required fields
    const result = {
      featureCount: metrics.totalFeatures || 0,
      avgCostPerFeature: metrics.costPerFeature || 0,
      totalCost: metrics.totalCostUsd || 0,
      successRate: metrics.successRate || 0,
      throughputPerDay: metrics.throughputPerDay || 0,
      avgCycleTimeMs: metrics.avgCycleTimeMs || 0,
      costByModel: metrics.costByModel || {},
    };

    // 2. Try to fetch costByModel from Langfuse costs endpoint (optional enhancement)
    try {
      const costsRes = await fetch(`${baseUrl}/api/langfuse/costs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ limit: 1000 }), // Fetch recent observations
      });

      if (costsRes.ok) {
        const costsData = await costsRes.json();
        // Aggregate costs by model from observations if available
        if (costsData.data && Array.isArray(costsData.data)) {
          const costsByModel = {};
          for (const obs of costsData.data) {
            if (obs.model && obs.calculatedTotalCost) {
              const model = obs.model.toLowerCase();
              costsByModel[model] = (costsByModel[model] || 0) + obs.calculatedTotalCost;
            }
          }
          // Use Langfuse data if it has more detail than metrics endpoint
          if (Object.keys(costsByModel).length > 0) {
            result.costByModel = costsByModel;
          }
        }
      }
    } catch (langfuseErr) {
      // Langfuse data is optional - continue with metrics data
      console.warn(`Langfuse costs unavailable: ${langfuseErr.message}`);
    }

    return result;
  } catch (err) {
    console.warn(`Metrics API unavailable (${err.message}). Using git-only stats.`);
    return null;
  }
}

async function getLedgerStats() {
  const port = process.env.PORT || 3008;
  const apiKey = process.env.AUTOMAKER_API_KEY || '';
  const baseUrl = `http://localhost:${port}`;

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['x-api-key'] = apiKey;

    // Fetch aggregate metrics from ledger
    const res = await fetch(`${baseUrl}/api/metrics/ledger/aggregate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ projectPath: ROOT }),
    });

    if (!res.ok) throw new Error(`Ledger API returned ${res.status}`);

    const data = await res.json();
    return {
      featureCount: data.totalFeatures || 0,
      avgCostPerFeature: data.avgCostPerFeature || 0,
      totalCost: data.totalCostUsd || 0,
      successRate: data.successRate || 0,
      totalPRsMerged: data.totalPRsMerged || 0,
      totalCommitsFromLedger: data.totalCommits || 0,
      throughputPerDay: data.throughputPerDay || 0,
      avgCycleTimeMs: data.avgCycleTimeMs || 0,
      costByModel: data.costByModel || {},
    };
  } catch (err) {
    console.warn(`Ledger API unavailable (${err.message}). Using git-only stats.`);
    return null;
  }
}

/**
 * Categorize a commit message by keyword prefix.
 * Returns: feature | fix | improvement | infrastructure | docs | other
 * (Logic borrowed from generate-changelog.mjs)
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
 * Count feature-category entries from git log since the cutoff date.
 * This reflects actual features shipped, not just directory count.
 */
function getFeatureCountFromGitLog() {
  try {
    // Get all commits with PR numbers since cutoff date
    const log = run(`git log --since='${CUTOFF_DATE}' --grep='(#' --format='%s' 2>/dev/null`);

    if (!log) return 0;

    const lines = log.split('\n').filter((line) => line.trim());
    let featureCount = 0;

    for (const message of lines) {
      // Only count if it has a PR number and is categorized as a feature
      if (/\(#\d+\)/.test(message) && categorize(message) === 'feature') {
        featureCount++;
      }
    }

    return featureCount;
  } catch {
    return 0;
  }
}

function getFeatureCountFromBoard() {
  // Fallback: count feature directories in .automaker/features/
  try {
    const output = run('ls -d .automaker/features/feature-*/ 2>/dev/null | wc -l');
    return parseInt(output, 10) || 0;
  } catch {
    return 0;
  }
}

async function main() {
  console.log('Generating stats...');

  const git = getGitStats();
  console.log(
    `  Git: ${git.commitCount} commits, ${git.prCount} PRs, ${git.locCount.toLocaleString()} LOC`
  );

  // Fetch metrics from server (try fetchMetrics first, fallback to legacy getLedgerStats)
  let metrics = null;
  if (withLedger) {
    console.log('  Fetching metrics from server...');
    metrics = await fetchMetrics();

    // Fallback to legacy ledger endpoint if new metrics endpoint unavailable
    if (!metrics) {
      console.log('  Trying legacy ledger endpoint...');
      metrics = await getLedgerStats();
    }

    if (metrics) {
      console.log(
        `  Metrics: ${metrics.featureCount || 0} features, $${(metrics.totalCost || 0).toFixed(2)} total cost`
      );
    }
  }

  // Count features from git log (feature-category entries since cutoff date)
  const featureCountFromGit = getFeatureCountFromGitLog();
  const featureCount = metrics?.featureCount || featureCountFromGit || getFeatureCountFromBoard();

  console.log(`  Feature count (from git log): ${featureCountFromGit}`);

  const stats = {
    // Git stats (always available)
    commitCount: git.commitCount,
    prCount: git.prCount,
    locCount: git.locCount,
    contributorCount: git.contributorCount,
    firstCommitDate: git.firstCommitDate,
    latestCommitDate: git.latestCommitDate,
    fileCount: git.fileCount,
    tsFileCount: git.tsFileCount,

    // Feature stats (from git log, fallback to metrics or board)
    featureCount,

    // Cost stats (from metrics API — null if unavailable)
    avgCostPerFeature: metrics?.avgCostPerFeature ?? null,
    totalCost: metrics?.totalCost ?? null,
    successRate: metrics?.successRate ?? null,
    throughputPerDay: metrics?.throughputPerDay ?? null,
    avgCycleTimeMs: metrics?.avgCycleTimeMs ?? null,
    costByModel: metrics?.costByModel ?? null,

    // Metadata
    generatedAt: new Date().toISOString(),
    source: metrics ? 'git+metrics' : 'git-only',
  };

  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(OUTPUT, JSON.stringify(stats, null, 2) + '\n');
  console.log(`\nStats written to ${OUTPUT}`);
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((err) => {
  console.error('Failed to generate stats:', err);
  process.exit(1);
});
