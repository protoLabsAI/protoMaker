/**
 * Summary selection utility — determines the best available summary for a feature.
 *
 * Priority order:
 * 1. Server-side accumulated summary (feature.summary) — most authoritative
 * 2. Client-side extraction from raw agent output — fallback
 */

import { extractSummary } from './log-parser';
import type { PipelineSummary } from '@protolabs-ai/types';

/**
 * Returns the effective summary for a feature.
 * Prefers server-saved summary over client-extracted summary.
 */
export function selectSummary(
  featureSummary: string | undefined,
  agentOutput: string | undefined
): string | null {
  if (featureSummary) return featureSummary;
  if (agentOutput) return extractSummary(agentOutput);
  return null;
}

/**
 * Returns the latest pipeline step summary, or null if none exist.
 */
export function getLatestPipelineSummary(
  pipelineSummaries: PipelineSummary[] | undefined
): PipelineSummary | null {
  if (!pipelineSummaries?.length) return null;
  return pipelineSummaries[pipelineSummaries.length - 1];
}
