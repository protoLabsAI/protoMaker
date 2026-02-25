/**
 * Quarantine API Routes
 *
 * Exposes quarantine management through REST API:
 * - POST /api/quarantine/list - List all quarantine entries (with optional filtering)
 * - POST /api/quarantine/get - Get single entry by id
 * - POST /api/quarantine/approve - Approve a pending entry
 * - POST /api/quarantine/reject - Reject with reason
 * - POST /api/quarantine/trust-tiers/list - List all TrustTierRecords
 * - POST /api/quarantine/trust-tiers/set - Grant/upgrade tier
 * - POST /api/quarantine/trust-tiers/revoke - Revoke tier
 *
 * All routes require valid auth (handled by global authMiddleware).
 */

import { Router } from 'express';
import { createLogger } from '@protolabs-ai/utils';
import { QuarantineService } from '../services/quarantine-service.js';
import { TrustTierService } from '../services/trust-tier-service.js';
import type { QuarantineResult, TrustTier } from '@protolabs-ai/types';
import { secureFs } from '@protolabs-ai/platform';
import path from 'path';

const logger = createLogger('QuarantineRoutes');
const DATA_DIR = process.env.DATA_DIR || './data';

export function createQuarantineRoutes(): Router {
  const router = Router();

  /**
   * POST /api/quarantine/list
   * List all quarantine entries (filter by result: pending/passed/failed/bypassed)
   */
  router.post('/list', async (req, res) => {
    try {
      const { projectPath, result } = req.body as {
        projectPath: string;
        result?: QuarantineResult;
      };

      if (!projectPath) {
        res.status(400).json({ error: 'projectPath is required' });
        return;
      }

      const trustTierService = new TrustTierService(DATA_DIR);
      const quarantineService = new QuarantineService(trustTierService, projectPath);

      // Read all quarantine entries
      const quarantineDir = path.join(projectPath, '.automaker', 'quarantine');
      let files: string[];
      try {
        files = (await secureFs.readdir(quarantineDir)) as string[];
      } catch (error) {
        // If directory doesn't exist, return empty array
        res.json({
          success: true,
          projectPath,
          result: result || 'all',
          count: 0,
          entries: [],
        });
        return;
      }

      const entries = [];
      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const entryId = file.replace('.json', '');
        const entry = await quarantineService.getEntry(entryId);

        if (entry) {
          // Filter by result if specified
          if (!result || entry.result === result) {
            entries.push(entry);
          }
        }
      }

      // Sort by submittedAt (newest first)
      entries.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

      res.json({
        success: true,
        projectPath,
        result: result || 'all',
        count: entries.length,
        entries,
      });
    } catch (error) {
      logger.error('Failed to list quarantine entries:', error);
      res.status(500).json({
        error: 'Failed to list quarantine entries',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /api/quarantine/get
   * Get single quarantine entry by id
   */
  router.post('/get', async (req, res) => {
    try {
      const { projectPath, quarantineId } = req.body as {
        projectPath: string;
        quarantineId: string;
      };

      if (!projectPath) {
        res.status(400).json({ error: 'projectPath is required' });
        return;
      }

      if (!quarantineId) {
        res.status(400).json({ error: 'quarantineId is required' });
        return;
      }

      const trustTierService = new TrustTierService(DATA_DIR);
      const quarantineService = new QuarantineService(trustTierService, projectPath);

      const entry = await quarantineService.getEntry(quarantineId);

      if (!entry) {
        res.status(404).json({
          error: 'Quarantine entry not found',
          quarantineId,
        });
        return;
      }

      res.json({
        success: true,
        entry,
      });
    } catch (error) {
      logger.error('Failed to get quarantine entry:', error);
      res.status(500).json({
        error: 'Failed to get quarantine entry',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /api/quarantine/approve
   * Approve a pending entry (creates feature from sanitized input)
   */
  router.post('/approve', async (req, res) => {
    try {
      const { projectPath, quarantineId, reviewedBy } = req.body as {
        projectPath: string;
        quarantineId: string;
        reviewedBy: string;
      };

      if (!projectPath) {
        res.status(400).json({ error: 'projectPath is required' });
        return;
      }

      if (!quarantineId) {
        res.status(400).json({ error: 'quarantineId is required' });
        return;
      }

      if (!reviewedBy) {
        res.status(400).json({ error: 'reviewedBy is required' });
        return;
      }

      const trustTierService = new TrustTierService(DATA_DIR);
      const quarantineService = new QuarantineService(trustTierService, projectPath);

      const entry = await quarantineService.approve(quarantineId, reviewedBy);

      res.json({
        success: true,
        entry,
        message: `Quarantine entry ${quarantineId} approved by ${reviewedBy}`,
      });
    } catch (error) {
      logger.error('Failed to approve quarantine entry:', error);
      res.status(500).json({
        error: 'Failed to approve quarantine entry',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /api/quarantine/reject
   * Reject with reason
   */
  router.post('/reject', async (req, res) => {
    try {
      const { projectPath, quarantineId, reviewedBy, reason } = req.body as {
        projectPath: string;
        quarantineId: string;
        reviewedBy: string;
        reason: string;
      };

      if (!projectPath) {
        res.status(400).json({ error: 'projectPath is required' });
        return;
      }

      if (!quarantineId) {
        res.status(400).json({ error: 'quarantineId is required' });
        return;
      }

      if (!reviewedBy) {
        res.status(400).json({ error: 'reviewedBy is required' });
        return;
      }

      if (!reason) {
        res.status(400).json({ error: 'reason is required' });
        return;
      }

      const trustTierService = new TrustTierService(DATA_DIR);
      const quarantineService = new QuarantineService(trustTierService, projectPath);

      const entry = await quarantineService.reject(quarantineId, reviewedBy, reason);

      res.json({
        success: true,
        entry,
        message: `Quarantine entry ${quarantineId} rejected by ${reviewedBy}`,
      });
    } catch (error) {
      logger.error('Failed to reject quarantine entry:', error);
      res.status(500).json({
        error: 'Failed to reject quarantine entry',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /api/quarantine/trust-tiers/list
   * List all TrustTierRecords
   */
  router.post('/trust-tiers/list', async (req, res) => {
    try {
      const trustTierService = new TrustTierService(DATA_DIR);
      const records = await trustTierService.getAll();

      res.json({
        success: true,
        count: records.length,
        records,
      });
    } catch (error) {
      logger.error('Failed to list trust tiers:', error);
      res.status(500).json({
        error: 'Failed to list trust tiers',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /api/quarantine/trust-tiers/set
   * Grant/upgrade tier
   */
  router.post('/trust-tiers/set', async (req, res) => {
    try {
      const { githubUsername, tier, grantedBy, reason } = req.body as {
        githubUsername: string;
        tier: TrustTier;
        grantedBy: string;
        reason?: string;
      };

      if (!githubUsername) {
        res.status(400).json({ error: 'githubUsername is required' });
        return;
      }

      if (tier === undefined || tier === null) {
        res.status(400).json({ error: 'tier is required' });
        return;
      }

      if (typeof tier !== 'number' || tier < 0 || tier > 4) {
        res.status(400).json({ error: 'tier must be a number between 0 and 4' });
        return;
      }

      if (!grantedBy) {
        res.status(400).json({ error: 'grantedBy is required' });
        return;
      }

      const trustTierService = new TrustTierService(DATA_DIR);
      const record = await trustTierService.setTier(githubUsername, tier, grantedBy, reason);

      res.json({
        success: true,
        record,
        message: `Trust tier ${tier} granted to ${githubUsername} by ${grantedBy}`,
      });
    } catch (error) {
      logger.error('Failed to set trust tier:', error);
      res.status(500).json({
        error: 'Failed to set trust tier',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /api/quarantine/trust-tiers/revoke
   * Revoke tier
   */
  router.post('/trust-tiers/revoke', async (req, res) => {
    try {
      const { githubUsername } = req.body as {
        githubUsername: string;
      };

      if (!githubUsername) {
        res.status(400).json({ error: 'githubUsername is required' });
        return;
      }

      const trustTierService = new TrustTierService(DATA_DIR);
      await trustTierService.revokeTier(githubUsername);

      res.json({
        success: true,
        message: `Trust tier revoked for ${githubUsername}`,
      });
    } catch (error) {
      logger.error('Failed to revoke trust tier:', error);
      res.status(500).json({
        error: 'Failed to revoke trust tier',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}
