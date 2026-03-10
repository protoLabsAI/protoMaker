/**
 * POST /summary endpoint - Board summary with status counts, always read from disk
 */

import type { Request, Response } from 'express';
import type { FeatureLoader } from '../../../services/feature-loader.js';
import type { SettingsService } from '../../../services/settings-service.js';
import { DEFAULT_WORKFLOW_SETTINGS } from '@protolabsai/types';
import { getErrorMessage, logError } from '../common.js';

export interface WipLaneSaturation {
  count: number;
  limit: number;
  ratio: number;
  overLimit: boolean;
}

export interface WipSaturation {
  in_progress: WipLaneSaturation;
  review: WipLaneSaturation;
  overallSaturation: number;
}

export interface BoardSummary {
  total: number;
  backlog: number;
  inProgress: number;
  review: number;
  blocked: number;
  done: number;
  verified: number;
  wipSaturation: WipSaturation;
}

const DEFAULT_MAX_IN_PROGRESS = 5;
const DEFAULT_MAX_IN_REVIEW = 10;

export function computeWipSaturation(
  inProgressCount: number,
  reviewCount: number,
  maxInProgress: number,
  maxInReview: number
): WipSaturation {
  const inProgressRatio = inProgressCount / maxInProgress;
  const reviewRatio = reviewCount / maxInReview;

  return {
    in_progress: {
      count: inProgressCount,
      limit: maxInProgress,
      ratio: inProgressRatio,
      overLimit: inProgressRatio > 1.0,
    },
    review: {
      count: reviewCount,
      limit: maxInReview,
      ratio: reviewRatio,
      overLimit: reviewRatio > 1.0,
    },
    overallSaturation: Math.max(inProgressRatio, reviewRatio),
  };
}

export function createSummaryHandler(
  featureLoader: FeatureLoader,
  settingsService?: SettingsService
) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      // Always read from disk to avoid stale in-memory state
      const features = await featureLoader.getAll(projectPath);

      let inProgressCount = 0;
      let reviewCount = 0;

      const summary = {
        total: features.length,
        backlog: 0,
        inProgress: 0,
        review: 0,
        blocked: 0,
        done: 0,
        verified: 0,
      };

      for (const feature of features) {
        switch (feature.status) {
          case 'backlog':
            summary.backlog++;
            break;
          case 'in_progress':
            summary.inProgress++;
            inProgressCount++;
            break;
          case 'review':
            summary.review++;
            reviewCount++;
            break;
          case 'blocked':
            summary.blocked++;
            break;
          case 'done':
            summary.done++;
            break;
          case 'verified':
            summary.verified++;
            break;
        }
      }

      // Resolve WIP limits from workflow settings, falling back to defaults
      let maxInProgress = DEFAULT_MAX_IN_PROGRESS;
      let maxInReview = DEFAULT_MAX_IN_REVIEW;

      if (settingsService) {
        try {
          const projectSettings = await settingsService.getProjectSettings(projectPath);
          const workflow = projectSettings.workflow ?? DEFAULT_WORKFLOW_SETTINGS;
          maxInProgress = workflow.maxInProgress ?? DEFAULT_MAX_IN_PROGRESS;
          maxInReview = workflow.maxInReview ?? DEFAULT_MAX_IN_REVIEW;
        } catch {
          // Fall through to defaults on settings read failure
        }
      }

      const wipSaturation = computeWipSaturation(
        inProgressCount,
        reviewCount,
        maxInProgress,
        maxInReview
      );

      res.json({ success: true, summary: { ...summary, wipSaturation } });
    } catch (error) {
      logError(error, 'Board summary failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
