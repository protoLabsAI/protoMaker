/**
 * Create Planning Document Node
 *
 * Takes research findings and generates an initial high-level planning document.
 * This document is presented to the user for HITL review.
 */

import type { ProjectPlanningState, PlanningArtifact, ResearchReport } from '../types.js';

/**
 * Interface for pluggable document generation.
 */
export interface PlanningDocGenerator {
  generate(projectName: string, description: string, research: ResearchReport): Promise<string>;
}

/** Default mock generator */
const mockGenerator: PlanningDocGenerator = {
  async generate(projectName, description, research) {
    const findings = research.findings.map((f) => `### ${f.topic}\n${f.summary}`).join('\n\n');

    return `# Planning Document: ${projectName}

## Overview
${description}

## Research Findings
${findings}

## Codebase Context
${research.codebaseContext}

## Technical Constraints
${research.technicalConstraints.map((c) => `- ${c}`).join('\n') || '- None identified'}

## Suggested Approach
${research.suggestedApproach}

## Next Steps
1. Review and approve this planning document
2. Proceed to deep research phase
3. Generate SPARC PRD
4. Define milestones and issues
`;
  },
};

export function createPlanningDocNode(generator?: PlanningDocGenerator) {
  const impl = generator || mockGenerator;

  return async (state: ProjectPlanningState): Promise<Partial<ProjectPlanningState>> => {
    const { projectInput, researchReport } = state;

    if (!researchReport) {
      return {
        errors: ['Cannot create planning document without research report'],
        stage: 'error',
      };
    }

    const content = await impl.generate(
      projectInput.name,
      projectInput.description,
      researchReport
    );

    const planningDoc: PlanningArtifact = {
      title: `Planning: ${projectInput.name}`,
      content,
      createdAt: new Date().toISOString(),
    };

    return {
      stage: 'planning_doc_review',
      planningDoc,
    };
  };
}

export const createPlanningDocNode_default = createPlanningDocNode();
