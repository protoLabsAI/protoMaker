/**
 * Promotion Orchestration Routes
 *
 * GET  /api/promotions/candidates      — list candidates with optional ?status= filter
 * POST /api/promotions/batch           — create a PromotionBatch from selected candidateIds
 * GET  /api/promotions/batches         — list all batches
 * POST /api/promotions/promote-to-staging — trigger git promotion for a batch
 * POST /api/promotions/promote-to-main   — trigger staging→main PR creation
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { createLogger } from '@protolabs-ai/utils';
import type { PromotionBatch, PromotionCandidate, PromotionStatus } from '@protolabs-ai/types';
import { stagingPromotionService } from '../../services/staging-promotion-service.js';

const logger = createLogger('PromotionRoutes');

// ---------------------------------------------------------------------------
// In-memory batch store (batches are ephemeral orchestration state;
// candidates are persisted to disk by stagingPromotionService)
// ---------------------------------------------------------------------------

const batchesStore = new Map<string, PromotionBatch>();

function now(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function createPromotionsRouter(): Router {
  const router = Router();

  /**
   * GET /api/promotions/candidates
   * Returns promotion candidates from disk, with optional ?status= filter.
   */
  router.get('/candidates', async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, status } = req.query as { projectPath?: string; status?: string };

      if (!projectPath) {
        res.status(400).json({ error: 'projectPath query parameter is required' });
        return;
      }

      const validStatuses: PromotionStatus[] = [
        'candidate',
        'selected',
        'promoted',
        'held',
        'rejected',
      ];
      if (status && !validStatuses.includes(status as PromotionStatus)) {
        res.status(400).json({
          error: `Invalid status filter "${status}". Valid values: ${validStatuses.join(', ')}`,
        });
        return;
      }

      const candidates = await stagingPromotionService.listCandidates(
        projectPath,
        status as PromotionStatus | undefined
      );

      res.json({ candidates });
    } catch (error) {
      logger.error('Failed to list promotion candidates:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to list candidates',
      });
    }
  });

  /**
   * POST /api/promotions/batch
   * Creates a PromotionBatch from a set of candidate IDs.
   * Body: { projectPath: string, candidateIds: string[], batchId?: string }
   */
  router.post('/batch', async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        projectPath,
        candidateIds,
        batchId: requestedBatchId,
      } = req.body as {
        projectPath?: string;
        candidateIds?: string[];
        batchId?: string;
      };

      if (!projectPath) {
        res.status(400).json({ error: 'projectPath is required' });
        return;
      }

      if (!candidateIds || !Array.isArray(candidateIds) || candidateIds.length === 0) {
        res.status(400).json({ error: 'candidateIds must be a non-empty array of strings' });
        return;
      }

      const batchId =
        requestedBatchId ?? `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      if (batchesStore.has(batchId)) {
        res.status(409).json({ error: `Batch with id "${batchId}" already exists` });
        return;
      }

      // Resolve candidateIds → full PromotionCandidate objects from disk
      const allCandidates = await stagingPromotionService.listCandidates(projectPath);
      const candidates = allCandidates.filter((c: PromotionCandidate) =>
        candidateIds.includes(c.featureId)
      );

      const missing = candidateIds.filter(
        (id: string) => !candidates.some((c: PromotionCandidate) => c.featureId === id)
      );
      if (missing.length > 0) {
        res.status(400).json({
          error: `Candidate(s) not found: ${missing.join(', ')}`,
        });
        return;
      }

      const batch: PromotionBatch = {
        batchId,
        promotionBranchName: `promotion/${batchId}`,
        candidates,
        status: 'candidate',
        createdAt: now(),
      };

      batchesStore.set(batchId, batch);
      logger.info(`Created promotion batch ${batchId} with ${candidates.length} candidate(s)`);

      res.status(201).json({ batch });
    } catch (error) {
      logger.error('Failed to create promotion batch:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to create batch',
      });
    }
  });

  /**
   * GET /api/promotions/batches
   * Returns all in-memory promotion batches.
   */
  router.get('/batches', (_req: Request, res: Response): void => {
    try {
      const batches = Array.from(batchesStore.values());
      res.json({ batches });
    } catch (error) {
      logger.error('Failed to list promotion batches:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to list batches',
      });
    }
  });

  /**
   * POST /api/promotions/promote-to-staging
   * Triggers the git promotion workflow for a batch (dev → staging).
   * Body: { batchId: string, projectPath: string }
   */
  router.post('/promote-to-staging', async (req: Request, res: Response): Promise<void> => {
    try {
      const { batchId, projectPath } = req.body as {
        batchId?: string;
        projectPath?: string;
      };

      if (!batchId) {
        res.status(400).json({ error: 'batchId is required' });
        return;
      }
      if (!projectPath) {
        res.status(400).json({ error: 'projectPath is required' });
        return;
      }

      const batch = batchesStore.get(batchId);
      if (!batch) {
        res.status(404).json({ error: `Batch "${batchId}" not found` });
        return;
      }

      if (batch.stagingPrUrl) {
        res.status(409).json({
          error: `Batch "${batchId}" has already been promoted to staging (PR: ${batch.stagingPrUrl})`,
        });
        return;
      }

      logger.info(
        `Triggering git promotion to staging for batch ${batchId} with ${batch.candidates.length} candidate(s)`
      );

      // Delegate to StagingPromotionService (git ops + PR creation)
      await stagingPromotionService.promoteToStaging(batch, projectPath);
      batchesStore.set(batchId, batch);

      res.json({
        success: true,
        batchId,
        stagingPrUrl: batch.stagingPrUrl,
        promoted: batch.candidates.filter((c) => c.status === 'promoted').length,
        held: batch.candidates.filter((c) => c.status === 'held').length,
      });
    } catch (error) {
      logger.error('Failed to promote batch to staging:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to promote to staging',
      });
    }
  });

  /**
   * POST /api/promotions/promote-to-main
   * Triggers staging→main PR creation for a batch.
   * Body: { batchId: string, projectPath: string }
   */
  router.post('/promote-to-main', async (req: Request, res: Response): Promise<void> => {
    try {
      const { batchId, projectPath } = req.body as {
        batchId?: string;
        projectPath?: string;
      };

      if (!batchId) {
        res.status(400).json({ error: 'batchId is required' });
        return;
      }
      if (!projectPath) {
        res.status(400).json({ error: 'projectPath is required' });
        return;
      }

      const batch = batchesStore.get(batchId);
      if (!batch) {
        res.status(404).json({ error: `Batch "${batchId}" not found` });
        return;
      }

      if (!batch.stagingPrUrl) {
        res.status(409).json({
          error: `Batch "${batchId}" must be promoted to staging before promoting to main`,
        });
        return;
      }

      if (batch.mainPrUrl) {
        res.status(409).json({
          error: `Batch "${batchId}" already has a main PR: ${batch.mainPrUrl}`,
        });
        return;
      }

      logger.info(`Triggering staging→main PR creation for batch ${batchId}`);

      // Delegate to StagingPromotionService (PR creation + HITL notification)
      await stagingPromotionService.promoteToMain(batch, projectPath);
      batchesStore.set(batchId, batch);

      res.json({
        success: true,
        batchId,
        mainPrUrl: batch.mainPrUrl,
        message: 'staging→main PR created. Human review required before merging.',
      });
    } catch (error) {
      logger.error('Failed to promote batch to main:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to promote to main',
      });
    }
  });

  return router;
}
