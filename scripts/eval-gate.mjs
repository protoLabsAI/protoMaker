#!/usr/bin/env node
/**
 * Harness eval regression gate (#3904).
 *
 * Reads the scorecard produced by `npm run eval:harness` and compares it to the
 * committed thresholds in apps/server/eval/baseline.json. Exits non-zero on a
 * regression so CI blocks pipeline/harness changes that lower the success rate
 * (or pass by escalating everything). Run as: npm run eval:harness && npm run eval:gate
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const evalDir = resolve(here, '../apps/server/eval');

function readJson(path, what) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch (err) {
    console.error(`[eval-gate] could not read ${what} at ${path}: ${err.message}`);
    if (what === 'scorecard') {
      console.error('[eval-gate] did you run `npm run eval:harness` first?');
    }
    process.exit(2);
  }
}

const baseline = readJson(resolve(evalDir, 'baseline.json'), 'baseline');
const scorecard = readJson(resolve(evalDir, 'scorecard.json'), 'scorecard');

const failures = [];
if (scorecard.total < baseline.minScenarios) {
  failures.push(
    `scenario count ${scorecard.total} < required ${baseline.minScenarios} (did scenarios get dropped?)`
  );
}
if (scorecard.successRate < baseline.minSuccessRate) {
  failures.push(
    `successRate ${scorecard.successRate} < baseline ${baseline.minSuccessRate} (REGRESSION)`
  );
}
if (scorecard.escalationRate > baseline.maxEscalationRate) {
  failures.push(
    `escalationRate ${scorecard.escalationRate} > max ${baseline.maxEscalationRate} (escalating too much)`
  );
}

const header = `[eval-gate] ${scorecard.passed}/${scorecard.total} scenarios passed | successRate ${scorecard.successRate} | escalationRate ${scorecard.escalationRate}`;
console.log(header);

if (failures.length > 0) {
  console.error('[eval-gate] FAIL — harness regression:');
  for (const f of failures) console.error(`  - ${f}`);
  const failing = (scorecard.scenarios || []).filter((s) => !s.passed);
  if (failing.length > 0) {
    console.error('[eval-gate] failing scenarios:');
    for (const s of failing) console.error(`  - ${s.id}: expected ${s.expected}, got ${s.actual}`);
  }
  process.exit(1);
}

console.log('[eval-gate] PASS — no harness regression.');
