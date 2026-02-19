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

const withLedger = process.argv.includes('--with-ledger');

function run(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf-8' }).trim();
}

function getGitStats() {
  const commitCount = parseInt(run('git log --oneline | wc -l'), 10);

  // PRs: count commits with (#NNN) pattern (squash-merged PRs)
  const prCount = parseInt(run("git log --oneline --grep='(#' | wc -l"), 10);

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

function getFeatureCountFromBoard() {
  // Fallback: count feature directories in .automaker/features/
  try {
    const output = run(
      'ls -d .automaker/features/feature-*/ 2>/dev/null | wc -l'
    );
    return parseInt(output, 10) || 0;
  } catch {
    return 0;
  }
}

async function main() {
  console.log('Generating stats...');

  const git = getGitStats();
  console.log(`  Git: ${git.commitCount} commits, ${git.prCount} PRs, ${git.locCount.toLocaleString()} LOC`);

  let ledger = null;
  if (withLedger) {
    console.log('  Fetching ledger stats from server...');
    ledger = await getLedgerStats();
    if (ledger) {
      console.log(`  Ledger: ${ledger.featureCount} features, $${ledger.totalCost.toFixed(2)} total cost`);
    }
  }

  const featureCount = ledger?.featureCount || getFeatureCountFromBoard();

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

    // Feature stats (from ledger or board fallback)
    featureCount,

    // Cost stats (ledger only — null if unavailable)
    avgCostPerFeature: ledger?.avgCostPerFeature ?? null,
    totalCost: ledger?.totalCost ?? null,
    successRate: ledger?.successRate ?? null,
    throughputPerDay: ledger?.throughputPerDay ?? null,
    avgCycleTimeMs: ledger?.avgCycleTimeMs ?? null,
    costByModel: ledger?.costByModel ?? null,

    // Metadata
    generatedAt: new Date().toISOString(),
    source: ledger ? 'git+ledger' : 'git-only',
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
