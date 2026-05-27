/**
 * Harness eval scorecard (#3904).
 *
 * The eval harness runs golden pipeline scenarios (real processors, mocked
 * externals) and records each outcome here. After a run, `writeScorecard`
 * aggregates into a deterministic JSON scorecard so pipeline/harness changes
 * can be regression-gated against a committed baseline — the measurement
 * substrate the 2026 "harness engineering" frontier treats as non-negotiable.
 *
 * This is NOT a replacement for unit tests. Unit tests assert specific
 * behaviors; the scorecard measures *aggregate* pipeline-decision correctness
 * across a representative scenario set so we can see whether a change moved the
 * success rate, not just whether individual asserts pass.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Domain a scenario exercises (mirrors the pipeline phases). */
export type EvalDomain = 'review' | 'execute' | 'merge' | 'plan' | 'intake';

export interface ScenarioResult {
  /** Stable scenario id (kebab-case). */
  id: string;
  domain: EvalDomain;
  /** Human-readable one-liner. */
  description: string;
  /** Expected pipeline decision/outcome (free-form, scenario-defined). */
  expected: string;
  /** Actual decision/outcome observed. */
  actual: string;
  /** Whether actual matched expected. */
  passed: boolean;
  /** Optional per-scenario metrics (remediation cycles, escalated, etc.). */
  metrics?: {
    remediationCycles?: number;
    escalated?: boolean;
    costUsd?: number;
  };
}

export interface Scorecard {
  generatedAt: string;
  total: number;
  passed: number;
  /** Fraction in [0,1]. The headline regression metric. */
  successRate: number;
  escalationRate: number;
  byDomain: Record<string, { total: number; passed: number; successRate: number }>;
  scenarios: ScenarioResult[];
}

const results: ScenarioResult[] = [];

/** Record one scenario outcome. Called from eval scenario files. */
export function record(result: ScenarioResult): void {
  results.push(result);
}

/** Reset the collector (used between isolated runs). */
export function reset(): void {
  results.length = 0;
}

/** Build the aggregate scorecard from recorded results. */
export function buildScorecard(now: () => string = () => new Date().toISOString()): Scorecard {
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const escalated = results.filter((r) => r.metrics?.escalated).length;

  const byDomain: Scorecard['byDomain'] = {};
  for (const r of results) {
    const d = (byDomain[r.domain] ??= { total: 0, passed: 0, successRate: 0 });
    d.total++;
    if (r.passed) d.passed++;
  }
  for (const d of Object.values(byDomain)) {
    d.successRate = d.total > 0 ? round(d.passed / d.total) : 0;
  }

  return {
    generatedAt: now(),
    total,
    passed,
    successRate: total > 0 ? round(passed / total) : 0,
    escalationRate: total > 0 ? round(escalated / total) : 0,
    byDomain,
    // Deterministic ordering for stable diffs.
    scenarios: [...results].sort((a, b) => a.id.localeCompare(b.id)),
  };
}

/** Write the scorecard JSON to disk (creates parent dirs). */
export function writeScorecard(path: string): Scorecard {
  const card = buildScorecard();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(card, null, 2) + '\n', 'utf-8');
  return card;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
