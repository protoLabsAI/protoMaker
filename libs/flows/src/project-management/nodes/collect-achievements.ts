/**
 * Collect Achievements Node
 *
 * Gathers completed features and their metadata from a milestone.
 * Currently uses deterministic mock data — will be wired to real services
 * when integrated into the server runtime.
 *
 * In production, this node receives injected service references via config
 * to call FeatureLoader, LinearProjectUpdateService, etc.
 */

import type { MilestoneSummaryState, Achievement } from '../types.js';

/**
 * Service interface for achievement collection
 * Allows dependency injection of real services in server context
 */
export interface AchievementCollector {
  getAchievements(projectPath: string, milestoneName: string): Promise<Achievement[]>;
}

/**
 * Mock achievement collector for testing and development
 */
export const mockAchievementCollector: AchievementCollector = {
  async getAchievements(projectPath: string, milestoneName: string): Promise<Achievement[]> {
    return [
      {
        featureId: 'feature-001',
        title: 'LangGraph Foundation Types',
        description: 'Core TypeScript types for milestone summary state',
        prNumber: 476,
        mergedAt: new Date().toISOString(),
        costUsd: 0.85,
        linesChanged: { added: 120, deleted: 5 },
      },
      {
        featureId: 'feature-002',
        title: 'Milestone Summary Flow',
        description: 'LangGraph flow for generating milestone completion summaries',
        prNumber: 477,
        mergedAt: new Date().toISOString(),
        costUsd: 1.2,
        linesChanged: { added: 200, deleted: 10 },
      },
    ];
  },
};

// Module-level collector reference — set via createCollectAchievementsNode()
let _collector: AchievementCollector = mockAchievementCollector;

/**
 * Creates a collect achievements node with injected collector
 */
export function createCollectAchievementsNode(
  collector: AchievementCollector
): (state: MilestoneSummaryState) => Promise<Partial<MilestoneSummaryState>> {
  return async (state: MilestoneSummaryState): Promise<Partial<MilestoneSummaryState>> => {
    try {
      const achievements = await collector.getAchievements(state.projectPath, state.milestoneName);

      return { achievements };
    } catch (err) {
      return {
        error: `Failed to collect achievements: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  };
}

/**
 * Default collect achievements node using mock collector
 */
export async function collectAchievements(
  state: MilestoneSummaryState
): Promise<Partial<MilestoneSummaryState>> {
  return createCollectAchievementsNode(_collector)(state);
}
