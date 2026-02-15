/**
 * Plan Milestones Node
 *
 * Takes the approved PRD and breaks it into milestones with phases.
 * Each phase is sized for a single AI agent session (~30-60 min).
 */

import type {
  ProjectPlanningState,
  PlanningArtifact,
  PlannedMilestone,
  SPARCSection,
} from '../types.js';

/**
 * Interface for pluggable milestone planning.
 */
export interface MilestonePlanner {
  plan(
    projectName: string,
    prd: SPARCSection,
    researchDoc: string,
    feedback?: string
  ): Promise<PlannedMilestone[]>;
}

/** Default mock milestone planner */
const mockPlanner: MilestonePlanner = {
  async plan(projectName, prd) {
    return [
      {
        title: 'Foundation',
        description: 'Core types, interfaces, and infrastructure',
        phases: [
          {
            title: 'Type Definitions',
            description: `Create TypeScript types for ${projectName}`,
            filesToModify: ['libs/types/src/'],
            acceptanceCriteria: ['Types compile', 'Exported from index'],
            complexity: 'small' as const,
          },
          {
            title: 'Core Service',
            description: `Implement core service logic`,
            filesToModify: ['apps/server/src/services/'],
            acceptanceCriteria: ['Service compiles', 'Unit tests pass'],
            complexity: 'medium' as const,
          },
        ],
      },
      {
        title: 'Integration',
        description: 'Wire services into the application',
        phases: [
          {
            title: 'API Routes',
            description: `Create API endpoints`,
            filesToModify: ['apps/server/src/routes/'],
            acceptanceCriteria: ['Routes respond correctly', 'Auth enforced'],
            complexity: 'medium' as const,
          },
        ],
      },
    ];
  },
};

function formatMilestones(projectName: string, milestones: PlannedMilestone[]): string {
  let doc = `# Milestones: ${projectName}\n\n`;

  for (let i = 0; i < milestones.length; i++) {
    const m = milestones[i];
    doc += `## M${i + 1}: ${m.title}\n`;
    doc += `${m.description}\n\n`;

    for (let j = 0; j < m.phases.length; j++) {
      const p = m.phases[j];
      doc += `### Phase ${j + 1}: ${p.title}\n`;
      doc += `${p.description}\n`;
      doc += `- **Complexity:** ${p.complexity}\n`;
      doc += `- **Files:** ${p.filesToModify.join(', ')}\n`;
      doc += `- **Acceptance Criteria:**\n`;
      for (const ac of p.acceptanceCriteria) {
        doc += `  - ${ac}\n`;
      }
      doc += '\n';
    }
  }

  return doc;
}

export function createPlanMilestonesNode(planner?: MilestonePlanner) {
  const impl = planner || mockPlanner;

  return async (state: ProjectPlanningState): Promise<Partial<ProjectPlanningState>> => {
    const { projectInput, prd, researchDoc, latestHitlResponse } = state;

    if (!prd || !researchDoc) {
      return {
        errors: ['Cannot plan milestones without PRD and research document'],
        stage: 'error',
      };
    }

    const feedback =
      latestHitlResponse?.decision === 'revise' ? latestHitlResponse.feedback : undefined;

    const milestones = await impl.plan(projectInput.name, prd, researchDoc.content, feedback);

    const milestoneDoc: PlanningArtifact = {
      title: `Milestones: ${projectInput.name}`,
      content: formatMilestones(projectInput.name, milestones),
      createdAt: new Date().toISOString(),
    };

    return {
      stage: 'milestone_review',
      milestones,
      milestoneDoc,
    };
  };
}

export const planMilestonesNode = createPlanMilestonesNode();
