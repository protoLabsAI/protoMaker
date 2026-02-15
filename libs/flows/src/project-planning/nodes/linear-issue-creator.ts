/**
 * Linear Issue Creator
 *
 * Creates real Linear issues from planned milestones.
 * Uses dependency injection for the Linear API calls so the flows
 * package doesn't depend on server-side services directly.
 *
 * For each milestone:
 *   1. Create a Linear project milestone
 *   2. Create a parent issue (epic) for the milestone
 *   3. Create child issues for each phase
 *   4. Assign all issues to the milestone
 *
 * Complexity → Priority mapping:
 *   large  → 2 (high)
 *   medium → 3 (normal)
 *   small  → 4 (low)
 */

import type { PlannedMilestone, PlannedPhase } from '../types.js';
import type { IssueCreator } from './create-issues.js';

/** Dependency-injected functions for Linear API operations */
export interface LinearIssueCreatorDeps {
  createIssue: (opts: {
    title: string;
    description?: string;
    teamId: string;
    projectId?: string;
    priority?: number;
    parentId?: string;
  }) => Promise<{ issueId: string; identifier?: string; url?: string }>;

  createProjectMilestone: (opts: {
    projectId: string;
    name: string;
    description?: string;
    sortOrder?: number;
  }) => Promise<{ id: string; name: string }>;

  assignIssueToMilestone: (issueId: string, projectMilestoneId: string) => Promise<boolean>;
}

/** Map phase complexity to Linear priority (1=urgent, 2=high, 3=normal, 4=low) */
function complexityToPriority(complexity: PlannedPhase['complexity']): number {
  switch (complexity) {
    case 'large':
      return 2;
    case 'medium':
      return 3;
    case 'small':
      return 4;
    default:
      return 3;
  }
}

/**
 * Create a real Linear issue creator backed by dependency-injected API calls.
 */
export function createLinearIssueCreator(deps: LinearIssueCreatorDeps): IssueCreator {
  return {
    async createIssues(
      projectId: string,
      milestones: PlannedMilestone[],
      teamId?: string
    ): Promise<string[]> {
      if (!teamId) {
        throw new Error('teamId is required for creating Linear issues');
      }

      const allIssueIds: string[] = [];

      for (let i = 0; i < milestones.length; i++) {
        const milestone = milestones[i];

        // 1. Create Linear project milestone
        const linearMilestone = await deps.createProjectMilestone({
          projectId,
          name: milestone.title,
          description: milestone.description,
          sortOrder: i + 1,
        });

        // 2. Create parent issue (epic) for the milestone
        const epicResult = await deps.createIssue({
          title: milestone.title,
          description: milestone.description,
          teamId,
          projectId,
          priority: 3, // normal
        });
        allIssueIds.push(epicResult.issueId);

        // Assign epic to milestone
        await deps.assignIssueToMilestone(epicResult.issueId, linearMilestone.id);

        // 3. Create child issues for each phase
        for (const phase of milestone.phases) {
          const phaseResult = await deps.createIssue({
            title: phase.title,
            description: buildPhaseDescription(phase),
            teamId,
            projectId,
            priority: complexityToPriority(phase.complexity),
            parentId: epicResult.issueId,
          });
          allIssueIds.push(phaseResult.issueId);

          // Assign phase issue to same milestone
          await deps.assignIssueToMilestone(phaseResult.issueId, linearMilestone.id);
        }
      }

      return allIssueIds;
    },
  };
}

/** Build a markdown description for a phase issue */
function buildPhaseDescription(phase: PlannedPhase): string {
  const sections: string[] = [];

  sections.push(phase.description);
  sections.push('');

  if (phase.filesToModify.length > 0) {
    sections.push('**Files to modify:**');
    for (const file of phase.filesToModify) {
      sections.push(`- \`${file}\``);
    }
    sections.push('');
  }

  if (phase.acceptanceCriteria.length > 0) {
    sections.push('**Acceptance criteria:**');
    for (const criterion of phase.acceptanceCriteria) {
      sections.push(`- [ ] ${criterion}`);
    }
    sections.push('');
  }

  sections.push(`**Complexity:** ${phase.complexity}`);

  return sections.join('\n');
}
