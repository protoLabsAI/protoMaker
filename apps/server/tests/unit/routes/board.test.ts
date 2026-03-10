import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { createSummaryHandler, computeWipSaturation } from '@/routes/features/routes/summary.js';
import type { FeatureLoader } from '@/services/feature-loader.js';
import type { SettingsService } from '@/services/settings-service.js';
import { createMockExpressContext } from '../../utils/mocks.js';

describe('board summary - wipSaturation', () => {
  describe('computeWipSaturation', () => {
    it('computes ratios correctly for lanes under limit', () => {
      const result = computeWipSaturation(2, 5, 5, 10);

      expect(result.in_progress.count).toBe(2);
      expect(result.in_progress.limit).toBe(5);
      expect(result.in_progress.ratio).toBe(0.4);
      expect(result.in_progress.overLimit).toBe(false);

      expect(result.review.count).toBe(5);
      expect(result.review.limit).toBe(10);
      expect(result.review.ratio).toBe(0.5);
      expect(result.review.overLimit).toBe(false);

      expect(result.overallSaturation).toBe(0.5);
    });

    it('flags in_progress lane as overLimit when ratio exceeds 1.0', () => {
      const result = computeWipSaturation(6, 0, 5, 10);

      expect(result.in_progress.ratio).toBeCloseTo(1.2);
      expect(result.in_progress.overLimit).toBe(true);
      expect(result.review.overLimit).toBe(false);
      expect(result.overallSaturation).toBeCloseTo(1.2);
    });

    it('flags review lane as overLimit when ratio exceeds 1.0', () => {
      const result = computeWipSaturation(0, 11, 5, 10);

      expect(result.review.ratio).toBeCloseTo(1.1);
      expect(result.review.overLimit).toBe(true);
      expect(result.in_progress.overLimit).toBe(false);
      expect(result.overallSaturation).toBeCloseTo(1.1);
    });

    it('flags both lanes as overLimit when both exceed limits', () => {
      const result = computeWipSaturation(8, 15, 5, 10);

      expect(result.in_progress.overLimit).toBe(true);
      expect(result.review.overLimit).toBe(true);
      expect(result.overallSaturation).toBeCloseTo(1.6); // max(8/5, 15/10) = max(1.6, 1.5)
    });

    it('returns zero ratios when counts are zero', () => {
      const result = computeWipSaturation(0, 0, 5, 10);

      expect(result.in_progress.ratio).toBe(0);
      expect(result.review.ratio).toBe(0);
      expect(result.in_progress.overLimit).toBe(false);
      expect(result.review.overLimit).toBe(false);
      expect(result.overallSaturation).toBe(0);
    });

    it('overallSaturation is the max of the two ratios', () => {
      const result = computeWipSaturation(5, 2, 5, 10);
      // in_progress: 5/5 = 1.0, review: 2/10 = 0.2
      expect(result.overallSaturation).toBe(1.0);
    });

    it('does not flag as overLimit when ratio is exactly 1.0', () => {
      const result = computeWipSaturation(5, 10, 5, 10);

      expect(result.in_progress.ratio).toBe(1.0);
      expect(result.in_progress.overLimit).toBe(false);
      expect(result.review.ratio).toBe(1.0);
      expect(result.review.overLimit).toBe(false);
    });
  });

  describe('createSummaryHandler', () => {
    let mockFeatureLoader: FeatureLoader;
    let mockSettingsService: SettingsService;
    let req: Request;
    let res: Response;

    beforeEach(() => {
      vi.clearAllMocks();

      mockFeatureLoader = {
        getAll: vi.fn(),
        get: vi.fn(),
        save: vi.fn(),
        delete: vi.fn(),
      } as any;

      mockSettingsService = {
        getProjectSettings: vi.fn(),
        updateProjectSettings: vi.fn(),
        getGlobalSettings: vi.fn(),
      } as any;

      const context = createMockExpressContext();
      req = context.req;
      res = context.res;
    });

    it('includes wipSaturation in board summary response', async () => {
      const features = [
        { status: 'in_progress' },
        { status: 'in_progress' },
        { status: 'review' },
        { status: 'backlog' },
        { status: 'done' },
      ];

      vi.mocked(mockFeatureLoader.getAll).mockResolvedValue(features as any);
      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue({
        workflow: { maxInProgress: 5, maxInReview: 10 },
      } as any);

      req.body = { projectPath: '/test/project' };

      const handler = createSummaryHandler(mockFeatureLoader, mockSettingsService);
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          summary: expect.objectContaining({
            wipSaturation: expect.objectContaining({
              in_progress: expect.objectContaining({
                count: 2,
                limit: 5,
                ratio: 0.4,
                overLimit: false,
              }),
              review: expect.objectContaining({
                count: 1,
                limit: 10,
                ratio: 0.1,
                overLimit: false,
              }),
              overallSaturation: 0.4,
            }),
          }),
        })
      );
    });

    it('uses default limits when settingsService is not provided', async () => {
      const features = [{ status: 'in_progress' }, { status: 'review' }, { status: 'review' }];

      vi.mocked(mockFeatureLoader.getAll).mockResolvedValue(features as any);

      req.body = { projectPath: '/test/project' };

      const handler = createSummaryHandler(mockFeatureLoader);
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          summary: expect.objectContaining({
            wipSaturation: expect.objectContaining({
              in_progress: expect.objectContaining({ limit: 5 }),
              review: expect.objectContaining({ limit: 10 }),
            }),
          }),
        })
      );
    });

    it('uses default limits when workflow settings are missing from project settings', async () => {
      const features = [{ status: 'in_progress' }];

      vi.mocked(mockFeatureLoader.getAll).mockResolvedValue(features as any);
      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue({
        workflow: undefined,
      } as any);

      req.body = { projectPath: '/test/project' };

      const handler = createSummaryHandler(mockFeatureLoader, mockSettingsService);
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          summary: expect.objectContaining({
            wipSaturation: expect.objectContaining({
              in_progress: expect.objectContaining({ limit: 5 }),
              review: expect.objectContaining({ limit: 10 }),
            }),
          }),
        })
      );
    });

    it('uses custom limits from workflow settings', async () => {
      const features = [
        { status: 'in_progress' },
        { status: 'in_progress' },
        { status: 'in_progress' },
      ];

      vi.mocked(mockFeatureLoader.getAll).mockResolvedValue(features as any);
      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue({
        workflow: { maxInProgress: 2, maxInReview: 4 },
      } as any);

      req.body = { projectPath: '/test/project' };

      const handler = createSummaryHandler(mockFeatureLoader, mockSettingsService);
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          summary: expect.objectContaining({
            wipSaturation: expect.objectContaining({
              in_progress: expect.objectContaining({
                count: 3,
                limit: 2,
                ratio: 1.5,
                overLimit: true,
              }),
            }),
          }),
        })
      );
    });

    it('returns 400 when projectPath is missing', async () => {
      req.body = {};

      const handler = createSummaryHandler(mockFeatureLoader, mockSettingsService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'projectPath is required',
      });
    });

    it('falls back to defaults when settingsService throws', async () => {
      const features = [{ status: 'in_progress' }, { status: 'review' }];

      vi.mocked(mockFeatureLoader.getAll).mockResolvedValue(features as any);
      vi.mocked(mockSettingsService.getProjectSettings).mockRejectedValue(
        new Error('Settings read failure')
      );

      req.body = { projectPath: '/test/project' };

      const handler = createSummaryHandler(mockFeatureLoader, mockSettingsService);
      await handler(req, res);

      // Should still succeed with default limits
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          summary: expect.objectContaining({
            wipSaturation: expect.objectContaining({
              in_progress: expect.objectContaining({ limit: 5 }),
              review: expect.objectContaining({ limit: 10 }),
            }),
          }),
        })
      );
    });
  });
});
