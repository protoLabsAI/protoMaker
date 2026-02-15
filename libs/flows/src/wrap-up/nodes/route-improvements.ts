/**
 * Route Improvements Node — Dispatches improvements to appropriate systems
 *
 * Routes each improvement by type:
 * - "operational" → Beads task (process/workflow changes)
 * - "code" → Automaker backlog feature (codebase changes)
 * - "strategic" → PRD pipeline via submit_prd (large initiatives)
 */

import type { WrapUpState, ImprovementItem } from '../types.js';

/**
 * Interface for routing improvements to external systems.
 * Server injects real implementation with Beads, FeatureLoader, PRD submission.
 */
export interface ImprovementRouter {
  /** Create a Beads task for operational improvements */
  createBeadsTask(projectPath: string, item: ImprovementItem): Promise<{ id: string } | null>;

  /** Create an Automaker backlog feature for code improvements */
  createFeature(projectPath: string, item: ImprovementItem): Promise<{ id: string } | null>;

  /** Submit a PRD for strategic improvements (full pipeline loop) */
  submitPrd?(projectPath: string, item: ImprovementItem): Promise<{ id: string } | null>;
}

/** Default mock router */
const mockRouter: ImprovementRouter = {
  async createBeadsTask(_path, _item) {
    return { id: 'mock-beads-id' };
  },
  async createFeature(_path, _item) {
    return { id: 'mock-feature-id' };
  },
};

export function createRouteImprovementsNode(router?: ImprovementRouter) {
  const impl = router || mockRouter;

  return async (state: WrapUpState): Promise<Partial<WrapUpState>> => {
    const { input, improvements } = state;
    const beadsIds: string[] = [];
    const featureIds: string[] = [];
    const prdIds: string[] = [];
    const errors: string[] = [];

    for (const item of improvements) {
      try {
        switch (item.type) {
          case 'operational': {
            const result = await impl.createBeadsTask(input.projectPath, item);
            if (result) beadsIds.push(result.id);
            break;
          }
          case 'code': {
            const result = await impl.createFeature(input.projectPath, item);
            if (result) featureIds.push(result.id);
            break;
          }
          case 'strategic': {
            if (impl.submitPrd) {
              const result = await impl.submitPrd(input.projectPath, item);
              if (result) prdIds.push(result.id);
            } else {
              // Fall back to creating a feature if PRD submission not available
              const result = await impl.createFeature(input.projectPath, item);
              if (result) featureIds.push(result.id);
            }
            break;
          }
        }
      } catch (error) {
        errors.push(`Failed to route improvement "${item.title}": ${error}`);
      }
    }

    return {
      stage: 'routing_improvements',
      createdBeadsIds: beadsIds,
      createdFeatureIds: featureIds,
      createdPrdIds: prdIds,
      errors: errors.length > 0 ? errors : undefined,
    };
  };
}

export const routeImprovementsNode = createRouteImprovementsNode();
