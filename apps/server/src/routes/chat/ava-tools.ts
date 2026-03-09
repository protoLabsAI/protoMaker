/**
 * Ava Tools - AI tool definitions for the Ava chat assistant
 *
 * Provides buildAvaTools() which constructs a set of Tool instances
 * gated by config flags. Tools are grouped into:
 *   - boardRead:     Read features from the project board
 *   - boardWrite:    Create/update/move/delete features on the board
 *   - agentControl:  List/start/stop agent sessions and retrieve output
 *   - autoMode:      Start/stop/query autonomous feature execution
 *   - projectMgmt:   Read/write .automaker/spec.md
 *   - orchestration: Dependency-based execution order management
 */

import type { Tool } from 'ai';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import type { EventEmitter, EventType } from '../../lib/events.js';
import type { NotesWorkspace, CanUseTool } from '@protolabsai/types';
import {
  getNotesWorkspacePath,
  ensureNotesDir,
  getAutomakerDir,
  secureFs,
} from '@protolabsai/platform';
import type { FeatureLoader } from '../../services/feature-loader.js';
import type { AutoModeService } from '../../services/auto-mode-service.js';
import type { LeadEngineerService } from '../../services/lead-engineer-service.js';
import type { AgentService } from '../../services/agent-service.js';
import type { SensorRegistryService } from '../../services/sensor-registry-service.js';
import type { RoleRegistryService } from '../../services/role-registry-service.js';
import type { AgentFactoryService, AgentConfig } from '../../services/agent-factory-service.js';
import type { DynamicAgentExecutor } from '../../services/dynamic-agent-executor.js';
import type { MetricsService } from '../../services/metrics-service.js';
import type { ProjectService } from '../../services/project-service.js';
import type { ProjectLifecycleService } from '../../services/project-lifecycle-service.js';
import type { SettingsService } from '../../services/settings-service.js';
import type { AvaChannelService } from '../../services/ava-channel-service.js';
import type { DiscordBotService } from '../../services/discord-bot-service.js';
import type { CalendarService } from '../../services/calendar-service.js';
import type { HealthMonitorService } from '../../services/health-monitor-service.js';
import type { ToolProgressEmitter } from './tool-progress.js';
import { buildProgressHooks } from '../../lib/agent-hooks.js';
import { githubMergeService } from '../../services/github-merge-service.js';
import { getPRWatcherService } from '../../services/pr-watcher-service.js';
import { getEventHistoryService } from '../../services/event-history-service.js';
import { getBriefingCursorService } from '../../services/briefing-cursor-service.js';

// ---------------------------------------------------------------------------
// Plan types
// ---------------------------------------------------------------------------

/** A single step within a PlanData card */
export interface PlanStep {
  id: string;
  title: string;
  status: 'pending' | 'running' | 'done' | 'error';
  detail?: string;
}

