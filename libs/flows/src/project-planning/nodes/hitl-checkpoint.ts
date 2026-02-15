/**
 * HITL Checkpoint Node
 *
 * Generic checkpoint that pauses the flow for human review.
 * When the flow resumes (via ConversationSurface response),
 * the user's decision is injected into state.
 *
 * This node is a routing decision point:
 * - approve → next stage
 * - revise → back to previous node (with feedback)
 * - cancel → error/done
 */

import type { ProjectPlanningState, HITLResponse, PlanningStage } from '../types.js';

/** Maximum revision iterations per checkpoint before auto-approving */
const MAX_REVISIONS = 3;

/**
 * Route after a HITL checkpoint based on user response.
 *
 * Returns the next node name to execute.
 */
export function createHitlRouter(config: {
  checkpointName: string;
  approveTarget: string;
  reviseTarget: string;
}) {
  return (state: ProjectPlanningState): string => {
    const { latestHitlResponse, revisionCounts } = state;

    if (!latestHitlResponse) {
      // No response yet — this shouldn't happen in normal flow
      return config.approveTarget;
    }

    if (latestHitlResponse.decision === 'cancel') {
      return 'done';
    }

    if (latestHitlResponse.decision === 'revise') {
      const count = revisionCounts[config.checkpointName] || 0;
      if (count >= MAX_REVISIONS) {
        // Auto-approve after max revisions
        return config.approveTarget;
      }
      return config.reviseTarget;
    }

    // approve
    return config.approveTarget;
  };
}

/**
 * Creates a node that processes HITL responses and updates revision counts.
 */
export function createHitlProcessorNode(checkpointName: string, nextStage: PlanningStage) {
  return async (state: ProjectPlanningState): Promise<Partial<ProjectPlanningState>> => {
    const response = state.latestHitlResponse;

    if (!response) {
      return { stage: nextStage };
    }

    const currentCount = state.revisionCounts[checkpointName] || 0;

    return {
      stage: nextStage,
      hitlResponses: [response],
      revisionCounts: {
        [checkpointName]: response.decision === 'revise' ? currentCount + 1 : currentCount,
      },
    };
  };
}
