/**
 * CopilotKit routes - Express endpoint for CopilotKit runtime
 *
 * Provides the /api/copilotkit endpoint that the CopilotKit React provider connects to.
 * Registers a BuiltInAgent (Ava) with board-operation tools so the AG-UI protocol
 * can find the "default" agent on /api/copilotkit/info.
 */

import { CopilotRuntime } from '@copilotkitnext/runtime';
import { createCopilotEndpointExpress } from '@copilotkitnext/runtime/express';
import { BuiltInAgent, defineTool } from '@copilotkitnext/agent';
import { z } from 'zod';
import { createLogger } from '@automaker/utils';
import type { FeatureLoader } from '../../services/feature-loader.js';
import type { AutoModeService } from '../../services/auto-mode-service.js';

const logger = createLogger('CopilotKit');

interface CopilotKitDependencies {
  featureLoader: FeatureLoader;
  autoModeService: AutoModeService;
}

function createAvaTools(deps: CopilotKitDependencies) {
  const { featureLoader, autoModeService } = deps;

  return [
    defineTool({
      name: 'listFeatures',
      description: 'List all features on the board, optionally filtered by status',
      parameters: z.object({
        projectPath: z.string().describe('Path to the project'),
        status: z
          .string()
          .optional()
          .describe(
            'Filter by status: backlog, in_progress, review, blocked, done, verified. Leave empty for all.'
          ),
      }),
      execute: async (args) => {
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
    }),

    defineTool({
      name: 'createFeature',
      description: 'Create a new feature on the board',
      parameters: z.object({
        projectPath: z.string().describe('Path to the project'),
        title: z.string().describe('Feature title'),
        description: z
          .string()
          .describe('Feature description with requirements and acceptance criteria'),
        complexity: z
          .enum(['small', 'medium', 'large', 'architectural'])
          .optional()
          .describe('Feature complexity'),
      }),
      execute: async (args) => {
        const feature = await featureLoader.create(args.projectPath, {
          title: args.title,
          description: args.description,
          complexity: args.complexity ?? 'medium',
          status: 'backlog',
        });
        return { id: feature.id, title: feature.title, status: feature.status };
      },
    }),

    defineTool({
      name: 'moveFeature',
      description: 'Move a feature to a new status',
      parameters: z.object({
        projectPath: z.string().describe('Path to the project'),
        featureId: z.string().describe('ID of the feature to move'),
        status: z
          .enum(['backlog', 'in_progress', 'review', 'blocked', 'done', 'verified'])
          .describe('New status'),
      }),
      execute: async (args) => {
        const updated = await featureLoader.update(args.projectPath, args.featureId, {
          status: args.status,
        });
        return { id: updated.id, title: updated.title, status: updated.status };
      },
    }),

    defineTool({
      name: 'getBoardSummary',
      description: 'Get a summary of the board state including feature counts by status',
      parameters: z.object({
        projectPath: z.string().describe('Path to the project'),
      }),
      execute: async (args) => {
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
    }),

    defineTool({
      name: 'startAutoMode',
      description: 'Start auto-mode for autonomous feature processing',
      parameters: z.object({
        projectPath: z.string().describe('Path to the project'),
      }),
      execute: async (args) => {
        const maxConcurrency = await autoModeService.startAutoLoopForProject(
          args.projectPath,
          null
        );
        return { started: true, maxConcurrency };
      },
    }),

    defineTool({
      name: 'stopAutoMode',
      description: 'Stop auto-mode for a project',
      parameters: z.object({
        projectPath: z.string().describe('Path to the project'),
      }),
      execute: async (args) => {
        await autoModeService.stopAutoLoopForProject(args.projectPath);
        return { stopped: true };
      },
    }),
  ];
}

export function createCopilotKitEndpoint(deps: CopilotKitDependencies) {
  const tools = createAvaTools(deps);

  const avaAgent = new BuiltInAgent({
    model: 'anthropic/claude-sonnet-4-5-20250929',
    prompt: [
      'You are Ava, the AI assistant for protoMaker by protoLabs.',
      'You help users manage their development board, create and track features, control auto-mode, and understand project status.',
      'Use your tools to get real data before answering. Keep responses concise and action-oriented.',
      'When you perform an action, confirm what you did.',
    ].join(' '),
    // ToolDefinition<ZodObject<…>> ⊄ ToolDefinition<ZodTypeAny> due to generic variance.
    // Cast is safe — each tool already satisfies the ToolDefinition contract.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: tools as any,
    maxSteps: 5,
  });

  // CopilotKit v1.51 constructor types have a MaybePromise intersection bug
  // that rejects plain objects. The cast is safe — runtime accepts Record<string, Agent>.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runtime = new CopilotRuntime({ agents: { default: avaAgent } as any });

  logger.info(`CopilotKit runtime initialized with Ava agent (${tools.length} tools)`);

  // Use @copilotkitnext/runtime's Express-native endpoint (proper Express Router)
  // instead of @copilotkit/runtime's Hono-based adapter which has path mismatch issues.
  // basePath '/' because Express strips the mount prefix (/api/copilotkit) from req.url.
  return createCopilotEndpointExpress({ runtime, basePath: '/' });
}
