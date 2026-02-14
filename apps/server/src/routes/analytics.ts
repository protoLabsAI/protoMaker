/**
 * Analytics API Routes
 *
 * Exposes feedback analytics and pattern detection data:
 * - POST /api/analytics/summary - Get summary statistics
 * - POST /api/analytics/pr - Get metrics for specific PR
 * - POST /api/analytics/feature - Get metrics for specific feature
 * - POST /api/analytics/patterns - Get detected patterns
 * - POST /api/analytics/detect - Run pattern detection
 * - POST /api/analytics/all - Get all analytics
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
   * POST /api/analytics/summary
   * Get summary statistics for a project
   */
  router.post('/summary', async (req, res) => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({ error: 'projectPath is required' });
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

  /**
   * POST /api/analytics/all
   * Get all analytics for a project
   */
  router.post('/all', async (req, res) => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({ error: 'projectPath is required' });
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

  /**
   * POST /api/analytics/pr
   * Get analytics for a specific PR
   */
  router.post('/pr', async (req, res) => {
    try {
      const { projectPath, prNumber } = req.body as {
        projectPath: string;
        prNumber: number;
      };

      if (!projectPath) {
        res.status(400).json({ error: 'projectPath is required' });
        return;
      }

      if (!prNumber || isNaN(prNumber)) {
        res.status(400).json({ error: 'Valid prNumber is required' });
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

  /**
   * POST /api/analytics/feature
   * Get analytics for a specific feature
   */
  router.post('/feature', async (req, res) => {
    try {
      const { projectPath, featureId } = req.body as {
        projectPath: string;
        featureId: string;
      };

      if (!projectPath) {
        res.status(400).json({ error: 'projectPath is required' });
        return;
      }

      if (!featureId) {
        res.status(400).json({ error: 'featureId is required' });
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

  /**
   * POST /api/analytics/patterns
   * Get detected patterns for a project
   */
  router.post('/patterns', async (req, res) => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({ error: 'projectPath is required' });
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

  /**
   * POST /api/analytics/detect
   * Run pattern detection for a project
   */
  router.post('/detect', async (req, res) => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({ error: 'projectPath is required' });
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

  return router;
}
