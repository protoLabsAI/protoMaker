/**
 * Deep Research Node
 *
 * Takes the approved planning document and performs detailed
 * implementation research — file-by-file analysis, dependency
 * mapping, and integration point identification.
 */

import type { ProjectPlanningState, PlanningArtifact, ResearchReport } from '../types.js';

/**
 * Interface for pluggable deep research execution.
 */
export interface DeepResearchExecutor {
  deepResearch(
    projectName: string,
    planningDoc: string,
    research: ResearchReport,
    projectPath: string
  ): Promise<string>;
}

/** Default mock deep research */
const mockDeepResearch: DeepResearchExecutor = {
  async deepResearch(projectName, planningDoc, research, projectPath) {
    return `# Deep Research: ${projectName}

## Implementation Analysis

Based on the approved planning document and initial research findings,
here is a detailed implementation analysis.

## Key Files to Modify
${
  research.findings
    .flatMap((f) => f.relevantFiles || [])
    .map((f) => `- \`${f}\``)
    .join('\n') || '- To be determined during implementation'
}

## Integration Points
- Existing patterns will be followed per codebase conventions
- Project path: ${projectPath}

## Technical Deep Dive
${planningDoc.substring(0, 500)}...

## Risk Assessment
${
  research.findings
    .flatMap((f) => f.risks || [])
    .map((r) => `- ${r}`)
    .join('\n') || '- No significant risks identified'
}
`;
  },
};

export function createDeepResearchNode(executor?: DeepResearchExecutor) {
  const impl = executor || mockDeepResearch;

  return async (state: ProjectPlanningState): Promise<Partial<ProjectPlanningState>> => {
    const { projectInput, planningDoc, researchReport, projectPath } = state;

    if (!planningDoc || !researchReport) {
      return {
        errors: ['Cannot perform deep research without planning doc and research report'],
        stage: 'error',
      };
    }

    const content = await impl.deepResearch(
      projectInput.name,
      planningDoc.content,
      researchReport,
      projectPath
    );

    const researchDoc: PlanningArtifact = {
      title: `Deep Research: ${projectInput.name}`,
      content,
      createdAt: new Date().toISOString(),
    };

    return {
      stage: 'research_doc_review',
      researchDoc,
    };
  };
}

export const deepResearchNode = createDeepResearchNode();
