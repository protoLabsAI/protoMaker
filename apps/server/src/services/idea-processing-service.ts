/**
 * IdeaProcessingService - Orchestrate idea processing with world state injection
 *
 * Wires Ava and Jon research trees with world state from existing APIs:
 * - Ava gets board state, capacity metrics, velocity
 * - Jon gets Discord activity, recent launches, backlog priority
 *
 * Emits idea:* events to stream progress to UI via WebSocket
 */

import { createLogger } from '@automaker/utils';
import type { EventBus } from '@automaker/types';
import {
  processAvaResearch,
  getAvaWorldState,
  type AvaWorldState,
  processJonResearch,
  getJonWorldState,
  type JonWorldState,
} from '@automaker/flows';

const logger = createLogger('IdeaProcessingService');

export interface IdeaProcessingOptions {
  projectPath: string;
  ideaDescription: string;
  emit?: EventBus;
}

export interface IdeaProcessingResult {
  success: boolean;
  avaAnalysis?: {
    analysis: string;
    feasibility: 'high' | 'medium' | 'low';
    capacityCheck: boolean;
  };
  jonAnalysis?: {
    analysis: string;
    marketFit: 'strong' | 'moderate' | 'weak';
    communityRelevance: boolean;
  };
  synthesis?: string;
  error?: string;
}

/**
 * Process an idea through Ava and Jon research trees with world state injection
 */
export async function processIdea(
  options: IdeaProcessingOptions,
): Promise<IdeaProcessingResult> {
  const { projectPath, ideaDescription, emit } = options;

  try {
    logger.info('Starting idea processing', { projectPath });
    emit?.emit('idea:research-started', {
      projectPath,
      ideaDescription: ideaDescription.substring(0, 100),
    });

    // Fetch world state for Ava (board, capacity, velocity)
    emit?.emit('idea:research-progress', { message: 'Gathering Ava world state' });
    const avaWorldState = await fetchAvaWorldState(projectPath);

    // Fetch world state for Jon (Discord, launches, backlog)
    emit?.emit('idea:research-progress', { message: 'Gathering Jon world state' });
    const jonWorldState = await fetchJonWorldState(projectPath);

    // Run Ava research with world state
    emit?.emit('idea:research-progress', { message: 'Running Ava analysis' });
    const avaAnalysis = await processAvaResearch(ideaDescription, avaWorldState);

    // Run Jon research with world state
    emit?.emit('idea:research-progress', { message: 'Running Jon analysis' });
    const jonAnalysis = await processJonResearch(ideaDescription, jonWorldState);

    // Synthesize results
    emit?.emit('idea:synthesis-started', {
      avaFeasibility: avaAnalysis.feasibility,
      jonMarketFit: jonAnalysis.marketFit,
    });

    const synthesis = synthesizeAnalysis(avaAnalysis, jonAnalysis);

    emit?.emit('idea:synthesis-completed', { synthesis });
    emit?.emit('idea:research-completed', {
      success: true,
      projectPath,
    });

    logger.info('Idea processing completed', { projectPath });

    return {
      success: true,
      avaAnalysis,
      jonAnalysis,
      synthesis,
    };
  } catch (error) {
    logger.error('Idea processing failed', { error, projectPath });
    emit?.emit('idea:processing-error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      projectPath,
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Fetch world state for Ava from existing APIs
 * Uses board summary, capacity metrics, and velocity data
 */
async function fetchAvaWorldState(projectPath: string): Promise<AvaWorldState> {
  // Placeholder implementation - will be wired to existing APIs
  // In production, this would call:
  // - FeatureLoader.loadFeatures() for board state
  // - MetricsService.getCapacityMetrics() for capacity
  // - MetricsService.getProjectMetrics() for velocity

  return getAvaWorldState();
}

/**
 * Fetch world state for Jon from existing APIs
 * Uses Discord monitoring, feature history, and backlog data
 */
async function fetchJonWorldState(projectPath: string): Promise<JonWorldState> {
  // Placeholder implementation - will be wired to existing APIs
  // In production, this would call:
  // - Discord monitoring service for activity
  // - FeatureLoader for recent launches and backlog
  // - Content pipeline for GTM activity

  return getJonWorldState();
}

/**
 * Synthesize Ava and Jon analyses into a unified recommendation
 */
function synthesizeAnalysis(
  avaAnalysis: {
    analysis: string;
    feasibility: 'high' | 'medium' | 'low';
    capacityCheck: boolean;
  },
  jonAnalysis: {
    analysis: string;
    marketFit: 'strong' | 'moderate' | 'weak';
    communityRelevance: boolean;
  },
): string {
  const lines = [
    '## Idea Processing Summary',
    '',
    '### Operational Feasibility (Ava)',
    avaAnalysis.analysis,
    `- Feasibility: ${avaAnalysis.feasibility}`,
    `- Capacity available: ${avaAnalysis.capacityCheck ? 'Yes' : 'No'}`,
    '',
    '### Market Fit (Jon)',
    jonAnalysis.analysis,
    `- Market fit: ${jonAnalysis.marketFit}`,
    `- Community relevance: ${jonAnalysis.communityRelevance ? 'Yes' : 'No'}`,
    '',
    '### Recommendation',
  ];

  // Simple recommendation heuristic
  const shouldProceed =
    (avaAnalysis.feasibility === 'high' || avaAnalysis.feasibility === 'medium') &&
    (jonAnalysis.marketFit === 'strong' || jonAnalysis.marketFit === 'moderate');

  if (shouldProceed) {
    lines.push(
      '✅ Recommended to proceed. Good operational feasibility and market alignment.',
    );
  } else if (avaAnalysis.feasibility === 'low') {
    lines.push(
      '⚠️  Defer due to capacity constraints. Consider revisiting when resources free up.',
    );
  } else if (jonAnalysis.marketFit === 'weak') {
    lines.push(
      '⚠️  Weak market fit. Consider refining positioning or deprioritizing.',
    );
  } else {
    lines.push('❓ Mixed signals. Recommend further research before committing.');
  }

  return lines.join('\n');
}

export const IdeaProcessingService = {
  processIdea,
};
