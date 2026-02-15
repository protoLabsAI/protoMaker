/**
 * Research Node — Initial codebase analysis
 *
 * Analyzes the project description and codebase to gather context
 * for planning. Produces a ResearchReport.
 */

import type { ProjectPlanningState, ResearchReport } from '../types.js';

/**
 * Interface for pluggable research execution.
 * Server injects real implementation; tests use mocks.
 */
export interface ResearchExecutor {
  research(projectName: string, description: string, projectPath: string): Promise<ResearchReport>;
}

/** Default mock research for testing */
const mockResearch: ResearchExecutor = {
  async research(projectName, description, projectPath) {
    return {
      projectName,
      findings: [
        {
          topic: 'Project Overview',
          summary: `Analysis of "${projectName}" based on description: ${description.substring(0, 200)}`,
          relevantFiles: [],
          patterns: [],
          risks: [],
        },
      ],
      codebaseContext: `Codebase at ${projectPath}`,
      technicalConstraints: [],
      existingPatterns: [],
      suggestedApproach: 'Standard implementation approach',
    };
  },
};

/**
 * Creates a research node with the given executor.
 */
export function createResearchNode(executor?: ResearchExecutor) {
  const impl = executor || mockResearch;

  return async (state: ProjectPlanningState): Promise<Partial<ProjectPlanningState>> => {
    const { projectInput, projectPath } = state;

    const researchReport = await impl.research(
      projectInput.name,
      projectInput.description,
      projectPath
    );

    return {
      stage: 'researching',
      researchReport,
    };
  };
}

/** Default node using mock research */
export const researchNode = createResearchNode();
