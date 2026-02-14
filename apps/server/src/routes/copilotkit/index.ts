/**
 * CopilotKit routes - Express endpoint for CopilotKit runtime
 *
 * Provides the /api/copilotkit endpoint that the CopilotKit React provider connects to.
 * Uses AnthropicAdapter with the existing ANTHROPIC_API_KEY.
 * Registers server-side actions for board operations.
 */

import {
  CopilotRuntime,
  AnthropicAdapter,
  copilotRuntimeNodeExpressEndpoint,
} from '@copilotkit/runtime';
import { createLogger } from '@automaker/utils';
import type { FeatureLoader } from '../../services/feature-loader.js';
import type { AutoModeService } from '../../services/auto-mode-service.js';

const logger = createLogger('CopilotKit');

interface CopilotKitDependencies {
  featureLoader: FeatureLoader;
  autoModeService: AutoModeService;
}

function createServerActions(deps: CopilotKitDependencies) {
  const { featureLoader, autoModeService } = deps;

  return [
    {
      name: 'listFeatures',
      description: 'List all features on the board, optionally filtered by status',
      parameters: [
        {
          name: 'projectPath',
          type: 'string' as const,
          description: 'Path to the project',
          required: true,
        },
        {
          name: 'status',
          type: 'string' as const,
          description:
            'Filter by status: backlog, in_progress, review, blocked, done, verified. Leave empty for all.',
          required: false,
        },
      ],
      handler: async (args: Record<string, any>) => {
        const features = await featureLoader.getAll(args.projectPath);
        const filtered = args.status ? features.filter((f) => f.status === args.status) : features;
        return filtered.map((f) => ({
          id: f.id,
          title: f.title,
          status: f.status,
          complexity: f.complexity,
          description: f.description?.substring(0, 200),
          isEpic: f.isEpic ?? false,
          epicId: f.epicId,
          prUrl: f.prUrl,
        }));
      },
    },
    {
      name: 'createFeature',
      description: 'Create a new feature on the board',
      parameters: [
        {
          name: 'projectPath',
          type: 'string' as const,
          description: 'Path to the project',
          required: true,
        },
        {
          name: 'title',
          type: 'string' as const,
          description: 'Feature title',
          required: true,
        },
        {
          name: 'description',
          type: 'string' as const,
          description: 'Feature description with requirements and acceptance criteria',
          required: true,
        },
        {
          name: 'complexity',
          type: 'string' as const,
          description: 'Feature complexity: small, medium, large, or architectural',
          required: false,
        },
      ],
      handler: async (args: Record<string, any>) => {
        const feature = await featureLoader.create(args.projectPath, {
          title: args.title,
          description: args.description,
          complexity: args.complexity ?? 'medium',
          status: 'backlog',
        });
        return { id: feature.id, title: feature.title, status: feature.status };
      },
    },
    {
      name: 'moveFeature',
      description: 'Move a feature to a new status',
      parameters: [
        {
          name: 'projectPath',
          type: 'string' as const,
          description: 'Path to the project',
          required: true,
        },
        {
          name: 'featureId',
          type: 'string' as const,
          description: 'ID of the feature to move',
          required: true,
        },
        {
          name: 'status',
          type: 'string' as const,
          description: 'New status: backlog, in_progress, review, blocked, done',
          required: true,
        },
      ],
      handler: async (args: Record<string, any>) => {
        const updated = await featureLoader.update(args.projectPath, args.featureId, {
          status: args.status,
        });
        return { id: updated.id, title: updated.title, status: updated.status };
      },
    },
    {
      name: 'getBoardSummary',
      description: 'Get a summary of the board state including feature counts by status',
      parameters: [
        {
          name: 'projectPath',
          type: 'string' as const,
          description: 'Path to the project',
          required: true,
        },
      ],
      handler: async (args: Record<string, any>) => {
        const features = await featureLoader.getAll(args.projectPath);
        const counts: Record<string, number> = {};
        for (const f of features) {
          const status = f.status ?? 'unknown';
          counts[status] = (counts[status] ?? 0) + 1;
        }
        const runningAgents = await autoModeService.getRunningAgents();
        const projectAgents = runningAgents.filter((a) => a.projectPath === args.projectPath);
        const projectStatus = autoModeService.getStatusForProject(args.projectPath);
        return {
          total: features.length,
          byStatus: counts,
          activeAgents: projectAgents.length,
          autoModeRunning: projectStatus.isAutoLoopRunning,
        };
      },
    },
    {
      name: 'startAutoMode',
      description: 'Start auto-mode for autonomous feature processing',
      parameters: [
        {
          name: 'projectPath',
          type: 'string' as const,
          description: 'Path to the project',
          required: true,
        },
      ],
      handler: async (args: Record<string, any>) => {
        const maxConcurrency = await autoModeService.startAutoLoopForProject(
          args.projectPath,
          null
        );
        return { started: true, maxConcurrency };
      },
    },
    {
      name: 'stopAutoMode',
      description: 'Stop auto-mode for a project',
      parameters: [
        {
          name: 'projectPath',
          type: 'string' as const,
          description: 'Path to the project',
          required: true,
        },
      ],
      handler: async (args: Record<string, any>) => {
        await autoModeService.stopAutoLoopForProject(args.projectPath);
        return { stopped: true };
      },
    },
  ];
}

export function createCopilotKitEndpoint(deps: CopilotKitDependencies) {
  const actions = createServerActions(deps);

  const runtime = new CopilotRuntime({
    actions,
  });

  const serviceAdapter = new AnthropicAdapter({
    model: 'claude-sonnet-4-5-20250929',
  });

  logger.info(`CopilotKit runtime initialized with ${actions.length} server actions`);

  return copilotRuntimeNodeExpressEndpoint({
    runtime,
    serviceAdapter,
    endpoint: '/api/copilotkit',
  });
}
