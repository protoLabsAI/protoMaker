/**
 * EpicAdoptionSweepCheck - Periodic sweep that links orphaned features to their parent epics.
 *
 * Features created before the auto-adopt-on-create guard landed (or created via paths
 * that bypass the create route) may have epicId: undefined even when the title clearly
 * belongs to an epic (e.g. "[Arc 0.1] Implement GOAP planner").
 *
 * This check runs on the 'full' maintenance tier (every 6 hours) and also on a dedicated
 * 1-hour scheduler interval. It finds candidate orphans — active, non-epic features with
 * no epicId and a bracket-prefixed title — and adopts them into the matching epic.
 *
 * Adoption is skipped when:
 * - No bracket pattern is found in the title
 * - Zero or multiple epics match the keyword (ambiguous)
 * - The feature is an epic itself (isEpic: true)
 * - The feature is archived
 */

import { createLogger } from '@protolabsai/utils';
import type {
  MaintenanceCheck,
  MaintenanceCheckContext,
  MaintenanceCheckResult,
} from '@protolabsai/types';
import type { FeatureLoader } from '../../feature-loader.js';
import { findCandidateEpic } from '../../feature-loader.js';

const logger = createLogger('EpicAdoptionSweepCheck');

export class EpicAdoptionSweepCheck implements MaintenanceCheck {
  readonly id = 'epic-adoption-sweep';
  readonly name = 'Epic Adoption Sweep';
  readonly tier = 'full' as const;

  constructor(private readonly featureLoader: FeatureLoader) {}

  async run(context: MaintenanceCheckContext): Promise<MaintenanceCheckResult> {
    const t0 = Date.now();
    let totalAdopted = 0;

    for (const projectPath of context.projectPaths) {
      try {
        const features = await this.featureLoader.getAll(projectPath);

        // Candidates: active non-epic features with no epicId and a non-empty title
        const orphans = features.filter((f) => !f.isEpic && !f.epicId && !f.archived && f.title);

        for (const orphan of orphans) {
          const candidate = findCandidateEpic(orphan.title!, features);
          if (!candidate) continue;

          logger.info(
            `Adopting feature "${orphan.title}" (${orphan.id}) into epic "${candidate.title}" (${candidate.id})`
          );
          await this.featureLoader.update(projectPath, orphan.id, { epicId: candidate.id });
          totalAdopted++;
        }
      } catch (err) {
        logger.error(`EpicAdoptionSweepCheck failed for ${projectPath}:`, err);
      }
    }

    return {
      checkId: this.id,
      passed: true,
      summary:
        totalAdopted > 0
          ? `Epic adoption sweep: adopted ${totalAdopted} orphan(s) into matching epics`
          : `Epic adoption sweep: no orphaned features with matching epics found`,
      details: { totalAdopted, projectCount: context.projectPaths.length },
      durationMs: Date.now() - t0,
    };
  }
}
