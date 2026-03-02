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
import type { EventEmitter } from 'events';
import type { FeatureLoader } from '../../services/feature-loader.js';
import type { AutoModeService } from '../../services/auto-mode-service.js';
import type { AgentService } from '../../services/agent-service.js';

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
  agentService: AgentService;
  /** Optional event emitter used for board-write change notifications */
  events?: EventEmitter;
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
  /** Enable project management tools (get_project_spec, update_project_spec) */
  projectMgmt?: boolean;
  /** Enable orchestration tools (get_execution_order, set_feature_dependencies) */
  orchestration?: boolean;
  /**
   * Pre-approved destructive tool calls (HITL flow).
   * Each entry contains the tool name and a stable JSON hash of the input args.
   * When a destructive tool's args match an entry here, it executes immediately
   * rather than returning a confirmation-required sentinel.
   */
  approvedActions?: Array<{ toolName: string; inputHash: string }>;
}

// ---------------------------------------------------------------------------
// Destructive-tool helpers (HITL)
// ---------------------------------------------------------------------------

/**
 * The set of tool names that require human-in-the-loop confirmation before
 * executing. `start_auto_mode` is only gated when maxConcurrency > 1.
 */
export const DESTRUCTIVE_TOOLS = new Set(['delete_feature', 'stop_agent', 'update_project_spec']);

/**
 * Produce a stable JSON string for an input object so that two calls with the
 * same arguments generate identical hashes regardless of key insertion order.
 */
function stableJson(obj: unknown): string {
  if (typeof obj !== 'object' || obj === null) return JSON.stringify(obj);
  const sorted = Object.fromEntries(
    Object.entries(obj as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
  );
  return JSON.stringify(sorted);
}

/**
 * Returns true when the given (toolName, input) pair has been pre-approved by
 * the user in this request.
 */
function isApproved(
  toolName: string,
  input: unknown,
  approvedActions: AvaToolsConfig['approvedActions']
): boolean {
  if (!approvedActions || approvedActions.length === 0) return false;
  const hash = stableJson(input);
  return approvedActions.some((a) => a.toolName === toolName && a.inputHash === hash);
}

/**
 * Build the HITL sentinel object returned when a destructive tool needs
 * user confirmation before executing.
 */
function hitlSentinel(action: string, summary: string, input: unknown): Record<string, unknown> {
  return {
    __hitl: true,
    action,
    summary,
    input,
    message:
      'This action requires user confirmation. Please confirm to proceed or reject to cancel.',
  };
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
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeTool<TSchema extends z.ZodType<any>>(config: {
  description: string;
  inputSchema: TSchema;
  execute: (input: z.infer<TSchema>) => Promise<unknown>;
}): Tool {
  return config as unknown as Tool;
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
  config: AvaToolsConfig
): Record<string, Tool> {
  const tools: Record<string, Tool> = {};

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
        services.events?.emit('feature:created', { projectPath, feature });
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
        services.events?.emit('feature:updated', { projectPath, feature });
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const feature = await services.featureLoader.update(projectPath, featureId, {
          status,
        } as any);
        services.events?.emit('feature:moved', { projectPath, featureId, status, feature });
        return { featureId, newStatus: feature.status };
      },
    });

    tools['delete_feature'] = makeTool({
      description: 'Permanently delete a feature from the project board.',
      inputSchema: z.object({
        featureId: z.string().describe('The feature ID to delete'),
      }),
      execute: async ({ featureId }) => {
        const input = { featureId };
        if (!isApproved('delete_feature', input, config.approvedActions)) {
          return hitlSentinel('delete_feature', `Delete feature "${featureId}"`, input);
        }
        const success = await services.featureLoader.delete(projectPath, featureId);
        if (success) {
          services.events?.emit('feature:deleted', { projectPath, featureId });
        }
        return { success, featureId };
      },
    });
  }

  // -----------------------------------------------------------------------
  // agentControl – manage agent sessions and retrieve their output
  // -----------------------------------------------------------------------
  if (config.agentControl) {
    tools['list_running_agents'] = makeTool({
      description: 'List all active (non-archived) agent sessions.',
      inputSchema: z.object({}),
      execute: async () => {
        const sessions = await services.agentService.listSessions(false);
        return sessions;
      },
    });

    tools['start_agent'] = makeTool({
      description: 'Create and start a new agent session.',
      inputSchema: z.object({
        name: z.string().describe('Human-readable name for this agent session'),
        workingDirectory: z
          .string()
          .optional()
          .describe('Working directory the agent should operate in'),
        model: z.string().optional().describe('Model identifier to use for this agent'),
      }),
      execute: async ({ name, workingDirectory, model }) => {
        const session = await services.agentService.createSession(
          name,
          projectPath,
          workingDirectory,
          model
        );
        return session;
      },
    });

    tools['stop_agent'] = makeTool({
      description: 'Stop and remove an agent session.',
      inputSchema: z.object({
        sessionId: z.string().describe('ID of the session to stop'),
      }),
      execute: async ({ sessionId }) => {
        const input = { sessionId };
        if (!isApproved('stop_agent', input, config.approvedActions)) {
          return hitlSentinel('stop_agent', `Stop agent session "${sessionId}"`, input);
        }
        const deleted = await services.agentService.deleteSession(sessionId);
        return { success: deleted, sessionId };
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
      execute: async ({ maxConcurrency, branchName }) => {
        // Require confirmation when running more than one worker in parallel
        const isConcurrent = (maxConcurrency ?? 1) > 1;
        if (isConcurrent) {
          const input = { maxConcurrency, branchName };
          if (!isApproved('start_auto_mode', input, config.approvedActions)) {
            return hitlSentinel(
              'start_auto_mode',
              `Start auto mode with ${maxConcurrency} parallel workers`,
              input
            );
          }
        }
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
      execute: async ({ content }) => {
        const input = { content };
        if (!isApproved('update_project_spec', input, config.approvedActions)) {
          return hitlSentinel('update_project_spec', 'Update project specification', input);
        }
        const specDir = path.join(projectPath, '.automaker');
        const specPath = path.join(specDir, 'spec.md');
        await fs.mkdir(specDir, { recursive: true });
        await fs.writeFile(specPath, content, 'utf-8');
        return { success: true, path: specPath };
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const feature = await services.featureLoader.update(projectPath, featureId, {
          dependencies,
        } as any);
        return { featureId, dependencies: feature.dependencies ?? [] };
      },
    });
  }

  return tools;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

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
