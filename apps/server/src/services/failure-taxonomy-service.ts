/**
 * Failure-mode taxonomy (beads protomaker-2u4 / #3905).
 *
 * Aggregates blocked/escalated features into a quantified failure-mode
 * breakdown (counts + %) by classifying each feature's statusChangeReason via
 * the existing FailureClassifierService. This is the read-only analytics input
 * to the self-improving harness loop (#3905): the proposer mines the top
 * pattern, and operators see where the dark factory is actually failing.
 *
 * Pure: pass features + a classifier; no I/O.
 */

import type { Feature } from '@protolabsai/types';
import type { FailureClassifierService } from './failure-classifier-service.js';

/** Board statuses considered terminal failures for taxonomy purposes. */
const FAILURE_STATUSES: ReadonlySet<string> = new Set(['blocked', 'escalated']);

export interface FailureTaxonomyEntry {
  /** FailureCategory from the classifier (e.g. merge_conflict, quota). */
  category: string;
  count: number;
  /** Share of classified failures, 0–100 with one decimal. */
  pct: number;
  /** A few representative features for this category. */
  examples: Array<{ featureId: string; title?: string; reason: string }>;
}

export interface FailureTaxonomy {
  generatedAt: string;
  /** Number of features scanned. */
  scanned: number;
  /** Number of those in a terminal failure state (the taxonomy denominator). */
  failed: number;
  /** Categories sorted by count desc. */
  byCategory: FailureTaxonomyEntry[];
}

export function buildFailureTaxonomy(
  features: Feature[],
  classifier: Pick<FailureClassifierService, 'classify'>,
  opts: { maxExamples?: number } = {}
): FailureTaxonomy {
  const maxExamples = opts.maxExamples ?? 3;
  const failed = features.filter((f) => FAILURE_STATUSES.has(String(f.status)));

  const buckets = new Map<string, FailureTaxonomyEntry>();
  for (const f of failed) {
    const reason = (f.statusChangeReason ?? '').trim() || 'unknown';
    const category = reason === 'unknown' ? 'unknown' : classifier.classify(reason).category;
    const entry = buckets.get(category) ?? { category, count: 0, pct: 0, examples: [] };
    entry.count++;
    if (entry.examples.length < maxExamples) {
      entry.examples.push({ featureId: f.id, title: f.title, reason: reason.slice(0, 200) });
    }
    buckets.set(category, entry);
  }

  const failedCount = failed.length;
  const byCategory = [...buckets.values()]
    .map((e) => ({ ...e, pct: failedCount ? Math.round((e.count / failedCount) * 1000) / 10 : 0 }))
    .sort((a, b) => b.count - a.count);

  return {
    generatedAt: new Date().toISOString(),
    scanned: features.length,
    failed: failedCount,
    byCategory,
  };
}
