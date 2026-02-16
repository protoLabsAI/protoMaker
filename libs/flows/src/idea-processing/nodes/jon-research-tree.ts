/**
 * Jon Research Tree Node
 *
 * Provides world state context for Jon (GTM Specialist) during idea processing.
 * Injects Discord activity, recent launches, and backlog priority data from existing APIs.
 */

/**
 * World state context for Jon
 */
export interface JonWorldState {
  /** Discord activity metrics */
  discord: {
    recentMessages: number;
    activeChannels: string[];
    communityEngagement: 'high' | 'medium' | 'low';
  };
  /** Recent launches and GTM activity */
  launches: {
    recentFeatures: Array<{
      id: string;
      title: string;
      completedAt: string;
    }>;
    upcomingMilestones: string[];
  };
  /** Backlog priority breakdown */
  backlog: {
    totalCount: number;
    byComplexity: {
      small: number;
      medium: number;
      large: number;
      architectural: number;
    };
    contentRelated: number;
  };
}

/**
 * Fetch world state for Jon from existing APIs
 */
export async function getJonWorldState(): Promise<JonWorldState> {
  // World state will be injected by IdeaProcessingService
  // This is a placeholder that will be populated by the service
  return {
    discord: {
      recentMessages: 0,
      activeChannels: [],
      communityEngagement: 'low',
    },
    launches: {
      recentFeatures: [],
      upcomingMilestones: [],
    },
    backlog: {
      totalCount: 0,
      byComplexity: {
        small: 0,
        medium: 0,
        large: 0,
        architectural: 0,
      },
      contentRelated: 0,
    },
  };
}

/**
 * Process idea with Jon's world state context
 */
export async function processJonResearch(
  ideaDescription: string,
  worldState: JonWorldState,
): Promise<{
  analysis: string;
  marketFit: 'strong' | 'moderate' | 'weak';
  communityRelevance: boolean;
}> {

  // Simple heuristic analysis based on GTM context
  const hasRecentLaunches = worldState.launches.recentFeatures.length > 0;
  const communityActive = worldState.discord.communityEngagement !== 'low';
  const contentGapExists = worldState.backlog.contentRelated < 5;

  let marketFit: 'strong' | 'moderate' | 'weak' = 'moderate';
  if (communityActive && hasRecentLaunches && contentGapExists) {
    marketFit = 'strong';
  } else if (!communityActive || worldState.launches.upcomingMilestones.length === 0) {
    marketFit = 'weak';
  }

  return {
    analysis: `Analyzed idea from GTM perspective. Community engagement: ${worldState.discord.communityEngagement}, Recent launches: ${worldState.launches.recentFeatures.length}, Content gap: ${contentGapExists ? 'yes' : 'no'}`,
    marketFit,
    communityRelevance: communityActive,
  };
}
