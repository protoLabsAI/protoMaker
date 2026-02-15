/**
 * Generate PRD Node
 *
 * Takes the approved research documents and generates a SPARC PRD
 * (Situation, Problem, Approach, Results, Constraints).
 */

import type { ProjectPlanningState, PlanningArtifact, SPARCSection } from '../types.js';

/**
 * Interface for pluggable PRD generation.
 */
export interface PRDGenerator {
  generate(
    projectName: string,
    description: string,
    planningDoc: string,
    researchDoc: string,
    feedback?: string
  ): Promise<SPARCSection>;
}

/** Default mock PRD generator */
const mockPRDGenerator: PRDGenerator = {
  async generate(projectName, description) {
    return {
      situation: `The ${projectName} project addresses: ${description.substring(0, 200)}`,
      problem: `Current implementation lacks the capabilities described in the project scope.`,
      approach: `Implement the solution following existing codebase patterns and conventions.`,
      results: `The system will have full ${projectName} functionality as specified.`,
      constraints: [
        'Must maintain backward compatibility with existing APIs',
        'Must follow existing code patterns and conventions',
        'Must include tests for new functionality',
      ],
    };
  },
};

function formatPRD(projectName: string, prd: SPARCSection): string {
  return `# SPARC PRD: ${projectName}

## Situation
${prd.situation}

## Problem
${prd.problem}

## Approach
${prd.approach}

## Results
${prd.results}

## Constraints
${prd.constraints.map((c) => `- ${c}`).join('\n')}
`;
}

export function createGeneratePRDNode(generator?: PRDGenerator) {
  const impl = generator || mockPRDGenerator;

  return async (state: ProjectPlanningState): Promise<Partial<ProjectPlanningState>> => {
    const { projectInput, planningDoc, researchDoc, latestHitlResponse } = state;

    if (!planningDoc || !researchDoc) {
      return {
        errors: ['Cannot generate PRD without planning and research documents'],
        stage: 'error',
      };
    }

    const feedback =
      latestHitlResponse?.decision === 'revise' ? latestHitlResponse.feedback : undefined;

    const prd = await impl.generate(
      projectInput.name,
      projectInput.description,
      planningDoc.content,
      researchDoc.content,
      feedback
    );

    const prdDoc: PlanningArtifact = {
      title: `PRD: ${projectInput.name}`,
      content: formatPRD(projectInput.name, prd),
      createdAt: new Date().toISOString(),
    };

    return {
      stage: 'prd_review',
      prd,
      prdDoc,
    };
  };
}

export const generatePRDNode = createGeneratePRDNode();
