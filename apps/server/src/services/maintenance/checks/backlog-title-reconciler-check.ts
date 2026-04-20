/**
 * BacklogTitleReconcilerCheck — Fuzzy-match zombie backlog features to merged PRs.
 *
 * The existing PostMergeReconcilerCheck only handles features that already have
 * a `prNumber` recorded. A separate failure mode leaves zombie features in
 * backlog/review without ANY PR linkage — these get filed by adversarial review
 * flows (Quinn's triage, workstacean re-dispatches) without an issueNumber or
 * branchName that matches a real PR.
 *
 * This check closes that loop by fuzzy-matching feature titles against recently
 * merged PR titles via token-set Jaccard similarity. On a confident match it
 * sets `status = 'done'` with a reconciled reason + the matched `prNumber`.
 *
 * Safeguards:
 *   - Hard cap at 5 auto-reconciliations per sweep per project.
 *   - Skip features with `assignee` set (signals human ownership).
 *   - Skip features with `prNumber` already set (covered by PostMergeReconcilerCheck).
 *   - Never touch terminal-status features.
 *   - Jaccard threshold configurable; defaults to 0.6.
 *
 * See: protoLabsAI/protoMaker#3511 (companion to #3505).
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@protolabsai/utils';
import type {
  MaintenanceCheck,
  MaintenanceCheckContext,
  MaintenanceCheckResult,
} from '@protolabsai/types';
import type { FeatureLoader } from '../../feature-loader.js';
import type { EventEmitter } from '../../../lib/events.js';

const logger = createLogger('BacklogTitleReconciler');

const execFileAsync = promisify(execFile) as (
  file: string,
  args: string[],
  options: { encoding: string; timeout: number; cwd?: string }
) => Promise<{ stdout: string; stderr: string }>;

const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'by',
  'from',
  'is',
  'was',
  'are',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'should',
  'could',
  'may',
  'might',
  'must',
  'can',
  'that',
  'this',
  'these',
  'those',
  'when',
  'where',
  'how',
  'why',
  'what',
  'which',
  'who',
  'if',
  'then',
  'else',
]);

/** Statuses that are eligible for title-based reconciliation. */
const RECONCILABLE_STATUSES = new Set(['backlog', 'review', 'blocked']);

/** Maximum reconciliations per sweep per project — guard against mass-mutation. */
const MAX_RECONCILIATIONS_PER_PROJECT = 5;

/** Days of merged-PR history to consider when matching. */
const HISTORY_DAYS = 30;

/** Default Jaccard similarity threshold. */
const DEFAULT_THRESHOLD = 0.6;

interface MergedPr {
  number: number;
  title: string;
  mergedAt: string;
}

/**
 * Normalize a string for token-set comparison. Lowercases, strips punctuation
 * and conventional-commit prefixes, splits on whitespace, drops stopwords and
 * very short tokens.
 */
export function normalizeTitle(raw: string): Set<string> {
  let s = raw.toLowerCase();
  // Strip conventional-commit prefix: "fix(scope):", "feat:", "test(ci):", etc.
  s = s.replace(/^(fix|feat|chore|docs|refactor|test|perf|style|ci|build|revert)\b[^:]*:\s*/, '');
  // Strip [tag] prefixes (e.g. "[github] foo")
  s = s.replace(/^\[[^\]]+\]\s*/, '');
  // Replace non-alphanumeric with space
  s = s.replace(/[^a-z0-9]+/g, ' ');
  const tokens = s
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
  return new Set(tokens);
}

export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersect = 0;
  for (const token of a) if (b.has(token)) intersect++;
  const union = a.size + b.size - intersect;
  return intersect / union;
}

/**
 * Extract `#NNNN` PR/issue references from a string. Filters out very small
 * numbers (< 100) to avoid matching against minor refs like "#1" that are
 * more likely to be workstream numbers, checklist positions, or footnote
 * markers than real PR/issue identifiers.
 */
