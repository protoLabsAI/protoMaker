/**
 * Propose Improvements Node — LLM extracts actionable improvements
 *
 * Analyzes the retrospective and project data to propose 1-3
 * concrete improvement items. Each item is typed for routing:
 * - "operational" → Beads task
 * - "code" → Automaker backlog feature
 * - "strategic" → Full PRD pipeline (submit_prd)
 */

import type { WrapUpState, ImprovementItem } from '../types.js';

/**
 * Interface for pluggable improvement extraction.
 * Server injects real LLM implementation; tests use mock.
 */
export interface ImprovementExtractor {
  extract(retrospective: string, dataSummary: string): Promise<ImprovementItem[]>;
}

/** Default mock extractor */
const mockExtractor: ImprovementExtractor = {
  async extract(_retrospective, _dataSummary) {
    return [];
  },
};

export function createProposeImprovementsNode(extractor?: ImprovementExtractor) {
  const impl = extractor || mockExtractor;

  return async (state: WrapUpState): Promise<Partial<WrapUpState>> => {
    const { retrospective, metrics } = state;

    if (!retrospective) {
      return {
        stage: 'proposing_improvements',
        improvements: [],
      };
    }

    const improvements = await impl.extract(retrospective, metrics?.dataSummary || '');

    // Cap at 3 items
    return {
      stage: 'proposing_improvements',
      improvements: improvements.slice(0, 3),
    };
  };
}

export const proposeImprovementsNode = createProposeImprovementsNode();