/** Structured plan data sent to the client as a data-plan stream chunk */
export interface PlanData {
  steps: PlanStep[];
  status: 'pending' | 'running' | 'done';
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AvaToolsServices {
  featureLoader: FeatureLoader;
  autoModeService: AutoModeService;
  leadEngineerService: LeadEngineerService;
  agentService: AgentService;
  /** Optional event emitter used for board-write change notifications */
  events?: EventEmitter;
  /** Optional sensor registry — required for get_presence_state tool */
  sensorRegistryService?: SensorRegistryService;
  /** Agent template registry — required for agentDelegation tools */
  roleRegistryService?: RoleRegistryService;
  /** Agent factory — required for agentDelegation tools */
  agentFactoryService?: AgentFactoryService;
  /** Dynamic agent executor — required for execute_dynamic_agent */
  dynamicAgentExecutor?: DynamicAgentExecutor;
  /** Metrics service — required for metrics tools */
  metricsService?: MetricsService;
  /** Settings service — used for global settings access */
  settingsService?: SettingsService;
  /** Project service — required for projects tools */
  projectService?: ProjectService;
  /** Project lifecycle service — required for project lifecycle tools */
  projectLifecycleService?: ProjectLifecycleService;
  /** Project PM service — optional, spawns PM agent on project launch */
  projectPMService?: {
    getOrCreateSession(
      projectPath: string,
      projectSlug: string
    ): { projectSlug: string; createdAt: string };
  };
  /** Tool progress emitter — optional, enables real-time progress labels in chat */
  toolProgressEmitter?: ToolProgressEmitter;
  /**
   * Permission callback for subagent tool execution (gated trust model).
   * When set, each tool call made by inner agents must be explicitly approved.
   * Undefined means full trust (bypassPermissions).
   */
  canUseTool?: CanUseTool;
  /** Ava channel service — optional, used for avaChannel tool group */
  avaChannelService?: AvaChannelService;
  /** Discord bot service — optional, used for discord tool group */
  discordBotService?: DiscordBotService;
  /** Calendar service — optional, used for calendar tool group */
  calendarService?: CalendarService;
  /** Health monitor service — optional, used for health tool group */
  healthMonitorService?: HealthMonitorService;
}

export interface AvaToolsConfig {
  /** Enable read-only board tools (get_board_summary, list_features, get_feature) */
  boardRead?: boolean;
  /** Enable write board tools (create_feature, update_feature, move_feature, delete_feature) */
  boardWrite?: boolean;
  /** Enable agent control tools (list_running_agents, start_agent, stop_agent, get_agent_output) */
  agentControl?: boolean;
  /** Enable auto-mode tools (get_auto_mode_status, start_auto_mode, stop_auto_mode) */
  autoMode?: boolean;
  /** Enable project management tools (get_project_spec, update_project_spec, update_project) */
  projectMgmt?: boolean;
  /** Enable orchestration tools (get_execution_order, set_feature_dependencies) */
  orchestration?: boolean;
  /** Enable agent delegation tools (execute_dynamic_agent, list_agent_templates) */
  agentDelegation?: boolean;
  /** Enable notes tools (list_note_tabs, read_note_tab, write_note_tab) */
  notes?: boolean;
  /** Enable metrics tools (get_project_metrics, get_capacity_metrics) */
  metrics?: boolean;
  /** Enable PR workflow tools (check_pr_status, get_pr_feedback, merge_pr) */
  prWorkflow?: boolean;
  /** Enable promotion tools (list_staging_candidates, promote_to_staging) */
  promotion?: boolean;
  /** Enable context file tools (list_context_files, get_context_file, create_context_file) */
  contextFiles?: boolean;
  /** Enable project orchestration tools (list_projects, get_project, create_project) */
  projects?: boolean;
  /** Enable briefing tools (get_briefing, get_board_summary_extended) */
  briefing?: boolean;
  /**
   * When true, register the get_presence_state tool in the boardRead group.
   * Only meaningful when the userPresenceDetection feature flag is enabled.
   */
  userPresenceDetection?: boolean;
  /** When true, all destructive tools skip HITL confirmation (needsApproval: false) */
  autoApproveTools?: boolean;
  /** Enable Ava channel tools (send to Ava Discord channel) */
  avaChannel?: boolean;
  /** Enable Discord tools (discord messaging) */
  discord?: boolean;
  /** Enable calendar tools (calendar events) */
  calendar?: boolean;
  /** Enable health tools (health monitoring) */
  health?: boolean;
  /** Enable settings tools (global settings access) */
  settings?: boolean;
}

// Re-use the same status literals that the Feature type exposes
const FEATURE_STATUS_ENUM = [
  'backlog',
  'in_progress',
  'review',
  'blocked',
  'done',
  'interrupted',
] as const;

// ---------------------------------------------------------------------------
// Internal helper - avoids fighting with tool() overload resolution in ai v6
// ---------------------------------------------------------------------------

/**
 * Constructs a Tool object compatible with ai v6's Tool type.
 * Uses 'inputSchema' (the ai v6 field name) rather than 'parameters' (ai v4/v5).
 * The double cast is intentional: ai v6 uses complex conditional types on INPUT/OUTPUT
 * generics that make direct assignment fragile without explicit type parameters.
 *
 * Supports `needsApproval` for the native AI SDK HITL flow and passes
 * `ToolExecutionOptions` (with `toolCallId`) as the second execute parameter.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeTool<TSchema extends z.ZodType<any>>(config: {
  description: string;
  inputSchema: TSchema;
  needsApproval?: boolean | ((input: z.infer<TSchema>) => boolean | Promise<boolean>);
  execute: (input: z.infer<TSchema>, options: { toolCallId: string }) => Promise<unknown>;
}): Tool {
  return config as unknown as Tool;
}

// ---------------------------------------------------------------------------
// Tool progress label formatting
// ---------------------------------------------------------------------------

const TOOL_LABEL_MAP: Record<string, string> = {
  Read: 'Reading file',
  Edit: 'Editing file',
  Write: 'Writing file',
  Bash: 'Running command',
  Grep: 'Searching code',
  Glob: 'Finding files',
  WebFetch: 'Fetching URL',
  WebSearch: 'Searching web',
};

/** Convert an inner-agent tool name to a human-readable progress label. */
function formatToolLabel(toolName: string): string {
  return TOOL_LABEL_MAP[toolName] ?? `Using ${toolName}`;
}

// ---------------------------------------------------------------------------
// buildAvaTools
// ---------------------------------------------------------------------------

/**
 * Build the set of Ava tools enabled by `config`.
 *
 * @param projectPath  Absolute path to the current project
 * @param services     Service singletons
 * @param config       Feature-flag object controlling which tool groups are active
 * @returns            Record of tool name → Tool, ready for use with streamText()
 */
export function buildAvaTools(
  projectPath: string,
  services: AvaToolsServices,
  config: AvaToolsConfig,
  avaMcpServers?: AgentConfig['mcpServers']
): Record<string, Tool> {
  const tools: Record<string, Tool> = {};

  // When autoApproveTools is true, destructive tools run without HITL confirmation.
  // Otherwise the AI SDK pauses execution and the client shows an approval card.
  const destructiveNeedsApproval = !config.autoApproveTools;

  // -----------------------------------------------------------------------
  // boardRead – read-only access to the feature board
  // -----------------------------------------------------------------------
  if (config.boardRead) {
    tools['get_board_summary'] = makeTool({
      description:
        'Get a summary of the project board, including total feature count and counts broken down by status.',
      inputSchema: z.object({}),
      execute: async () => {
        const features = await services.featureLoader.getAll(projectPath);
        const byStatus: Record<string, number> = {};
        for (const f of features) {
          const status = f.status ?? 'unknown';
          byStatus[status] = (byStatus[status] ?? 0) + 1;
        }
        return { total: features.length, byStatus };
      },
    });

    tools['list_features'] = makeTool({
      description:
        'List features on the project board. Optionally filter by status to see only features in a particular column.',
      inputSchema: z.object({
        status: z
          .enum(FEATURE_STATUS_ENUM)
          .optional()
          .describe('Filter results to this status column'),
      }),
      execute: async ({ status }) => {
        const features = await services.featureLoader.getAll(projectPath);
        const filtered = status ? features.filter((f) => f.status === status) : features;
        return filtered.map((f) => ({
          id: f.id,
          title: f.title,
          status: f.status,
          priority: f.priority,
          complexity: f.complexity,
          dependencies: f.dependencies ?? [],
        }));
      },
    });

    tools['get_feature'] = makeTool({
      description: 'Retrieve full details of a specific feature by its ID.',
      inputSchema: z.object({
        featureId: z.string().describe('The feature ID to look up'),
      }),
      execute: async ({ featureId }) => {
        const feature = await services.featureLoader.get(projectPath, featureId);
        if (!feature) {
          return { error: `Feature '${featureId}' not found` };
        }
        return feature;
      },
    });

    tools['create_plan'] = makeTool({
      description:
        'Create a structured plan card with titled steps. Use this to present a multi-step execution plan to the user as a visual card rather than plain text.',
      inputSchema: z.object({
        title: z.string().describe('Title of the plan'),
        steps: z
          .array(
            z.object({
              id: z.string().describe('Unique step identifier'),
              title: z.string().describe('Short step title'),
              status: z
                .enum(['pending', 'running', 'done', 'error'])
                .describe('Current status of the step'),
              detail: z.string().optional().describe('Optional detail or description for the step'),
            })
          )
          .describe('Ordered list of plan steps'),
      }),
      execute: async ({ title, steps }) => {
        const planData: PlanData = {
          steps,
          status: 'pending',
        };
        return { title, ...planData };
      },
    });

    // get_presence_state — only registered when userPresenceDetection flag is enabled
    if (config.userPresenceDetection && services.sensorRegistryService) {
      const sensorRegistry = services.sensorRegistryService;
      tools['get_presence_state'] = makeTool({
        description:
          'Return the current user presence state and the list of active sensors. ' +
          'Presence state is derived from the builtin:user-activity sensor and indicates ' +
          'whether the user is active, idle, afk, or headless (no browser connected).',
        inputSchema: z.object({}),
        execute: async () => {
          const userActivityEntry = sensorRegistry.get('builtin:user-activity');

          let presenceStatus: string;
          if (!userActivityEntry || userActivityEntry.state === 'offline') {
            presenceStatus = 'headless';
          } else {
            const status = userActivityEntry.reading?.data?.status as string | undefined;
            if (status === 'afk' || status === 'idle' || status === 'active') {
              presenceStatus = status;
            } else {
              presenceStatus = 'headless';
            }
          }

          const activeSensors = sensorRegistry
            .getAll()
            .filter((entry) => entry.state === 'active')
            .map((entry) => ({
              id: entry.sensor.id,
              name: entry.sensor.name,
              state: entry.state,
              lastSeenAt: entry.sensor.lastSeenAt,
            }));

          return { presenceStatus, activeSensors };
        },
      });
    }
  }

  // -----------------------------------------------------------------------
  // boardWrite – mutating operations on the feature board
  // -----------------------------------------------------------------------
  if (config.boardWrite) {
    tools['create_feature'] = makeTool({
      description: 'Create a new feature on the project board.',
      inputSchema: z.object({
        title: z.string().describe('Short title for the feature'),
        description: z
          .string()
          .optional()
          .describe('Detailed description of what needs to be done'),
        priority: z
          .number()
          .int()
          .min(0)
          .max(4)
          .optional()
          .describe('Priority level 0 (lowest) – 4 (highest)'),
        status: z
          .enum(FEATURE_STATUS_ENUM)
          .optional()
          .describe("Initial status column (defaults to 'backlog')"),
      }),
      execute: async ({ title, description, priority, status }) => {
        const feature = await services.featureLoader.create(projectPath, {
          title,
          description,
          // Cast needed: zod infers `number` but Feature.priority is a literal union
          priority: priority as 0 | 1 | 2 | 3 | 4 | undefined,
          status,
        });
        services.events?.broadcast('feature:created', { projectPath, feature });
        return feature;
      },
    });

    tools['update_feature'] = makeTool({
      description: 'Update one or more fields of an existing feature.',
      inputSchema: z.object({
        featureId: z.string().describe('The feature ID to update'),
        title: z.string().optional().describe('New title'),
        description: z.string().optional().describe('New description'),
        priority: z
          .number()
          .int()
          .min(0)
          .max(4)
          .optional()
          .describe('Priority level 0 (lowest) – 4 (highest)'),
        status: z.enum(FEATURE_STATUS_ENUM).optional().describe('New status'),
      }),
      execute: async ({ featureId, title, description, priority, status }) => {
        const updates: Record<string, unknown> = {};
        if (title !== undefined) updates['title'] = title;
        if (description !== undefined) updates['description'] = description;
        if (priority !== undefined) updates['priority'] = priority;
        if (status !== undefined) updates['status'] = status;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const feature = await services.featureLoader.update(projectPath, featureId, updates as any);
        services.events?.broadcast('feature:updated', { projectPath, feature });
        return feature;
      },
    });

    tools['move_feature'] = makeTool({
      description:
        "Move a feature to a different status column on the Kanban board (e.g. from 'backlog' to 'in_progress').",
      inputSchema: z.object({
        featureId: z.string().describe('The feature ID to move'),
        status: z.enum(FEATURE_STATUS_ENUM).describe('Target status column'),
      }),
      execute: async ({ featureId, status }) => {
        const feature = await services.featureLoader.update(projectPath, featureId, {
          status,
        });
        services.events?.emit('feature:status-changed' as EventType, {
          projectPath,
          featureId,
          oldStatus: undefined,
          newStatus: status,
          feature,
        });
        return { featureId, newStatus: feature.status };
      },
    });

    tools['delete_feature'] = makeTool({
      description: 'Permanently delete a feature from the project board.',
      inputSchema: z.object({
        featureId: z.string().describe('The feature ID to delete'),
      }),
      needsApproval: destructiveNeedsApproval,
      execute: async ({ featureId }) => {
        const success = await services.featureLoader.delete(projectPath, featureId);
        if (success) {
          services.events?.broadcast('feature:deleted', { projectPath, featureId });
        }
        return { success, featureId };
      },
    });
  }

  // -----------------------------------------------------------------------
  // agentControl – manage running feature agents and retrieve their output
  // -----------------------------------------------------------------------
  if (config.agentControl) {
    tools['list_running_agents'] = makeTool({
      description:
        'List all running feature agents across all projects. Returns featureId, title, model, startTime, branchName, and cost.',
      inputSchema: z.object({}),
      execute: async () => {
        const agents = await services.autoModeService.getRunningAgents();
        return agents;
      },
    });

    tools['start_agent'] = makeTool({
      description:
        'Start an agent to work on a feature. The agent runs in an isolated git worktree.',
      inputSchema: z.object({
        featureId: z.string().describe('The feature ID to start an agent on'),
      }),
      needsApproval: destructiveNeedsApproval,
      execute: async ({ featureId }) => {
        // Fire-and-forget — don't block the chat on agent execution
        services.leadEngineerService.process(projectPath, featureId).catch(() => {});
        return {
          success: true,
          featureId,
          message:
            'Agent started. Use get_agent_output or list_running_agents to monitor progress.',
        };
      },
    });

    tools['stop_agent'] = makeTool({
      description: 'Stop a running feature agent by its feature ID.',
      inputSchema: z.object({
        featureId: z.string().describe('The feature ID of the running agent to stop'),
      }),
      needsApproval: destructiveNeedsApproval,
      execute: async ({ featureId }) => {
        const stopped = await services.autoModeService.stopFeature(featureId);
        return { success: stopped, featureId };
      },
    });

    tools['get_agent_output'] = makeTool({
      description: 'Retrieve the saved agent output log for a given feature.',
      inputSchema: z.object({
        featureId: z.string().describe('Feature ID whose agent output should be retrieved'),
      }),
      execute: async ({ featureId }) => {
        const output = await services.featureLoader.getAgentOutput(projectPath, featureId);
        return { featureId, output };
      },
    });

    tools['send_message_to_agent'] = makeTool({
      description:
        'Send a follow-up message or instruction to the agent working on a feature. The agent will process the message in the context of its current worktree.',
      inputSchema: z.object({
        featureId: z.string().describe('The feature ID of the agent to message'),
        message: z.string().describe('The message or instruction to send to the agent'),
      }),
      execute: async ({ featureId, message }) => {
        try {
          await services.autoModeService.followUpFeature(
            projectPath,
            featureId,
            message,
            undefined,
            true
          );
          return { success: true, featureId, message: 'Message sent to agent.' };
        } catch (err) {
          return {
            error: `Failed to send message: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      },
    });
  }

  // -----------------------------------------------------------------------
  // autoMode – autonomous feature-execution loop management
  // -----------------------------------------------------------------------
  if (config.autoMode) {
    tools['get_auto_mode_status'] = makeTool({
      description: 'Get the current auto-mode status for this project.',
      inputSchema: z.object({}),
      execute: async () => {
        return services.autoModeService.getStatusForProject(projectPath);
      },
    });

    tools['start_auto_mode'] = makeTool({
      description:
        'Start the auto-mode loop so Ava will automatically pick up and execute backlog features.',
      inputSchema: z.object({
        maxConcurrency: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe('Maximum number of features to execute in parallel'),
        branchName: z
          .string()
          .optional()
          .describe('Restrict auto-mode to features belonging to this branch'),
      }),
      // Require confirmation only when running more than one worker in parallel
      needsApproval: destructiveNeedsApproval
        ? ({ maxConcurrency }) => (maxConcurrency ?? 1) > 1
        : false,
      execute: async ({ maxConcurrency, branchName }) => {
        const count = await services.autoModeService.startAutoLoopForProject(
          projectPath,
          branchName ?? null,
          maxConcurrency
        );
        return { startedFeatureCount: count };
      },
    });

    tools['stop_auto_mode'] = makeTool({
      description: 'Stop the auto-mode loop for this project.',
      inputSchema: z.object({
        branchName: z
          .string()
          .optional()
          .describe('Stop only the loop associated with this branch'),
      }),
      execute: async ({ branchName }) => {
        const count = await services.autoModeService.stopAutoLoopForProject(
          projectPath,
          branchName ?? null
        );
        return { stoppedFeatureCount: count };
      },
    });
  }

  // -----------------------------------------------------------------------
  // projectMgmt – read/write .automaker/spec.md
  // -----------------------------------------------------------------------
  if (config.projectMgmt) {
    tools['get_project_spec'] = makeTool({
      description: 'Read the project specification document from .automaker/spec.md.',
      inputSchema: z.object({}),
      execute: async () => {
        const specPath = path.join(projectPath, '.automaker', 'spec.md');
        try {
          const content = await fs.readFile(specPath, 'utf-8');
          return { content, path: specPath };
        } catch {
          return { content: null, path: specPath, error: 'spec.md not found' };
        }
      },
    });

    tools['update_project_spec'] = makeTool({
      description:
        'Write new content to the project specification document at .automaker/spec.md. Creates the file if it does not exist.',
      inputSchema: z.object({
        content: z.string().describe('Markdown content to write to spec.md'),
      }),
      needsApproval: destructiveNeedsApproval,
      execute: async ({ content }) => {
        const specDir = path.join(projectPath, '.automaker');
        const specPath = path.join(specDir, 'spec.md');
        await fs.mkdir(specDir, { recursive: true });
        await fs.writeFile(specPath, content, 'utf-8');
        return { success: true, path: specPath };
      },
    });

    tools['update_project'] = makeTool({
      description:
        'Update a project plan. Can update title, goal, or status (e.g. mark as completed).',
      inputSchema: z.object({
        projectSlug: z.string().describe('The project slug to update'),
        title: z.string().optional().describe('New title (optional)'),
        goal: z.string().optional().describe('New goal (optional)'),
        status: z
          .enum([
            'ongoing',
            'researching',
            'drafting',
            'reviewing',
            'approved',
            'scaffolded',
            'active',
            'completed',
          ])
          .optional()
          .describe('New status (optional)'),
      }),
      execute: async ({ projectSlug, title, goal, status }) => {
        if (!services.projectService) {
          return { error: 'Project service not available' };
        }
        const updated = await services.projectService.updateProject(projectPath, projectSlug, {
          ...(title !== undefined && { title }),
          ...(goal !== undefined && { goal }),
          ...(status !== undefined && { status }),
        });
        if (!updated) {
          return { error: `Project "${projectSlug}" not found` };
        }
        return {
          slug: updated.slug,
          title: updated.title,
          goal: updated.goal,
          status: updated.status,
        };
      },
    });
  }

  // -----------------------------------------------------------------------
  // orchestration – dependency-aware execution order
  // -----------------------------------------------------------------------
  if (config.orchestration) {
    tools['get_execution_order'] = makeTool({
      description:
        'Return the recommended execution order for all features, resolved from their dependency graph (topological sort).',
      inputSchema: z.object({}),
      execute: async () => {
        const features = await services.featureLoader.getAll(projectPath);
        const ordered = topologicalSort(features);
        return ordered.map((f) => ({
          id: f.id,
          title: f.title,
          status: f.status,
          dependencies: f.dependencies ?? [],
        }));
      },
    });

    tools['set_feature_dependencies'] = makeTool({
      description: 'Set the list of feature IDs that a feature depends on.',
      inputSchema: z.object({
        featureId: z.string().describe('The feature whose dependencies should be updated'),
        dependencies: z
          .array(z.string())
          .describe('Array of feature IDs that must be completed before this feature can start'),
      }),
      execute: async ({ featureId, dependencies }) => {
        const feature = await services.featureLoader.update(projectPath, featureId, {
          dependencies,
        });
        return { featureId, dependencies: feature.dependencies ?? [] };
      },
    });
  }

  // -----------------------------------------------------------------------
  // agentDelegation – delegate work to dynamic agents
  // -----------------------------------------------------------------------
  if (config.agentDelegation) {
    tools['list_agent_templates'] = makeTool({
      description: 'List all registered agent templates (roles) available for delegation.',
      inputSchema: z.object({}),
      execute: async () => {
        if (!services.roleRegistryService) {
          return { error: 'Role registry service not available' };
        }
        const templates = services.roleRegistryService.list();
        return templates.map((t) => ({
          name: t.name,
          role: t.role,
          description: t.description,
          model: t.model,
        }));
      },
    });

    tools['execute_dynamic_agent'] = makeTool({
      description:
        'Execute a dynamic agent with a specific role and prompt. The agent runs in the project worktree and returns its output. Use for delegating specialized tasks to domain-expert agents.',
      inputSchema: z.object({
        role: z
          .string()
          .describe('Agent role/template name. Use list_agent_templates to see available roles.'),
        prompt: z.string().describe('Task prompt for the agent'),
        model: z
          .string()
          .optional()
          .describe('Model override (haiku, sonnet, opus). Defaults to template setting.'),
      }),
      execute: async ({ role, prompt, model }, { toolCallId }) => {
        if (
          !services.roleRegistryService ||
          !services.agentFactoryService ||
          !services.dynamicAgentExecutor
        ) {
          return { error: 'Agent delegation services not available' };
        }
        const template = services.roleRegistryService.resolve(role);
        if (!template) {
          return { error: `No agent template found for role "${role}"` };
        }
        const agentConfig = services.agentFactoryService.createFromTemplate(
          template.name,
          projectPath,
          model ? { model: model as 'haiku' | 'sonnet' | 'opus' } : undefined
        );

        // Wire tool progress emitter — stream inner-agent activity to the chat UI
        const emitter = services.toolProgressEmitter;
        const agentLabel = role;

        // Build PostToolUse progress hooks to replace manual onToolUse progress emission.
        // The hook fires natively after each tool execution; onText remains for text generation.
        const progressHooks =
          emitter && toolCallId
            ? { PostToolUse: buildProgressHooks({ emitter, toolCallId, agentLabel }) }
            : undefined;

        const result = await services.dynamicAgentExecutor.execute(agentConfig, {
          prompt,
          hooks: progressHooks,
          ...(avaMcpServers && avaMcpServers.length > 0 && { mcpServers: avaMcpServers }),
          ...(emitter &&
            toolCallId && {
              onText: () => {
                emitter.emitProgress(toolCallId, `${agentLabel} -- Composing response`);
              },
            }),
          // Gated trust: pass canUseTool callback so inner agent tool calls require approval
          ...(services.canUseTool && { canUseTool: services.canUseTool }),
        });

        // Cleanup rate-limit tracking
        if (emitter && toolCallId) emitter.clear(toolCallId);

        return {
          success: result.success,
          output: result.output,
          error: result.error,
          durationMs: result.durationMs,
          templateName: result.templateName,
          model: result.model,
        };
      },
    });
  }

  // -----------------------------------------------------------------------
  // notes – read/write project notes workspace
  // -----------------------------------------------------------------------
  if (config.notes) {
    tools['list_note_tabs'] = makeTool({
      description:
        'List all note tabs in the project notes workspace. Returns tab names, IDs, and metadata.',
      inputSchema: z.object({}),
      execute: async () => {
        const wsPath = getNotesWorkspacePath(projectPath);
        try {
          const raw = await secureFs.readFile(wsPath, 'utf-8');
          const workspace = JSON.parse(raw as string) as NotesWorkspace;
          const tabs = workspace.tabOrder.map((id) => {
            const tab = workspace.tabs[id];
            return tab
              ? { id: tab.id, name: tab.name, wordCount: tab.metadata?.wordCount ?? 0 }
              : { id, name: '(unknown)', wordCount: 0 };
          });
          return { tabs, activeTabId: workspace.activeTabId };
        } catch {
          return { tabs: [], activeTabId: null };
        }
      },
    });

    tools['read_note_tab'] = makeTool({
      description: 'Read the content of a specific note tab by its ID or name.',
      inputSchema: z.object({
        tabId: z.string().optional().describe('Tab ID to read'),
        name: z.string().optional().describe('Tab name to search for (case-insensitive)'),
      }),
      execute: async ({ tabId, name }) => {
        const wsPath = getNotesWorkspacePath(projectPath);
        try {
          const raw = await secureFs.readFile(wsPath, 'utf-8');
          const workspace = JSON.parse(raw as string) as NotesWorkspace;
          let tab;
          if (tabId) {
            tab = workspace.tabs[tabId];
          } else if (name) {
            tab = Object.values(workspace.tabs).find(
              (t) => t.name.toLowerCase() === name.toLowerCase()
            );
          }
          if (!tab) return { error: 'Tab not found' };
          return { id: tab.id, name: tab.name, content: tab.content, metadata: tab.metadata };
        } catch {
          return { error: 'Notes workspace not found' };
        }
      },
    });

    tools['write_note_tab'] = makeTool({
      description:
        'Write content to a note tab. Creates the tab if it does not exist. Content is HTML (Tiptap format).',
      inputSchema: z.object({
        tabId: z.string().optional().describe('Tab ID to write to (omit to create a new tab)'),
        name: z.string().optional().describe('Tab name (required when creating a new tab)'),
        content: z.string().describe('HTML content to write'),
      }),
      execute: async ({ tabId, name, content }) => {
        await ensureNotesDir(projectPath);
        const wsPath = getNotesWorkspacePath(projectPath);
        let workspace: NotesWorkspace;
        try {
          const raw = await secureFs.readFile(wsPath, 'utf-8');
          workspace = JSON.parse(raw as string) as NotesWorkspace;
        } catch {
          const defaultId = crypto.randomUUID();
          workspace = {
            version: 1,
            workspaceVersion: 0,
            activeTabId: defaultId,
            tabOrder: [defaultId],
            tabs: {
              [defaultId]: {
                id: defaultId,
                name: 'Notes',
                content: '',
                permissions: { agentRead: true, agentWrite: true },
                metadata: { createdAt: Date.now(), updatedAt: Date.now() },
              },
            },
          };
        }

        const now = Date.now();
        if (tabId && workspace.tabs[tabId]) {
          workspace.tabs[tabId].content = content;
          workspace.tabs[tabId].metadata.updatedAt = now;
          workspace.tabs[tabId].metadata.wordCount = content.split(/\s+/).length;
        } else {
          const newId = tabId ?? crypto.randomUUID();
          workspace.tabs[newId] = {
            id: newId,
            name: name ?? 'Untitled',
            content,
            permissions: { agentRead: true, agentWrite: true },
            metadata: { createdAt: now, updatedAt: now, wordCount: content.split(/\s+/).length },
          };
          workspace.tabOrder.push(newId);
        }
        workspace.workspaceVersion = (workspace.workspaceVersion ?? 0) + 1;
        await secureFs.writeFile(wsPath, JSON.stringify(workspace, null, 2), 'utf-8');
        return { success: true, tabId: tabId ?? workspace.tabOrder[workspace.tabOrder.length - 1] };
      },
    });

    tools['create_note_tab'] = makeTool({
      description: 'Create a new empty note tab in the project notes workspace.',
      inputSchema: z.object({
        name: z.string().describe('Name for the new note tab'),
      }),
      execute: async ({ name }) => {
        await ensureNotesDir(projectPath);
        const wsPath = getNotesWorkspacePath(projectPath);
        let workspace: NotesWorkspace;
        try {
          const raw = await secureFs.readFile(wsPath, 'utf-8');
          workspace = JSON.parse(raw as string) as NotesWorkspace;
        } catch {
          const defaultId = crypto.randomUUID();
          workspace = {
            version: 1,
            workspaceVersion: 0,
            activeTabId: defaultId,
            tabOrder: [defaultId],
            tabs: {
              [defaultId]: {
                id: defaultId,
                name: 'Notes',
                content: '',
                permissions: { agentRead: true, agentWrite: true },
                metadata: { createdAt: Date.now(), updatedAt: Date.now() },
              },
            },
          };
        }
        const newId = crypto.randomUUID();
        const now = Date.now();
        workspace.tabs[newId] = {
          id: newId,
          name,
          content: '',
          permissions: { agentRead: true, agentWrite: true },
          metadata: { createdAt: now, updatedAt: now },
        };
        workspace.tabOrder.push(newId);
        workspace.workspaceVersion = (workspace.workspaceVersion ?? 0) + 1;
        await secureFs.writeFile(wsPath, JSON.stringify(workspace, null, 2), 'utf-8');
        return { success: true, tabId: newId, name };
      },
    });

    tools['delete_note_tab'] = makeTool({
      description: 'Delete a note tab from the project notes workspace by its ID.',
      inputSchema: z.object({
        tabId: z.string().describe('ID of the tab to delete'),
      }),
      needsApproval: destructiveNeedsApproval,
      execute: async ({ tabId }) => {
        const wsPath = getNotesWorkspacePath(projectPath);
        try {
          const raw = await secureFs.readFile(wsPath, 'utf-8');
          const workspace = JSON.parse(raw as string) as NotesWorkspace;
          if (!workspace.tabs[tabId]) {
            return { error: `Tab '${tabId}' not found` };
          }
          delete workspace.tabs[tabId];
          workspace.tabOrder = workspace.tabOrder.filter((id) => id !== tabId);
          if (workspace.activeTabId === tabId) {
            workspace.activeTabId = workspace.tabOrder[0] ?? null;
          }
          workspace.workspaceVersion = (workspace.workspaceVersion ?? 0) + 1;
          await secureFs.writeFile(wsPath, JSON.stringify(workspace, null, 2), 'utf-8');
          return { success: true, tabId };
        } catch {
          return { error: 'Notes workspace not found' };
        }
      },
    });

    tools['rename_note_tab'] = makeTool({
      description: 'Rename a note tab in the project notes workspace.',
      inputSchema: z.object({
        tabId: z.string().describe('ID of the tab to rename'),
        name: z.string().describe('New name for the tab'),
      }),
      execute: async ({ tabId, name }) => {
        const wsPath = getNotesWorkspacePath(projectPath);
        try {
          const raw = await secureFs.readFile(wsPath, 'utf-8');
          const workspace = JSON.parse(raw as string) as NotesWorkspace;
          if (!workspace.tabs[tabId]) {
            return { error: `Tab '${tabId}' not found` };
          }
          workspace.tabs[tabId].name = name;
          workspace.tabs[tabId].metadata.updatedAt = Date.now();
          workspace.workspaceVersion = (workspace.workspaceVersion ?? 0) + 1;
          await secureFs.writeFile(wsPath, JSON.stringify(workspace, null, 2), 'utf-8');
          return { success: true, tabId, name };
        } catch {
          return { error: 'Notes workspace not found' };
        }
      },
    });
  }

  // -----------------------------------------------------------------------
  // metrics – project and capacity metrics
  // -----------------------------------------------------------------------
  if (config.metrics) {
    tools['get_project_metrics'] = makeTool({
      description:
        'Get project metrics including cycle time, cost, success rate, throughput, and token usage.',
      inputSchema: z.object({}),
      execute: async () => {
        if (!services.metricsService) {
          return { error: 'Metrics service not available' };
        }
        return services.metricsService.getProjectMetrics(projectPath);
      },
    });

    tools['get_capacity_metrics'] = makeTool({
      description:
        'Get capacity metrics including concurrency, backlog size, utilization, and estimated completion time.',
      inputSchema: z.object({
        maxConcurrency: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe('Max concurrent agents to calculate utilization against (default: 3)'),
      }),
      execute: async ({ maxConcurrency }) => {
        if (!services.metricsService) {
          return { error: 'Metrics service not available' };
        }
        return services.metricsService.getCapacityMetrics(projectPath, maxConcurrency);
      },
    });
  }

  // -----------------------------------------------------------------------
  // prWorkflow – PR status, feedback, and merging
  // -----------------------------------------------------------------------
  if (config.prWorkflow) {
    tools['check_pr_status'] = makeTool({
      description:
        'Check the CI/check status of a pull request. Returns passed, failed, and pending check counts.',
      inputSchema: z.object({
        prNumber: z.number().int().describe('PR number to check'),
      }),
      execute: async ({ prNumber }) => {
        return githubMergeService.checkPRStatus(projectPath, prNumber);
      },
    });

    tools['watch_pr'] = makeTool({
      description:
        'Register a PR for background CI monitoring. Returns immediately. When all checks pass or any check fails, a push notification is injected into this chat session — no polling needed.',
      inputSchema: z.object({
        prNumber: z.number().int().describe('PR number to watch'),
      }),
      execute: async ({ prNumber }) => {
        const watcher = getPRWatcherService();
        if (!watcher) {
          return { error: 'PR watcher service unavailable' };
        }
        watcher.addWatch(prNumber, projectPath);
        return { watching: true, prNumber };
      },
    });

    tools['merge_pr'] = makeTool({
      description:
        'Merge a pull request. Supports merge, squash, and rebase strategies. Can wait for CI checks.',
      inputSchema: z.object({
        prNumber: z.number().int().describe('PR number to merge'),
        strategy: z
          .enum(['merge', 'squash', 'rebase'])
          .optional()
          .describe("Merge strategy (default: 'squash')"),
        waitForCI: z
          .boolean()
          .optional()
          .describe('Wait for CI checks to pass before merging (default: true)'),
      }),
      needsApproval: destructiveNeedsApproval,
      execute: async ({ prNumber, strategy, waitForCI }) => {
        return githubMergeService.mergePR(
          projectPath,
          prNumber,
          strategy ?? 'squash',
          waitForCI ?? true
        );
      },
    });

    tools['get_pr_feedback'] = makeTool({
      description:
        'Get review feedback for a PR including CodeRabbit comments and review thread summaries.',
      inputSchema: z.object({
        prNumber: z.number().int().describe('PR number to get feedback for'),
      }),
      execute: async ({ prNumber }) => {
        try {
          const { exec: execCb } = await import('child_process');
          const { promisify } = await import('util');
          const execP = promisify(execCb);
          const { stdout } = await execP(
            `gh pr view ${prNumber} --json number,url,state,reviewDecision,reviews,statusCheckRollup,headRefName`,
            { cwd: projectPath }
          );
          const prData = JSON.parse(stdout);
          return {
            prNumber: prData.number,
            url: prData.url,
            state: prData.state,
            reviewDecision: prData.reviewDecision,
            branch: prData.headRefName,
            reviews: (prData.reviews ?? []).map(
              (r: { author: { login: string }; state: string; body: string }) => ({
                author: r.author?.login,
                state: r.state,
                body: r.body?.slice(0, 500),
              })
            ),
            checks: (prData.statusCheckRollup ?? []).map(
              (c: { name: string; status: string; conclusion: string }) => ({
                name: c.name,
                status: c.status,
                conclusion: c.conclusion,
              })
            ),
          };
        } catch (err) {
          return {
            error: `Failed to fetch PR feedback: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      },
    });

    tools['resolve_pr_threads'] = makeTool({
      description:
        'Resolve all unresolved CodeRabbit review threads for a PR. Optionally filter by minimum severity to only resolve threads at or above a given severity level.',
      inputSchema: z.object({
        prNumber: z.number().int().describe('PR number whose review threads should be resolved'),
        minSeverity: z
          .enum(['low', 'medium', 'high'])
          .optional()
          .describe(
            "Minimum severity threshold — only resolve threads at or above this level (default: 'low')"
          ),
      }),
      execute: async ({ prNumber, minSeverity }) => {
        try {
          const port = parseInt(process.env.PORT || '3008', 10);
          const response = await fetch(`http://localhost:${port}/api/github/resolve-pr-threads`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectPath, prNumber, minSeverity: minSeverity ?? 'low' }),
          });
          const data = (await response.json()) as Record<string, unknown>;
          return data;
        } catch (err) {
          return {
            error: `Failed to resolve PR threads: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      },
    });
  }

  // -----------------------------------------------------------------------
  // promotion – staging candidate listing and promotion
  // -----------------------------------------------------------------------
  if (config.promotion) {
    tools['list_staging_candidates'] = makeTool({
      description:
        'List commits on dev that have not been merged into staging. These are candidates for promotion.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const { exec: execCb } = await import('child_process');
          const { promisify } = await import('util');
          const execP = promisify(execCb);
          // Fetch latest remote state
          await execP('git fetch origin dev staging', { cwd: projectPath }).catch(() => {});
          const { stdout } = await execP(
            'git log origin/staging..origin/dev --oneline --no-merges --format="%h %s"',
            { cwd: projectPath }
          );
          const commits = stdout
            .trim()
            .split('\n')
            .filter(Boolean)
            .map((line) => {
              const [hash, ...rest] = line.split(' ');
              return { hash, message: rest.join(' ') };
            });
          return { count: commits.length, commits };
        } catch (err) {
          return {
            error: `Failed to list staging candidates: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      },
    });

    tools['promote_to_staging'] = makeTool({
      description:
        'Promote dev to staging by creating a merge PR from dev into staging. Requires user confirmation.',
      inputSchema: z.object({}),
      needsApproval: destructiveNeedsApproval,
      execute: async () => {
        try {
          const { exec: execCb } = await import('child_process');
          const { promisify } = await import('util');
          const execP = promisify(execCb);
          const { stdout } = await execP(
            'gh pr create --base staging --head dev --title "chore: promote dev to staging" --body "Automated promotion from dev to staging" --no-maintainer-edit',
            { cwd: projectPath }
          );
          return { success: true, prUrl: stdout.trim() };
        } catch (err) {
          return {
            error: `Failed to create promotion PR: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      },
    });
  }

  // -----------------------------------------------------------------------
  // contextFiles – read/write .automaker/context/ files
  // -----------------------------------------------------------------------
  if (config.contextFiles) {
    tools['list_context_files'] = makeTool({
      description:
        'List all context files in .automaker/context/. These files are injected into agent prompts.',
      inputSchema: z.object({}),
      execute: async () => {
        const contextDir = path.join(getAutomakerDir(projectPath), 'context');
        try {
          const entries = await fs.readdir(contextDir);
          const files = entries.filter((e) => e.endsWith('.md'));
          return { files, directory: contextDir };
        } catch {
          return { files: [], directory: contextDir };
        }
      },
    });

    tools['get_context_file'] = makeTool({
      description: 'Read the content of a specific context file from .automaker/context/.',
      inputSchema: z.object({
        filename: z.string().describe('Filename to read (e.g. "CLAUDE.md", "pr-ownership.md")'),
      }),
      execute: async ({ filename }) => {
        const filePath = path.join(getAutomakerDir(projectPath), 'context', filename);
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          return { filename, content, path: filePath };
        } catch {
          return { error: `Context file "${filename}" not found` };
        }
      },
    });

    tools['create_context_file'] = makeTool({
      description:
        'Create or overwrite a context file in .automaker/context/. Content will be injected into agent prompts.',
      inputSchema: z.object({
        filename: z.string().describe('Filename (e.g. "coding-standards.md")'),
        content: z.string().describe('Markdown content for the context file'),
      }),
      execute: async ({ filename, content }) => {
        const contextDir = path.join(getAutomakerDir(projectPath), 'context');
        await fs.mkdir(contextDir, { recursive: true });
        const filePath = path.join(contextDir, filename);
        await fs.writeFile(filePath, content, 'utf-8');
        return { success: true, filename, path: filePath };
      },
    });
  }

  // -----------------------------------------------------------------------
  // projects – project orchestration
  // -----------------------------------------------------------------------
  if (config.projects) {
    tools['list_projects'] = makeTool({
      description: 'List all project plans in this workspace.',
      inputSchema: z.object({}),
      execute: async () => {
        if (!services.projectService) {
          return { error: 'Project service not available' };
        }
        const slugs = await services.projectService.listProjects(projectPath);
        const projects = [];
        for (const slug of slugs) {
          const project = await services.projectService.getProject(projectPath, slug);
          if (project) {
            projects.push({
              slug,
              title: project.title,
              status: project.status,
              goal: project.goal,
            });
          }
        }
        return { projects };
      },
    });

    tools['get_project'] = makeTool({
      description: 'Get full details of a specific project plan by its slug.',
      inputSchema: z.object({
        slug: z.string().describe('Project slug identifier'),
      }),
      execute: async ({ slug }) => {
        if (!services.projectService) {
          return { error: 'Project service not available' };
        }
        const project = await services.projectService.getProject(projectPath, slug);
        if (!project) {
          return { error: `Project "${slug}" not found` };
        }
        return project;
      },
    });

    tools['create_project'] = makeTool({
      description:
        'Create a new project plan. Provide a title, goal, and optionally a SPARC PRD and milestones.',
      inputSchema: z.object({
        title: z.string().describe('Project title'),
        goal: z.string().describe('High-level goal or objective'),
        slug: z
          .string()
          .optional()
          .describe('URL-friendly slug (auto-generated from title if omitted)'),
      }),
      execute: async ({ title, goal, slug }) => {
        if (!services.projectService) {
          return { error: 'Project service not available' };
        }
        const finalSlug =
          slug ??
          title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
        const project = await services.projectService.createProject(projectPath, {
          title,
          goal,
          slug: finalSlug,
        });
        return { slug: project.slug, title: project.title, status: project.status };
      },
    });

    tools['create_project_plan'] = makeTool({
      description:
        'Initiate a new project by creating a local project entry. ' +
        'Performs a duplicate check before creating. Returns the project slug.',
      inputSchema: z.object({
        title: z.string().describe('Project title'),
        description: z.string().describe('Project idea description or goals'),
      }),
      execute: async ({ title, description }) => {
        if (!services.projectLifecycleService) {
          return { error: 'Project lifecycle service not available' };
        }
        const result = await services.projectLifecycleService.initiate(
          projectPath,
          title,
          description
        );
        return result;
      },
    });

    tools['approve_project'] = makeTool({
      description:
        'Approve the PRD for a project: creates board features and epics from the project milestones. ' +
        'Returns the number of features created.',
      inputSchema: z.object({
        projectSlug: z.string().describe('Project slug to approve'),
        createEpics: z
          .boolean()
          .optional()
          .describe('Whether to create epic features (default: true)'),
        setupDependencies: z
          .boolean()
          .optional()
          .describe('Whether to wire feature dependencies (default: true)'),
      }),
      needsApproval: destructiveNeedsApproval,
      execute: async ({ projectSlug, createEpics, setupDependencies }) => {
        if (!services.projectLifecycleService) {
          return { error: 'Project lifecycle service not available' };
        }
        const result = await services.projectLifecycleService.approvePrd(projectPath, projectSlug, {
          createEpics,
          setupDependencies,
        });
        return result;
      },
    });

    tools['launch_project'] = makeTool({
      description:
        'Launch a project: starts auto-mode to begin executing backlog features and optionally spawns a PM agent session. ' +
        'Requires the PRD to be approved and features to be in backlog first.',
      inputSchema: z.object({
        projectSlug: z.string().describe('Project slug to launch'),
        maxConcurrency: z
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .describe('Maximum number of concurrent agents (default: 2)'),
      }),
      needsApproval: destructiveNeedsApproval,
      execute: async ({ projectSlug, maxConcurrency }) => {
        if (!services.projectLifecycleService) {
          return { error: 'Project lifecycle service not available' };
        }
        const launchResult = await services.projectLifecycleService.launch(
          projectPath,
          projectSlug,
          maxConcurrency
        );

        let pmSession: { projectSlug: string; createdAt: string } | null = null;
        if (services.projectPMService) {
          try {
            const session = services.projectPMService.getOrCreateSession(projectPath, projectSlug);
            pmSession = { projectSlug: session.projectSlug, createdAt: session.createdAt };
          } catch {
            // PM session creation is best-effort
          }
        }

        return {
          ...launchResult,
          pmSession,
        };
      },
    });

    tools['get_project_lifecycle_status'] = makeTool({
      description:
        'Get the current lifecycle phase and next actions for a project. ' +
        'Returns phase (idea, prd-approved, started, completed), board summary, and suggested next steps.',
      inputSchema: z.object({
        projectSlug: z.string().describe('Project slug to check'),
      }),
      execute: async ({ projectSlug }) => {
        if (!services.projectLifecycleService) {
          return { error: 'Project lifecycle service not available' };
        }
        const status = await services.projectLifecycleService.getStatus(projectPath, projectSlug);
        return status;
      },
    });
  }

  // -----------------------------------------------------------------------
  // briefing – daily briefing and extended board summary
  // -----------------------------------------------------------------------
  if (config.briefing) {
    tools['get_briefing'] = makeTool({
      description:
        'Get a briefing digest of recent events grouped by severity. Shows what happened since the last briefing acknowledgement.',
      inputSchema: z.object({
        timeRange: z
          .enum(['1h', '6h', '24h', '7d'])
          .optional()
          .describe("Time range to look back (default: '24h')"),
      }),
      execute: async ({ timeRange }) => {
        const eventHistoryService = getEventHistoryService();
        const briefingCursorService = getBriefingCursorService();
        const since = await briefingCursorService.getCursor(projectPath);
        const sinceDate =
          since ?? new Date(Date.now() - getTimeRangeMs(timeRange ?? '24h')).toISOString();

        // Use summaries to avoid loading all full events
        const summaries = await eventHistoryService.getEvents(projectPath, { since: sinceDate });

        // Group summaries by severity
        const criticalHighIds: string[] = [];
        const mediumLowCounts: Record<string, Record<string, number>> = {
          medium: {},
          low: {},
        };
        const summaryBySeverity: Record<string, number> = {};

        for (const s of summaries) {
          const severity = s.severity ?? 'low';
          summaryBySeverity[severity] = (summaryBySeverity[severity] ?? 0) + 1;
          if (severity === 'critical' || severity === 'high') {
            criticalHighIds.push(s.id);
          } else {
            const bucket = severity === 'medium' ? 'medium' : 'low';
            mediumLowCounts[bucket][s.trigger] = (mediumLowCounts[bucket][s.trigger] ?? 0) + 1;
          }
        }

        // Only load full events for critical/high (need error details)
        const fullEvents = await Promise.all(
          criticalHighIds.map((id) => eventHistoryService.getEvent(projectPath, id))
        );

        const importantSignals: Record<string, unknown[]> = { critical: [], high: [] };
        for (const e of fullEvents) {
          if (!e) continue;
          const severity = e.severity ?? 'low';
          if (!importantSignals[severity]) importantSignals[severity] = [];
          importantSignals[severity].push({
            trigger: e.trigger,
            featureName: e.featureName,
            featureId: e.featureId,
            error: e.error,
            timestamp: e.timestamp,
          });
        }

        // Update cursor to now
        await briefingCursorService.setCursor(projectPath, new Date().toISOString());

        return {
          since: sinceDate,
          totalEvents: summaries.length,
          summary: summaryBySeverity,
          signals: {
            ...importantSignals,
            ...mediumLowCounts,
          },
        };
      },
    });

    tools['get_board_summary_extended'] = makeTool({
      description:
        'Get an extended board summary with feature details, recent activity, and health indicators.',
      inputSchema: z.object({}),
      execute: async () => {
        const features = await services.featureLoader.getAll(projectPath);
        const byStatus: Record<string, number> = {};
        const blocked: Array<{ id: string; title: string; reason?: string }> = [];
        const inProgress: Array<{ id: string; title: string; complexity?: string }> = [];
        const recentDone: Array<{ id: string; title: string }> = [];

        for (const f of features) {
          const status = f.status ?? 'unknown';
          byStatus[status] = (byStatus[status] ?? 0) + 1;
          if (status === 'blocked') {
            blocked.push({ id: f.id, title: f.title ?? '', reason: f.statusChangeReason });
          } else if (status === 'in_progress') {
            inProgress.push({ id: f.id, title: f.title ?? '', complexity: f.complexity });
          } else if (status === 'done') {
            recentDone.push({ id: f.id, title: f.title ?? '' });
          }
        }

        return {
          total: features.length,
          byStatus,
          blocked: blocked.slice(0, 10),
          inProgress: inProgress.slice(0, 10),
          recentDone: recentDone.slice(0, 5),
        };
      },
    });
  }

  // -----------------------------------------------------------------------
  // Ava Channel tools
  // -----------------------------------------------------------------------
  if (config.avaChannel && services.avaChannelService) {
    const avaChannel = services.avaChannelService;

    tools['send_channel_message'] = makeTool({
      description:
        'Send a message to the Ava backchannel (cross-instance communication channel). Messages are visible to all connected instances. Set expectsResponse:true when you need peers to reply (e.g. status checks, questions). Set intent to classify the message type.',
      inputSchema: z.object({
        content: z.string().describe('Message content to send'),
        intent: z
          .enum(['inform', 'request', 'coordination', 'escalation'])
          .optional()
          .describe(
            'Message intent. inform=FYI (default), request=expects a reply, coordination=work-steal/capacity, escalation=urgent'
          ),
        expectsResponse: z
          .boolean()
          .optional()
          .describe('Set to true if peers should respond to this message (default: false)'),
      }),
      execute: async ({ content, intent, expectsResponse }) => {
        const msg = await avaChannel.postMessage(content, 'ava', {
          intent: intent ?? 'inform',
          expectsResponse: expectsResponse ?? false,
        });
        return { success: true, messageId: msg.id, timestamp: msg.timestamp };
      },
    });

    tools['read_channel_messages'] = makeTool({
      description:
        'Read recent messages from the Ava backchannel. Returns messages ordered by time.',
      inputSchema: z.object({
        hours: z.number().optional().describe('How many hours back to read (default: 24)'),
        instanceId: z.string().optional().describe('Filter messages by instance ID'),
      }),
      execute: async ({ hours, instanceId }) => {
        const messages = await avaChannel.getRecentMessages(hours ?? 24, instanceId);
        return {
          count: messages.length,
          messages: messages.slice(0, 50).map((m) => ({
            id: m.id,
            content: m.content,
            source: m.source,
            timestamp: m.timestamp,
            instanceId: m.instanceId,
          })),
        };
      },
    });

    tools['file_system_improvement'] = makeTool({
      description:
        'File a system improvement ticket on the board. Requires a title, description, and friction summary. Used for self-improvement when Ava identifies friction or bugs.',
      inputSchema: z.object({
        title: z.string().describe('Short title for the improvement'),
        description: z.string().describe('Detailed description of what needs to change'),
        frictionSummary: z.string().describe('Summary of the friction or pain point observed'),
        complexity: z
          .enum(['small', 'medium', 'large', 'architectural'])
          .optional()
          .describe('Estimated complexity'),
        priority: z
          .number()
          .int()
          .min(0)
          .max(4)
          .optional()
          .describe('Priority: 1=urgent, 2=high, 3=normal, 4=low'),
      }),
      needsApproval: destructiveNeedsApproval,
      execute: async ({ title, description, frictionSummary, complexity, priority }) => {
        try {
          const port = parseInt(process.env.PORT || '3008', 10);
          const response = await fetch(
            `http://localhost:${port}/api/ava-channel/file-improvement`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                projectPath,
                title,
                description,
                frictionSummary,
                complexity,
                priority,
                discussantCount: 2,
              }),
            }
          );
          return (await response.json()) as Record<string, unknown>;
        } catch (err) {
          return {
            error: `Failed to file improvement: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      },
    });
  }

  // -----------------------------------------------------------------------
  // Discord tools
  // -----------------------------------------------------------------------
  if (config.discord && services.discordBotService) {
    const discord = services.discordBotService;

    tools['send_discord_dm'] = makeTool({
      description: 'Send a direct message to a Discord user by username.',
      inputSchema: z.object({
        username: z.string().describe('Discord username to send the DM to'),
        content: z.string().describe('Message content'),
      }),
      execute: async ({ username, content }) => {
        const sent = await discord.sendDM(username, content);
        return { success: sent };
      },
    });

    tools['read_discord_dms'] = makeTool({
      description: 'Read recent direct messages from a Discord user.',
      inputSchema: z.object({
        username: z.string().describe('Discord username to read DMs from'),
        limit: z.number().int().optional().describe('Number of messages to read (default: 20)'),
      }),
      execute: async ({ username, limit }) => {
        const messages = await discord.readDMs(username, limit ?? 20);
        return { count: messages.length, messages };
      },
    });

    tools['send_discord_channel_message'] = makeTool({
      description:
        'Send a message or embed to a Discord channel by channel ID. Use embed for structured notifications (errors, status updates, heartbeats). Common channels: #ava=1469195643590541353, #dev=1469080556720623699, #infra=1469109809939742814.',
      inputSchema: z.object({
        channelId: z.string().describe('Discord channel ID'),
        content: z
          .string()
          .optional()
          .describe('Plain text message content (required if no embed)'),
        embed: z
          .object({
            title: z.string().describe('Embed title'),
            description: z.string().optional().describe('Embed body text'),
            color: z
              .number()
              .optional()
              .describe('Embed color as decimal (e.g. 3066993 for green, 15548997 for red)'),
            fields: z
              .array(
                z.object({
                  name: z.string(),
                  value: z.string(),
                  inline: z.boolean().optional(),
                })
              )
              .optional()
              .describe('Embed fields'),
            footer: z.object({ text: z.string() }).optional(),
            timestamp: z.string().optional().describe('ISO 8601 timestamp'),
          })
          .optional()
          .describe('Rich embed object. When provided, sends as an embed instead of plain text.'),
      }),
      execute: async ({ channelId, content, embed }) => {
        if (embed) {
          const sent = await discord.sendEmbed(channelId, embed);
          return { success: sent };
        }
        if (content) {
          const sent = await discord.sendToChannel(channelId, content);
          return { success: sent };
        }
        return { success: false, error: 'Either content or embed is required' };
      },
    });

    tools['read_discord_channel_messages'] = makeTool({
      description:
        'Read recent messages from a Discord channel. Common channels: #ava=1469195643590541353, #dev=1469080556720623699, #infra=1469109809939742814.',
      inputSchema: z.object({
        channelId: z.string().describe('Discord channel ID'),
        limit: z.number().int().optional().describe('Number of messages to read (default: 20)'),
      }),
      execute: async ({ channelId, limit }) => {
        const messages = await discord.readMessages(channelId, limit ?? 20);
        return { count: messages.length, messages };
      },
    });
  }

  // -----------------------------------------------------------------------
  // Calendar tools
  // -----------------------------------------------------------------------
  if (config.calendar && services.calendarService) {
    const calendar = services.calendarService;

    tools['list_calendar_events'] = makeTool({
      description:
        'List calendar events for the project. Supports filtering by date range and event type.',
      inputSchema: z.object({
        startDate: z.string().optional().describe('Start date filter (YYYY-MM-DD)'),
        endDate: z.string().optional().describe('End date filter (YYYY-MM-DD)'),
        types: z
          .array(z.enum(['feature', 'milestone', 'custom', 'google', 'job', 'ceremony']))
          .optional()
          .describe('Filter by event types'),
      }),
      execute: async ({ startDate, endDate, types }) => {
        const events = await calendar.listEvents(projectPath, { startDate, endDate, types });
        return { count: events.length, events };
      },
    });

    tools['create_calendar_event'] = makeTool({
      description: 'Create a new calendar event in the project.',
      inputSchema: z.object({
        title: z.string().describe('Event title'),
        description: z.string().optional().describe('Event description'),
        date: z.string().describe('Event date (YYYY-MM-DD)'),
        endDate: z.string().optional().describe('End date for multi-day events (YYYY-MM-DD)'),
        type: z
          .enum(['feature', 'milestone', 'custom', 'google', 'job', 'ceremony'])
          .optional()
          .describe('Event type (default: custom)'),
        time: z.string().optional().describe('Time in HH:mm 24h format'),
      }),
      execute: async ({ title, description, date, endDate, type, time }) => {
        const event = await calendar.createEvent(projectPath, {
          title,
          description,
          date,
          endDate,
          type: type ?? 'custom',
          time,
        });
        return { success: true, event };
      },
    });

    tools['update_calendar_event'] = makeTool({
      description: 'Update an existing calendar event.',
      inputSchema: z.object({
        eventId: z.string().describe('Event ID to update'),
        title: z.string().optional().describe('New title'),
        description: z.string().optional().describe('New description'),
        startDate: z.string().optional().describe('New start date (YYYY-MM-DD)'),
        endDate: z.string().optional().describe('New end date (YYYY-MM-DD)'),
        time: z.string().optional().describe('New time in HH:mm 24h format'),
      }),
      needsApproval: destructiveNeedsApproval,
      execute: async ({ eventId, ...updates }) => {
        const event = await calendar.updateEvent(projectPath, eventId, updates);
        return { success: true, event };
      },
    });

    tools['delete_calendar_event'] = makeTool({
      description: 'Delete a calendar event by ID.',
      inputSchema: z.object({
        eventId: z.string().describe('Event ID to delete'),
      }),
      needsApproval: destructiveNeedsApproval,
      execute: async ({ eventId }) => {
        await calendar.deleteEvent(projectPath, eventId);
        return { success: true, eventId };
      },
    });
  }

  // -----------------------------------------------------------------------
  // Health tools
  // -----------------------------------------------------------------------
  if (config.health && services.healthMonitorService) {
    const healthMonitor = services.healthMonitorService;

    tools['health_check'] = makeTool({
      description:
        'Run a health check on the server. Returns status (healthy/degraded/critical), memory usage, uptime, and any detected issues.',
      inputSchema: z.object({}),
      execute: async () => {
        const result = await healthMonitor.runHealthCheck();
        return result;
      },
    });

    tools['get_sitrep'] = makeTool({
      description:
        'Get a full situation report: board summary, running agents, auto-mode status, blocked features, open PRs, staging delta, recent commits, and server health.',
      inputSchema: z.object({}),
      execute: async () => {
        const { getSitrep: fetchSitrep } = await import('./sitrep.js');
        const report = await fetchSitrep(projectPath);
        return report;
      },
    });
  }

  // -----------------------------------------------------------------------
  // Settings tools
  // -----------------------------------------------------------------------
  if (config.settings && services.settingsService) {
    const settingsSvc = services.settingsService;

    tools['get_global_settings'] = makeTool({
      description:
        'Get global application settings including feature flags, user profile, and default configurations.',
      inputSchema: z.object({}),
      execute: async () => {
        const settings = await settingsSvc.getGlobalSettings();
        return settings;
      },
    });

    tools['update_global_settings'] = makeTool({
      description: 'Update global application settings. Supports partial updates (deep merge).',
      inputSchema: z.object({
        updates: z
          .record(z.string(), z.unknown())
          .describe('Partial settings object to merge into global settings'),
      }),
      needsApproval: destructiveNeedsApproval,
      execute: async ({ updates }) => {
        const settings = await settingsSvc.updateGlobalSettings(updates);
        return { success: true, settings };
      },
    });

    tools['get_project_settings'] = makeTool({
      description:
        'Get project-specific settings (.automaker/settings.json) including workflow config, git settings, and model preferences.',
      inputSchema: z.object({}),
      execute: async () => {
        const settings = await settingsSvc.getProjectSettings(projectPath);
        return settings;
      },
    });

    tools['update_project_settings'] = makeTool({
      description: 'Update project-specific settings. Supports partial updates (deep merge).',
      inputSchema: z.object({
        updates: z
          .record(z.string(), z.unknown())
          .describe('Partial settings object to merge into project settings'),
      }),
      needsApproval: destructiveNeedsApproval,
      execute: async ({ updates }) => {
        const settings = await settingsSvc.updateProjectSettings(projectPath, updates);
        return { success: true, settings };
      },
    });
  }

  return tools;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Convert a time range string to milliseconds.
 */
function getTimeRangeMs(range: string): number {
  switch (range) {
    case '1h':
      return 60 * 60 * 1000;
    case '6h':
      return 6 * 60 * 60 * 1000;
    case '24h':
      return 24 * 60 * 60 * 1000;
    case '7d':
      return 7 * 24 * 60 * 60 * 1000;
    default:
      return 24 * 60 * 60 * 1000;
  }
}

/**
 * Topological sort of features based on their `dependencies` array.
 * Features with no dependencies come first; features that depend on others
 * are placed after their dependencies. Cycles are handled gracefully by
 * skipping already-visited nodes.
 */
function topologicalSort<T extends { id: string; dependencies?: string[] }>(features: T[]): T[] {
  const result: T[] = [];
  const visited = new Set<string>();
  const featureMap = new Map<string, T>(features.map((f) => [f.id, f]));

  function visit(id: string): void {
    if (visited.has(id)) return;
    visited.add(id);
    const feature = featureMap.get(id);
    if (!feature) return;
    for (const depId of feature.dependencies ?? []) {
      visit(depId);
    }
    result.push(feature);
  }

  for (const feature of features) {
    visit(feature.id);
  }

  return result;
}
