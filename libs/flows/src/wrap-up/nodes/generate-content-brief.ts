/**
 * Generate Content Brief Node — Creates a GTM content outline
 *
 * Takes the retrospective and project metrics, produces a content brief
 * that can be fed into the content creation pipeline.
 */

import type { WrapUpState } from '../types.js';

/**
 * Interface for pluggable content brief generation.
 * Server injects real LLM implementation; tests use mock.
 */
export interface ContentBriefGenerator {
  generate(projectTitle: string, retrospective: string, dataSummary: string): Promise<string>;
}

/** Default mock brief */
const mockBriefGenerator: ContentBriefGenerator = {
  async generate(projectTitle, _retrospective, _dataSummary) {
    return [
      `# Content Brief: ${projectTitle}`,
      '',
      '## Topic',
      `Technical deep dive on ${projectTitle} implementation.`,
      '',
      '## Key Points',
      '- Architecture decisions and trade-offs',
      '- Lessons learned and best practices',
      '- Metrics and outcomes',
      '',
      '## Target Audience',
      'Engineering teams building similar systems.',
    ].join('\n');
  },
};

export function createGenerateContentBriefNode(generator?: ContentBriefGenerator) {
  const impl = generator || mockBriefGenerator;

  return async (state: WrapUpState): Promise<Partial<WrapUpState>> => {
    const { input, retrospective, metrics } = state;

    const contentBrief = await impl.generate(
      input.projectTitle,
      retrospective || '',
      metrics?.dataSummary || ''
    );

    return {
      stage: 'generating_content',
      contentBrief,
    };
  };
}

export const generateContentBriefNode = createGenerateContentBriefNode();