export function extractIssueRefs(text: string): number[] {
  if (!text) return [];
  const matches = text.matchAll(/#(\d{3,})/g);
  const refs = new Set<number>();
  for (const m of matches) {
    const n = parseInt(m[1], 10);
    if (!Number.isNaN(n) && n >= 100) refs.add(n);
  }
  return Array.from(refs);
}

export class BacklogTitleReconcilerCheck implements MaintenanceCheck {
  readonly id = 'backlog-title-reconciler';
  readonly name = 'Backlog Title Reconciler';
  readonly tier = 'full' as const;

  constructor(
    private readonly featureLoader: FeatureLoader,
    private readonly events: EventEmitter,
    private readonly threshold: number = DEFAULT_THRESHOLD
  ) {}

  async run(context: MaintenanceCheckContext): Promise<MaintenanceCheckResult> {
    const t0 = Date.now();
    let totalReconciled = 0;
    let totalChecked = 0;
    const reconciledSummaries: string[] = [];

    for (const projectPath of context.projectPaths) {
      try {
        const { reconciled, checked, summaries } = await this.sweepProject(projectPath);
        totalReconciled += reconciled;
        totalChecked += checked;
        reconciledSummaries.push(...summaries);
      } catch (err) {
        logger.error(`Backlog title reconciler failed for ${projectPath}:`, err);
      }
    }

    return {
      checkId: this.id,
      passed: true,
      summary:
        totalReconciled > 0
          ? `Backlog title reconciler: ${totalReconciled} zombie feature(s) reconciled to merged PRs`
          : `Backlog title reconciler: ${totalChecked} candidate(s) checked, no title matches found`,
      details: {
        totalReconciled,
        totalChecked,
        projectCount: context.projectPaths.length,
        reconciled: reconciledSummaries,
      },
      durationMs: Date.now() - t0,
    };
  }

  async sweepProject(
    projectPath: string
  ): Promise<{ reconciled: number; checked: number; summaries: string[] }> {
    const features = await this.featureLoader.getAll(projectPath);

    // Candidates: backlog/review/blocked, NO prNumber, NO assignee (human-owned).
    const candidates = features.filter(
      (f) =>
        RECONCILABLE_STATUSES.has(f.status ?? '') &&
        f.prNumber == null &&
        !f.assignee &&
        typeof f.title === 'string' &&
        f.title.trim().length > 0
    );

    if (candidates.length === 0) {
      return { reconciled: 0, checked: 0, summaries: [] };
    }

    const mergedPrs = await this.fetchRecentMergedPrs(projectPath);
    if (mergedPrs.length === 0) {
      logger.debug(
        `No merged PRs in last ${HISTORY_DAYS} days for ${projectPath} — nothing to match against`
      );
      return { reconciled: 0, checked: 0, summaries: [] };
    }

    // Precompute normalized token sets for all merged PRs once.
    const normalizedPrs = mergedPrs.map((pr) => ({ pr, tokens: normalizeTitle(pr.title) }));
    const mergedPrsByNumber = new Map(mergedPrs.map((pr) => [pr.number, pr]));

    let reconciled = 0;
    const summaries: string[] = [];

    for (const feature of candidates) {
      if (reconciled >= MAX_RECONCILIATIONS_PER_PROJECT) {
        logger.warn(
          `Reconciliation cap (${MAX_RECONCILIATIONS_PER_PROJECT}) reached for ${projectPath} — deferring remaining candidates to next sweep`
        );
        break;
      }

      // Fast path: explicit #NNNN reference in title or description. If the
      // feature mentions a merged PR number directly, trust that over fuzzy
      // title matching. This catches zombies filed by adversarial-review flows
      // whose titles describe a sub-concern of the shipping PR rather than
      // echoing the PR title — e.g. "fix(ci): PR #3498 — Prettier violation"
      // whose real resolution is inside PR #3498's own commits.
      const refs = [
        ...extractIssueRefs(feature.title ?? ''),
        ...extractIssueRefs(feature.description ?? ''),
      ];
      let best: { pr: MergedPr; score: number } | null = null;
      for (const ref of refs) {
        const pr = mergedPrsByNumber.get(ref);
        if (!pr) continue;
        const claimed = features.some((f) => f.prNumber === pr.number);
        if (claimed) continue;
        best = { pr, score: 1.0 };
        logger.debug(
          `[backlog-title-reconciler] Direct #${ref} reference in feature ${feature.id} matches merged PR — skipping Jaccard`
        );
        break;
      }

      // Fallback: token-set Jaccard similarity.
      if (!best) {
        const featureTokens = normalizeTitle(feature.title!);
        // Collect every PR that crosses threshold, sorted best-first. Picking the
        // best-unclaimed (rather than just the best-overall) prevents a single
        // popular PR from absorbing the match of every zombie whose tokens line up
        // the same way — and keeps ties from starving later candidates.
        const matches = normalizedPrs
          .map(({ pr, tokens }) => ({ pr, score: jaccardSimilarity(featureTokens, tokens) }))
          .filter((m) => m.score >= this.threshold)
          .sort((a, b) => b.score - a.score);

        for (const candidate of matches) {
          const claimed = features.some((f) => f.prNumber === candidate.pr.number);
          if (!claimed) {
            best = candidate;
            break;
          }
        }
      }

      if (!best) {
        logger.debug(
          `No unclaimed match for feature "${feature.title}" (no direct #NNNN ref and no PR title ≥ ${this.threshold} Jaccard)`
        );
        continue;
      }

      const matchKind = best.score >= 1.0 ? 'direct #ref' : 'title match';
      const reason = `Reconciled to PR #${best.pr.number} by ${matchKind} (score=${best.score.toFixed(2)})`;

      logger.info(
        `[backlog-title-reconciler] Matching ${feature.id} "${feature.title}" → PR #${best.pr.number} "${best.pr.title}" (score=${best.score.toFixed(2)})`
      );

      try {
        await this.featureLoader.update(projectPath, feature.id, {
          status: 'done',
          prNumber: best.pr.number,
          statusChangeReason: reason,
        });

        this.events.emit('feature:auto-reconciled', {
          featureId: feature.id,
          projectPath,
          prNumber: best.pr.number,
          prTitle: best.pr.title,
          score: best.score,
          reason,
        });

        reconciled++;
        summaries.push(`${feature.id} → PR #${best.pr.number} (score=${best.score.toFixed(2)})`);
      } catch (err) {
        logger.error(
          `Failed to reconcile ${feature.id} → PR #${best.pr.number}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    return { reconciled, checked: candidates.length, summaries };
  }

  /**
   * Fetch recently merged PRs via `gh pr list` against the configured remote.
   * Returns empty on any error — reconciliation is best-effort, never fatal.
   */
  private async fetchRecentMergedPrs(projectPath: string): Promise<MergedPr[]> {
    try {
      const { stdout } = await execFileAsync(
        'gh',
        ['pr', 'list', '--state', 'merged', '--limit', '100', '--json', 'number,title,mergedAt'],
        { encoding: 'utf-8', timeout: 15_000, cwd: projectPath }
      );
      const all = JSON.parse(stdout) as MergedPr[];
      const cutoff = Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000;
      return all.filter((pr) => new Date(pr.mergedAt).getTime() >= cutoff);
    } catch (err) {
      logger.debug(
        `Could not fetch merged PRs for ${projectPath}: ${err instanceof Error ? err.message : String(err)}`
      );
      return [];
    }
  }
}
