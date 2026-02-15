/**
 * CopilotKit routes - Express endpoint for CopilotKit runtime
 *
 * Provides the /api/copilotkit endpoint that the CopilotKit React provider connects to.
 * Registers three agents via the AG-UI protocol:
 * - "default" (Ava): BuiltInAgent with board-operation tools
 * - "content-pipeline": LangGraph flow for content creation
 * - "antagonistic-review": BuiltInAgent for content quality review
 * All agents are discoverable via /api/copilotkit/info.
 */

import { CopilotRuntime } from '@copilotkitnext/runtime';
import { createCopilotEndpointExpress } from '@copilotkitnext/runtime/express';
import { BuiltInAgent, defineTool } from '@copilotkitnext/agent';
import { z } from 'zod';
import { createLogger } from '@automaker/utils';
import { createContentCreationFlow, createAntagonisticReviewerGraph } from '@automaker/flows';
import { ChatAnthropic } from '@langchain/anthropic';
import type { FeatureLoader } from '../../services/feature-loader.js';
import type { AutoModeService } from '../../services/auto-mode-service.js';
import { Router } from 'express';

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

function createAntagonisticReviewTools() {
  const reviewGraph = createAntagonisticReviewerGraph();

  return [
    defineTool({
      name: 'reviewContent',
      description:
        'Review content using antagonistic review. Supports three modes: research (validates research findings), outline (reviews outline structure), full (comprehensive 8-dimension review)',
      parameters: z.object({
        mode: z
          .enum(['research', 'outline', 'full'])
          .describe('Review mode: research, outline, or full'),
        content: z.string().describe('Content to review'),
        researchFindings: z
          .string()
          .optional()
          .describe('Research context (only for research mode)'),
      }),
      execute: async (args) => {
        const smartModel = new ChatAnthropic({
          model: 'claude-3-5-sonnet-20241022',
          temperature: 0.7,
        });

        const result = await reviewGraph.invoke({
          mode: args.mode,
          content: args.content,
          researchFindings: args.researchFindings,
          smartModel,
        });

        if (result.error) {
          throw new Error(result.error);
        }

        return {
          verdict: result.result?.verdict,
          passed: result.result?.passed,
          percentage: result.result?.percentage,
          threshold: result.result?.threshold,
          dimensions: result.result?.dimensions,
          criticalIssues: result.result?.criticalIssues,
          recommendations: result.result?.recommendations,
        };
      },
    }),
  ];
}

// Workflow metadata interface
interface WorkflowMetadata {
  id: string;
  name: string;
  description: string;
  supportedModels: string[];
}

// Static workflow definitions
const WORKFLOW_METADATA: WorkflowMetadata[] = [
  {
    id: 'default',
    name: 'Ava',
    description: 'Board management and feature operations',
    supportedModels: ['haiku', 'sonnet', 'opus'],
  },
  {
    id: 'content-pipeline',
    name: 'Content Pipeline',
    description: 'Multi-stage content creation workflow',
    supportedModels: ['haiku', 'sonnet', 'opus'],
  },
  {
    id: 'antagonistic-review',
    name: 'Antagonistic Review',
    description: 'Rigorous quality review of content',
    supportedModels: ['haiku', 'sonnet', 'opus'],
  },
];

export function createCopilotKitEndpoint(deps: CopilotKitDependencies) {
  const avaTools = createAvaTools(deps);
  const reviewTools = createAntagonisticReviewTools();

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
    tools: avaTools as any,
    maxSteps: 5,
  });

  // Create the content-pipeline LangGraph flow
  // Compiled without HITL gates for autonomous operation
  const contentPipelineGraph = createContentCreationFlow({ enableHITL: false });

  const antagonisticReviewAgent = new BuiltInAgent({
    model: 'anthropic/claude-sonnet-4-5-20250929',
    prompt: [
      'You are the Antagonistic Review Agent for protoMaker.',
      'You perform rigorous quality reviews of content using a scoring rubric.',
      'You support three review modes: research (validates research findings), outline (reviews structure), and full (8-dimension comprehensive review).',
      'Use the reviewContent tool to perform reviews and provide honest, critical feedback.',
      'Be harsh but fair in your assessments.',
    ].join(' '),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: reviewTools as any,
    maxSteps: 3,
  });

  // CopilotKit v1.51 constructor types have a MaybePromise intersection bug
  // that rejects plain objects. The cast is safe — runtime accepts Record<string, Agent>.
  // Register all three agents: Ava (BuiltInAgent), content-pipeline (LangGraph),
  // and antagonistic-review (BuiltInAgent). AG-UI handles state streaming.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runtime = new CopilotRuntime({
    agents: {
      default: avaAgent,
      'content-pipeline': contentPipelineGraph,
      'antagonistic-review': antagonisticReviewAgent,
    } as any,
  });

  logger.info(
    `CopilotKit runtime initialized with 3 agents: Ava (${avaTools.length} tools), content-pipeline (LangGraph), Antagonistic Review (${reviewTools.length} tools)`
  );

  // Create router to combine CopilotKit endpoint and workflow metadata endpoint
  const router = Router();

  // GET /api/copilotkit/workflows - returns workflow metadata
  router.get('/workflows', (_req, res) => {
    res.json({ workflows: WORKFLOW_METADATA });
  });

  // Mount the CopilotKit runtime endpoint
  // Use @copilotkitnext/runtime's Express-native endpoint (proper Express Router)
  // instead of @copilotkit/runtime's Hono-based adapter which has path mismatch issues.
  // basePath '/' because Express strips the mount prefix (/api/copilotkit) from req.url.
  router.use('/', createCopilotEndpointExpress({ runtime, basePath: '/' }));

  return router;
}
