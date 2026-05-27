/**
 * Failure-mode taxonomy API route (beads protomaker-2u4 / #3905).
 *
 * POST /   - Quantified breakdown of blocked/escalated features by failure
 *            category (counts + %), classified from statusChangeReason.
 *            Body: { projectPath?: string }  // omit → all active auto-loop projects
 *            Returns: { success, taxonomy }
 */

import { Router } from 'express';
import { createLogger } from '@protolabsai/utils';
import type { Feature } from '@protolabsai/types';
import type { FeatureLoader } from '../../../services/feature-loader.js';
import type { AutoModeService } from '../../../services/auto-mode-service.js';
import { createFailureClassifierService } from '../../../services/failure-classifier-service.js';
import { buildFailureTaxonomy } from '../../../services/failure-taxonomy-service.js';
import { proposeHarnessImprovement } from '../../../services/harness-evolver-service.js';
import { HarnessAutoImprovementService } from '../../../services/harness-auto-improvement-service.js';

const logger = createLogger('Routes:FailureTaxonomy');

export function createFailureTaxonomyRoutes(
  featureLoader: FeatureLoader,
  autoModeService: AutoModeService
): Router {
  const router = Router();
  const classifier = createFailureClassifierService();

  async function resolveTaxonomy(body: { projectPath?: unknown }) {
    const projectPath =
      typeof body?.projectPath === 'string' && body.projectPath.trim()
        ? body.projectPath
        : undefined;
    const projectPaths = projectPath
      ? [projectPath]
      : Array.from(new Set(autoModeService.getActiveAutoLoopProjects()));
    const features: Feature[] = [];
    for (const p of projectPaths) {
      try {
        features.push(...(await featureLoader.getAll(p)));
      } catch (err) {
        logger.warn(`Failed to load features for ${p}:`, err);
      }
    }
    return {
      taxonomy: buildFailureTaxonomy(features, classifier),
      projectCount: projectPaths.length,
    };
  }

  router.post('/', async (req, res) => {
    try {
      const { taxonomy, projectCount } = await resolveTaxonomy(req.body ?? {});
      res.json({ success: true, projectCount, taxonomy });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('Failure taxonomy request failed:', err);
      res.status(500).json({ success: false, error: message });
    }
  });

  // Proposal: top failure mode → suggested harness improvement (beads 2fq).
  router.post('/proposal', async (req, res) => {
    try {
      const { taxonomy, projectCount } = await resolveTaxonomy(req.body ?? {});
      const proposal = proposeHarnessImprovement(taxonomy);
      res.json({ success: true, projectCount, proposal, taxonomy });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('Harness proposal request failed:', err);
      res.status(500).json({ success: false, error: message });
    }
  });

  // Auto-improve: file a deduped improvement feature for the top failure mode
  // (beads 39l). The filed feature flows through the eval-gated pipeline + review.
  const autoImprove = new HarnessAutoImprovementService(featureLoader, classifier);
  router.post('/auto-improve', async (req, res) => {
    try {
      const projectPath =
        typeof req.body?.projectPath === 'string' && req.body.projectPath.trim()
          ? req.body.projectPath
          : undefined;
      const projectPaths = projectPath
        ? [projectPath]
        : Array.from(new Set(autoModeService.getActiveAutoLoopProjects()));
      const results = [];
      for (const p of projectPaths) {
        results.push({ projectPath: p, ...(await autoImprove.runOnce(p)) });
      }
      res.json({ success: true, results });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('Harness auto-improve request failed:', err);
      res.status(500).json({ success: false, error: message });
    }
  });

  return router;
}
