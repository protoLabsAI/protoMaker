/**
 * Generate Retrospective Node — LLM-powered retro generation
 *
 * Takes project metrics and produces a structured retrospective
 * covering: what went well, what went wrong, lessons, action items.
 */

import type { WrapUpState } from '../types.js';

/**
 * Interface for pluggable retrospective generation.
 * Server injects real LLM implementation; tests use mock.
 */
export interface RetroGenerator {
  generate(dataSummary: string, projectTitle: string): Promise<string>;
}

/** Default mock retro */
const mockRetro: RetroGenerator = {
  async generate(_dataSummary, projectTitle) {
    return [
      `## Retrospective: ${projectTitle}`,
      '',
      '### What Went Well',
      '- Project completed successfully',
      '',
      '### What Went Wrong',
      '- No significant issues identified',
      '',
      '### Lessons Learned',
      '- Standard implementation patterns applied',
      '',
      '### Action Items',
      '- Continue with current processes',
    ].join('\n');
  },
};

export function createGenerateRetroNode(generator?: RetroGenerator) {
  const impl = generator || mockRetro;

  return async (state: WrapUpState): Promise<Partial<WrapUpState>> => {
    const { metrics, input } = state;

    if (!metrics) {
      return {
        errors: ['Cannot generate retrospective: metrics not available'],
      };
    }

    const retrospective = await impl.generate(metrics.dataSummary, input.projectTitle);

    return {
      stage: 'generating_retro',
      retrospective,
    };
  };
}

export const generateRetroNode = createGenerateRetroNode();
