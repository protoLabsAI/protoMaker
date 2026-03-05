/**
 * Create Issues Node
 *
 * Takes the approved milestones and creates issues.
 * This is the final step — after this, the project is ready for execution.
 */

import type { ProjectPlanningState, PlannedMilestone } from '../types.js';

/**
 * Interface for pluggable issue creation.
 */
export interface IssueCreator {
  createIssues(
    projectId: string,
    milestones: PlannedMilestone[],
    teamId?: string
  ): Promise<string[]>;
}

/** Default mock issue creator */
const mockIssueCreator: IssueCreator = {
  async createIssues(_projectId, milestones) {
    // Return mock issue IDs
    const ids: string[] = [];
    for (const m of milestones) {
      ids.push(`mock-milestone-${m.title.toLowerCase().replace(/\s+/g, '-')}`);
      for (const p of m.phases) {
        ids.push(`mock-phase-${p.title.toLowerCase().replace(/\s+/g, '-')}`);
      }
    }
    return ids;
  },
};

export function createIssueCreationNode(creator?: IssueCreator) {
  const impl = creator || mockIssueCreator;

  return async (state: ProjectPlanningState): Promise<Partial<ProjectPlanningState>> => {
    const { projectInput, milestones } = state;

    if (milestones.length === 0) {
      return {
        errors: ['Cannot create issues without milestones'],
        stage: 'error',
      };
    }

    const createdIssueIds = await impl.createIssues(
      projectInput.projectId,
      milestones,
      projectInput.teamId
    );

    return {
      stage: 'completed',
      createdIssueIds,
    };
  };
}

export const createIssuesNode = createIssueCreationNode();
