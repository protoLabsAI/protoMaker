/**
 * Run telemetry self-query (beads protomaker-3um / #3906).
 *
 * Summarizes a feature's own execution history into a structured digest an
 * agent can query to self-diagnose before declaring done — detecting the two
 * failure shapes that waste cycles: looping (repeating the same error) and
 * escalating (failures/remediations piling up). Pure over the feature; uses the
 * locally-recorded executionHistory + remediation counters (no Langfuse needed).
 */

import type { Feature, ExecutionRecord } from '@protolabsai/types';

export type RunSignal = 'ok' | 'looping' | 'escalating' | 'no-data';

export interface RunTelemetry {
  featureId: string;
  status?: string;
  attempts: number;
  failures: number;
  lastError?: string;
  /** Same (normalized) error seen 2+ times — a strong "stop repeating" signal. */
  repeatedError?: { message: string; count: number };
  totalCostUsd: number;
  totalTurns: number;
  remediationCycles: number;
  signal: RunSignal;
  /** Plain-language self-diagnosis for the agent. */
  hint: string;
}

/** Normalize an error to a stable key for repeat detection (drop digits/paths noise). */
function errorKey(msg: string): string {
  return msg.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().slice(0, 120);
}

export function summarizeRunTelemetry(feature: Feature): RunTelemetry {
  const history: ExecutionRecord[] = Array.isArray(feature.executionHistory)
    ? feature.executionHistory
    : [];
  const attempts = history.length;
  const failed = history.filter((r) => !r.success);
  const lastError = [...failed].reverse().find((r) => r.error)?.error;

  // Repeat detection over failed-run errors.
  const counts = new Map<string, { message: string; count: number }>();
  for (const r of failed) {
    if (!r.error) continue;
    const key = errorKey(r.error);
    const e = counts.get(key) ?? { message: r.error, count: 0 };
    e.count++;
    counts.set(key, e);
  }
  const repeated = [...counts.values()]
    .filter((e) => e.count >= 2)
    .sort((a, b) => b.count - a.count)[0];

  const totalCostUsd =
    Math.round(history.reduce((n, r) => n + (r.costUsd ?? 0), 0) * 10000) / 10000;
  const totalTurns = history.reduce((n, r) => n + (r.turnCount ?? 0), 0);
  const remediationCycles =
    ((feature.ciRemediationCount as number | undefined) ?? 0) +
    ((feature.reviewRemediationCount as number | undefined) ?? 0);

  let signal: RunSignal;
  let hint: string;
  if (attempts === 0) {
    signal = 'no-data';
    hint = 'No execution history yet.';
  } else if (repeated) {
    signal = 'looping';
    hint = `You have hit the same error ${repeated.count}× ("${repeated.message.slice(0, 100)}"). Stop repeating the same approach — change strategy or escalate.`;
  } else if (failed.length >= 2 || remediationCycles >= 2) {
    signal = 'escalating';
    hint = `${failed.length} failed attempt(s) and ${remediationCycles} remediation cycle(s). Confirm the root cause before another attempt; consider escalating.`;
  } else {
    signal = 'ok';
    hint = 'No looping or escalation pattern detected.';
  }

  return {
    featureId: feature.id,
    status: feature.status ? String(feature.status) : undefined,
    attempts,
    failures: failed.length,
    lastError,
    repeatedError: repeated,
    totalCostUsd,
    totalTurns,
    remediationCycles,
    signal,
    hint,
  };
}
