/**
 * Analytics API Routes
 *
 * Exposes feedback analytics and pattern detection data:
 * - GET /api/analytics/:projectPath - Get summary statistics
 * - GET /api/analytics/:projectPath/pr/:prNumber - Get metrics for specific PR
 * - GET /api/analytics/:projectPath/feature/:featureId - Get metrics for specific feature
 * - GET /api/analytics/:projectPath/patterns - Get detected patterns
 * - POST /api/analytics/:projectPath/detect - Run pattern detection
 */

import { Router } from 'express';
import { createLogger } from '@automaker/utils';
import { FeedbackAnalyticsService } from '../services/feedback-analytics-service.js';
import { FeedbackPatternDetector } from '../services/feedback-pattern-detector.js';
import type { EventEmitter } from '../lib/events.js';

const logger = createLogger('AnalyticsRoutes');

export function createAnalyticsRoutes(events: EventEmitter): Router {
  const router = Router();

  /**
   * GET /api/analytics/:projectPath
   * Get summary statistics for a project
   */
  router.get('/:projectPath(*)/all', async (req, res) => {
    try {
      const projectPath = req.params['projectPath(*)'];

      if (!projectPath) {
        res.status(400).json({ error: 'Project path is required' });
        return;
      }

      const analyticsService = new FeedbackAnalyticsService(projectPath);
      const analytics = await analyticsService.loadAllAnalytics();

      res.json({
        success: true,
        projectPath,
        count: analytics.length,
        analytics,
      });
    } catch (error) {
      logger.error('Failed to get all analytics:', error);
      res.status(500).json({
        error: 'Failed to get all analytics',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.get('/:projectPath(*)/pr/:prNumber', async (req, res) => {
    try {
      const projectPath = req.params['projectPath(*)'];
      const prNumber = parseInt(req.params.prNumber, 10);

      if (!projectPath) {
        res.status(400).json({ error: 'Project path is required' });
        return;
      }

      if (isNaN(prNumber)) {
        res.status(400).json({ error: 'Invalid PR number' });
        return;
      }

      const analyticsService = new FeedbackAnalyticsService(projectPath);
      const analytics = await analyticsService.getAnalyticsForPR(prNumber);

      res.json({
        success: true,
        projectPath,
        prNumber,
        analytics,
      });
    } catch (error) {
      logger.error('Failed to get PR analytics:', error);
      res.status(500).json({
        error: 'Failed to get PR analytics',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.get('/:projectPath(*)/feature/:featureId', async (req, res) => {
    try {
      const projectPath = req.params['projectPath(*)'];
      const featureId = req.params.featureId;

      if (!projectPath) {
        res.status(400).json({ error: 'Project path is required' });
        return;
      }

      if (!featureId) {
        res.status(400).json({ error: 'Feature ID is required' });
        return;
      }

      const analyticsService = new FeedbackAnalyticsService(projectPath);
      const analytics = await analyticsService.getAnalyticsForFeature(featureId);

      res.json({
        success: true,
        projectPath,
        featureId,
        analytics,
      });
    } catch (error) {
      logger.error('Failed to get feature analytics:', error);
      res.status(500).json({
        error: 'Failed to get feature analytics',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.get('/:projectPath(*)/patterns', async (req, res) => {
    try {
      const projectPath = req.params['projectPath(*)'];

      if (!projectPath) {
        res.status(400).json({ error: 'Project path is required' });
        return;
      }

      const patternDetector = new FeedbackPatternDetector(projectPath, events);
      await patternDetector.initialize();

      const patterns = patternDetector.getDetectedPatterns();

      res.json({
        success: true,
        projectPath,
        patterns,
      });
    } catch (error) {
      logger.error('Failed to get patterns:', error);
      res.status(500).json({
        error: 'Failed to get patterns',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.post('/:projectPath(*)/detect', async (req, res) => {
    try {
      const projectPath = req.params['projectPath(*)'];

      if (!projectPath) {
        res.status(400).json({ error: 'Project path is required' });
        return;
      }

      const analyticsService = new FeedbackAnalyticsService(projectPath);
      const patternDetector = new FeedbackPatternDetector(projectPath, events);
      await patternDetector.initialize();

      const result = await patternDetector.detectPatterns(analyticsService);

      res.json({
        success: true,
        projectPath,
        totalPatterns: result.patterns.length,
        newEscalationsCount: result.newEscalations.length,
        patterns: result.patterns,
        newEscalations: result.newEscalations,
      });
    } catch (error) {
      logger.error('Failed to detect patterns:', error);
      res.status(500).json({
        error: 'Failed to detect patterns',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.get('/:projectPath(*)', async (req, res) => {
    try {
      const projectPath = req.params['projectPath(*)'];

      if (!projectPath) {
        res.status(400).json({ error: 'Project path is required' });
        return;
      }

      const analyticsService = new FeedbackAnalyticsService(projectPath);
      const stats = await analyticsService.getSummaryStats();

      res.json({
        success: true,
        projectPath,
        stats,
      });
    } catch (error) {
      logger.error('Failed to get analytics summary:', error);
      res.status(500).json({
        error: 'Failed to get analytics summary',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}
