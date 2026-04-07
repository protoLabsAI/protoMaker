/**
 * Unit tests for PortfolioSitrepService.
 *
 * Covers:
 * - Fleet-wide sitrep aggregation
 * - Bottleneck classification logic
 * - Bottleneck trend detection
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Feature } from '@protolabsai/types';
import { PortfolioSitrepService } from '../../../src/services/portfolio-sitrep.js';
import { AutoLoopCoordinator } from '../../../src/services/auto-mode/auto-loop-coordinator.js';

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: `feat-${Math.random().toString(36).slice(2, 8)}`,
    category: 'test',
    description: 'Test feature',
    status: 'backlog',
    ...overrides,
  };
}

function createMockFeatureLoader(featuresByProject: Record<string, Feature[]> = {}) {
  return {
    getAll: vi.fn().mockImplementation((projectPath: string) => {
      return Promise.resolve(featuresByProject[projectPath] ?? []);
    }),
  } as any;
}

function createMockSettingsService(overrides: Record<string, any> = {}) {
  return {
    getGlobalSettings: vi.fn().mockResolvedValue({
      maxConcurrency: 2,
      systemMaxConcurrency: 4,
      ...overrides,
    }),
  } as any;
}

describe('PortfolioSitrepService', () => {
  let service: PortfolioSitrepService;
  let coordinator: AutoLoopCoordinator;

  beforeEach(() => {
    const featureLoader = createMockFeatureLoader({
      '/projects/alpha': [
        makeFeature({ status: 'in_progress' }),
        makeFeature({ status: 'backlog' }),
        makeFeature({ status: 'review' }),
        makeFeature({ status: 'done', completedAt: '2026-04-06T10:00:00Z' }),
      ],
      '/projects/beta': [
        makeFeature({ status: 'blocked', assignee: 'josh' }),
        makeFeature({ status: 'backlog' }),
      ],
    });
    coordinator = new AutoLoopCoordinator();
    const settingsService = createMockSettingsService();
    service = new PortfolioSitrepService(featureLoader, coordinator, settingsService);
  });

  // ── classifyBottleneck ─────────────────────────────────────────────────

  describe('classifyBottleneck', () => {
    it('returns pr_review when many features in review', () => {
      const features = [
        makeFeature({ status: 'review' }),
        makeFeature({ status: 'review' }),
        makeFeature({ status: 'review' }),
        makeFeature({ status: 'backlog' }),
      ];
      expect(service.classifyBottleneck(features)).toBe('pr_review');
    });

    it('returns human_input when features blocked by human', () => {
      const features = [
        makeFeature({ status: 'blocked', assignee: 'josh' }),
        makeFeature({ status: 'blocked', assignee: 'sara' }),
        makeFeature({ status: 'backlog' }),
      ];
      expect(service.classifyBottleneck(features)).toBe('human_input');
    });

    it('returns agent_capacity as default', () => {
      const features = [makeFeature({ status: 'in_progress' }), makeFeature({ status: 'backlog' })];
      expect(service.classifyBottleneck(features)).toBe('agent_capacity');
    });
  });

  // ── getPortfolioSitrep ─────────────────────────────────────────────────

  describe('getPortfolioSitrep', () => {
    it('returns sitrep for all projects', async () => {
      const sitrep = await service.getPortfolioSitrep(['/projects/alpha', '/projects/beta']);

      expect(sitrep.projects).toHaveLength(2);
      expect(sitrep.global.totalCapacityAvailable).toBe(4);
      expect(sitrep.timestamp).toBeTruthy();
    });

    it('counts in-progress features correctly', async () => {
      const sitrep = await service.getPortfolioSitrep(['/projects/alpha']);
      const alpha = sitrep.projects[0];
      expect(alpha.activeAgentCount).toBe(1);
      expect(alpha.queueDepth).toBe(1);
      expect(alpha.reviewCount).toBe(1);
    });

    it('tracks last completion time', async () => {
      const sitrep = await service.getPortfolioSitrep(['/projects/alpha']);
      expect(sitrep.projects[0].lastCompletionTime).toBe('2026-04-06T10:00:00Z');
    });

    it('reports paused status from coordinator', async () => {
      const key = coordinator.makeKey('/projects/alpha', null);
      coordinator.startLoop(
        key,
        {
          maxConcurrency: 1,
          useWorktrees: true,
          projectPath: '/projects/alpha',
          branchName: null,
        },
        async () => {}
      );
      coordinator.pauseLoop(key);

      const sitrep = await service.getPortfolioSitrep(['/projects/alpha']);
      expect(sitrep.projects[0].isPaused).toBe(true);
    });

    it('aggregates total capacity used', async () => {
      const sitrep = await service.getPortfolioSitrep(['/projects/alpha', '/projects/beta']);
      expect(sitrep.global.totalCapacityUsed).toBe(1); // 1 in_progress in alpha
    });
  });
});
