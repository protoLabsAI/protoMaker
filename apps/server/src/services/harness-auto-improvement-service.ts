/**
 * Harness auto-improvement (beads protomaker-39l / #3905) — the flywheel payoff.
 *
 * Closes the self-improvement loop SAFELY: it turns the top failure-mode
 * proposal (2fq) into a deduped, tracked improvement feature on the board. That
 * feature then flows through the normal pipeline, where the harness-eval CI gate
 * (#3904/#3908) enforces "regression-clean" on the resulting PR and a human
 * reviews it — so the loop never blindly writes + merges harness changes.
 *
 * On-demand + dedup'd: it only files when there's an actionable top category and
 * no equivalent improvement is already open (fingerprint marker in description).
 */

import { createLogger } from '@protolabsai/utils';
import type { FeatureLoader } from './feature-loader.js';
import {
  createFailureClassifierService,
  type FailureClassifierService,
} from './failure-classifier-service.js';
import { buildFailureTaxonomy } from './failure-taxonomy-service.js';
import { proposeHarnessImprovement } from './harness-evolver-service.js';

const logger = createLogger('HarnessAutoImprovement');

/** Statuses where an open improvement counts as "already filed" (dedup). */
const OPEN_STATUSES: ReadonlySet<string> = new Set(['backlog', 'in_progress', 'review']);

export interface AutoImproveResult {
  filed: boolean;
  reason: string;
  category?: string;
  featureId?: string;
}

export class HarnessAutoImprovementService {
  constructor(
    private readonly featureLoader: Pick<FeatureLoader, 'getAll' | 'create'>,
    private readonly classifier: Pick<
      FailureClassifierService,
      'classify'
    > = createFailureClassifierService()
  ) {}

  /**
   * Run one improvement cycle for a project: taxonomy → top-category proposal →
   * file a deduped improvement feature. Never throws; returns what happened.
   */
  async runOnce(projectPath: string, opts: { minCount?: number } = {}): Promise<AutoImproveResult> {
    try {
      const features = await this.featureLoader.getAll(projectPath);
      const taxonomy = buildFailureTaxonomy(features, this.classifier);
      const proposal = proposeHarnessImprovement(taxonomy, { minCount: opts.minCount });
      if (!proposal) return { filed: false, reason: 'no actionable proposal above threshold' };

      // Dedup: skip if an improvement for this category is already open.
      const marker = `harness-improve:${proposal.category}`;
      const existing = features.find(
        (f) =>
          typeof f.description === 'string' &&
          f.description.includes(marker) &&
          OPEN_STATUSES.has(String(f.status))
      );
      if (existing) {
        return {
          filed: false,
          reason: 'already filed',
          category: proposal.category,
          featureId: existing.id,
        };
      }

      const examples = proposal.examples.map((e) => `- ${e.featureId}: ${e.reason}`).join('\n');
      const description =
        `Auto-filed by the harness self-improvement loop (#3905). ${proposal.rationale}\n\n` +
        `**Hypothesis:** ${proposal.hypothesis}\n` +
        `**Suggested target:** ${proposal.suggestedTarget}\n\n` +
        `**Example failures (${proposal.category}):**\n${examples || '- (none captured)'}\n\n` +
        `**Acceptance:** reduce \`${proposal.category}\` failures; the fix PR must pass the harness eval gate (no success-rate regression) and human review.\n\n` +
        `<!-- ${marker} -->`;

      const created = await this.featureLoader.create(projectPath, {
        title: `Harness improvement: reduce ${proposal.category} failures`,
        category: 'chore',
        description,
        priority: 2,
      });

      logger.info(`[harness-improve] filed improvement for "${proposal.category}"`, {
        featureId: created.id,
        count: proposal.count,
      });
      return { filed: true, reason: 'filed', category: proposal.category, featureId: created.id };
    } catch (err) {
      logger.warn('[harness-improve] runOnce failed (non-fatal):', err);
      return { filed: false, reason: `error: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}
