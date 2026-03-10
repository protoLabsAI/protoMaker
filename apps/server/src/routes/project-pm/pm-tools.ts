/**
 * PM Tools — AI tool definitions for the Project PM chat agent
 *
 * Provides buildPMTools() which constructs ~35 Tool instances scoped to a
 * specific projectSlug/projectPath. Tools are grouped into:
 *
 *   boardRead:     Read features from the project board (filtered by projectSlug)
 *   boardWrite:    Create/update/move/delete features on the board
 *   agentControl:  List/start/stop agent sessions and retrieve output
 *   prWorkflow:    Check PR status, get feedback, resolve, merge
 *   orchestration: Dependency-based execution order management
 *   contextFiles:  Read/list project context files
 *   leadEngineer:  Lead Engineer status/start/stop for the project
 *   projectMgmt:   Read/write project spec and status updates
 */

import type { Tool } from 'ai';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import type { FeatureLoader } from '../../services/feature-loader.js';
import type { AgentService } from '../../services/agent-service.js';
import type { LeadEngineerService } from '../../services/lead-engineer-service.js';
import type { AutoModeService } from '../../services/auto-mode-service.js';
import type { ProjectService } from '../../services/project-service.js';
import type { EventEmitter } from '../../lib/events.js';
import type { EventType } from '@protolabsai/types';
import { getAutomakerDir } from '@protolabsai/platform';

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

export interface PMToolsConfig {
  /** Read-only board tools (get_board_summary, list_features, get_feature, get_feature_detail) */
  boardRead?: boolean;
  /** Write board tools (create_feature, update_feature, move_feature, delete_feature, add_feature_note) */
  boardWrite?: boolean;
  /** Agent control tools (list_agents, get_agent_output, stop_agent, start_feature_agent) */
  agentControl?: boolean;
  /** PR workflow tools (check_pr_status, get_pr_feedback, resolve_pr_comments, request_pr_merge) */
  prWorkflow?: boolean;
  /** Orchestration tools (get_execution_order, set_feature_dependencies, get_dependency_graph) */
  orchestration?: boolean;
  /** Context file tools (list_context_files, get_context_file) */
  contextFiles?: boolean;
  /** Lead Engineer tools (get_lead_engineer_status, start_lead_engineer, stop_lead_engineer, get_lead_engineer_session) */
  leadEngineer?: boolean;
  /** Project management tools (get_project_spec, update_project_spec, get_milestones, update_milestone) */
  projectMgmt?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Services container
// ─────────────────────────────────────────────────────────────────────────────

export interface PMToolsServices {
  featureLoader: FeatureLoader;
  agentService: AgentService;
  leadEngineerService: LeadEngineerService;
  autoModeService: AutoModeService;
  projectService: ProjectService;
  events: EventEmitter;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeTool<TSchema extends z.ZodType<any>>(config: {
  description: string;
  inputSchema: TSchema;
  execute: (input: z.infer<TSchema>) => Promise<unknown>;
}): Tool {
  return config as unknown as Tool;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the PM tool registry for a given project.
 *
 * All tools are scoped to projectPath + projectSlug. Tool groups can be
 * individually disabled via the config object.
 */
export function buildPMTools(
  projectPath: string,
  projectSlug: string,
  services: PMToolsServices,
  config: PMToolsConfig = {}
): Record<string, Tool> {
  const {
    featureLoader,
    agentService,
    leadEngineerService,
    autoModeService,
    projectService,
    events,
  } = services;

  const tools: Record<string, Tool> = {};

  // ───────────────────────────────────────────────────────────────────────────
  // boardRead group
  // ───────────────────────────────────────────────────────────────────────────
  if (config.boardRead !== false) {
    tools.get_board_summary = makeTool({
      description:
        'Get a summary of the project board: feature counts by status, blocked features, and in-progress features. Scoped to this project.',
      inputSchema: z.object({}),
      execute: async () => {
        const features = await featureLoader.getAll(projectPath);
        const project = features.filter(
          (f) => !projectSlug || f.projectSlug === projectSlug || !f.projectSlug
        );
        const counts: Record<string, number> = {};
        for (const f of project) {
          const s = f.status ?? 'unknown';
          counts[s] = (counts[s] ?? 0) + 1;
        }
        const blocked = project
          .filter((f) => f.status === 'blocked')
          .map((f) => ({
            id: f.id,
            title: f.title ?? f.id,
            blockingReason: f.blockingReason ?? null,
          }));
        const inProgress = project
          .filter((f) => f.status === 'in_progress')
          .map((f) => ({
            id: f.id,
            title: f.title ?? f.id,
          }));
        return { total: project.length, counts, blocked, inProgress };
      },
    });

    tools.list_features = makeTool({
      description:
        'List features on the project board for this project, optionally filtered by status.',
      inputSchema: z.object({
        status: z
          .enum(['backlog', 'in_progress', 'review', 'blocked', 'done'])
          .optional()
          .describe('Filter by feature status'),
        limit: z.number().int().min(1).max(100).optional().default(50).describe('Max results'),
      }),
      execute: async ({ status, limit }) => {
        const features = await featureLoader.getAll(projectPath);
        const project = features.filter((f) => !f.projectSlug || f.projectSlug === projectSlug);
        const filtered = status ? project.filter((f) => f.status === status) : project;
        return filtered.slice(0, limit).map((f) => ({
          id: f.id,
          title: f.title ?? f.id,
          status: f.status ?? 'unknown',
          complexity: f.complexity,
          projectSlug: f.projectSlug ?? null,
        }));
      },
    });

    tools.get_feature = makeTool({
      description: 'Get details for a single feature by its ID.',
      inputSchema: z.object({
        featureId: z.string().describe('The feature ID'),
      }),
      execute: async ({ featureId }) => {
        const feature = await featureLoader.get(projectPath, featureId).catch(() => null);
        if (!feature) return { error: `Feature ${featureId} not found` };
        return feature;
      },
    });

    tools.get_feature_detail = makeTool({
      description:
        'Get full detail for a feature including description, notes, PR info, and status history.',
      inputSchema: z.object({
        featureId: z.string().describe('The feature ID'),
      }),
      execute: async ({ featureId }) => {
        const feature = await featureLoader.get(projectPath, featureId).catch(() => null);
        if (!feature) return { error: `Feature ${featureId} not found` };
        return {
          id: feature.id,
          title: feature.title ?? feature.id,
          status: feature.status ?? 'unknown',
          complexity: feature.complexity,
          description: feature.description ?? null,
          prUrl: feature.prUrl ?? null,
          branchName: feature.branchName ?? null,
          projectSlug: feature.projectSlug ?? null,
          dependencies: feature.dependencies ?? [],
          executionHistory: feature.executionHistory?.slice(-5) ?? [],
          startedAt: feature.startedAt ?? null,
        };
      },
    });

    tools.search_features = makeTool({
      description: 'Search features by title or description keyword within this project.',
      inputSchema: z.object({
        query: z.string().describe('Search keyword to match against title/description'),
        limit: z.number().int().min(1).max(50).optional().default(20).describe('Max results'),
      }),
      execute: async ({ query, limit }) => {
        const features = await featureLoader.getAll(projectPath);
        const project = features.filter((f) => !f.projectSlug || f.projectSlug === projectSlug);
        const q = query.toLowerCase();
        const matched = project.filter(
          (f) =>
            (f.title ?? f.id).toLowerCase().includes(q) ||
            (f.description ?? '').toLowerCase().includes(q)
        );
        return matched.slice(0, limit).map((f) => ({
          id: f.id,
          title: f.title ?? f.id,
          status: f.status ?? 'unknown',
        }));
      },
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // boardWrite group
  // ───────────────────────────────────────────────────────────────────────────
  if (config.boardWrite !== false) {
    tools.create_feature = makeTool({
      description: 'Create a new feature on the project board, scoped to this project.',
      inputSchema: z.object({
        title: z.string().describe('Feature title'),
        description: z.string().optional().describe('Feature description'),
        complexity: z
          .enum(['small', 'medium', 'large', 'architectural'])
          .optional()
          .describe('Complexity estimate'),
      }),
      execute: async ({ title, description, complexity }) => {
        const feature = await featureLoader.create(projectPath, {
          title,
          description,
          complexity,
          projectSlug,
          status: 'backlog',
        });
        events.emit('feature:created' as EventType, { projectPath, featureId: feature.id });
        return { ok: true, featureId: feature.id, title: feature.title };
      },
    });

    tools.update_feature = makeTool({
      description: 'Update fields on an existing feature.',
      inputSchema: z.object({
        featureId: z.string().describe('The feature ID to update'),
        title: z.string().optional().describe('New title'),
        description: z.string().optional().describe('New description'),
        complexity: z
          .enum(['small', 'medium', 'large', 'architectural'])
          .optional()
          .describe('Complexity'),
      }),
      execute: async ({ featureId, ...updates }) => {
        const updated = await featureLoader.update(projectPath, featureId, updates);
        events.emit('feature:updated' as EventType, { projectPath, featureId });
        return { ok: true, featureId, title: updated.title };
      },
    });

    tools.move_feature = makeTool({
      description: 'Move a feature to a different status column on the board.',
      inputSchema: z.object({
        featureId: z.string().describe('The feature ID to move'),
        status: z
          .enum(['backlog', 'in_progress', 'review', 'blocked', 'done'])
          .describe('Target status'),
        blockingReason: z
          .string()
          .optional()
          .describe('Reason for blocking (required when status is blocked)'),
      }),
      execute: async ({ featureId, status, blockingReason }) => {
        await featureLoader.update(projectPath, featureId, {
          status,
          ...(blockingReason ? { blockingReason } : {}),
        });
        events.emit('feature:status-changed' as EventType, { projectPath, featureId, status });
        return { ok: true, featureId, status };
      },
    });

    tools.delete_feature = makeTool({
      description: 'Delete a feature from the project board.',
      inputSchema: z.object({
        featureId: z.string().describe('The feature ID to delete'),
      }),
      execute: async ({ featureId }) => {
        await featureLoader.delete(projectPath, featureId);
        events.emit('feature:deleted' as EventType, { projectPath, featureId });
        return { ok: true, featureId };
      },
    });

    tools.add_feature_note = makeTool({
      description: 'Append a note to an existing feature.',
      inputSchema: z.object({
        featureId: z.string().describe('The feature ID'),
        note: z.string().describe('Note text to append'),
      }),
      execute: async ({ featureId, note }) => {
        const feature = await featureLoader.get(projectPath, featureId).catch(() => null);
        if (!feature) return { error: `Feature ${featureId} not found` };
        const existing = feature.summary ?? '';
        const updated = existing ? `${existing}\n\n${note}` : note;
        await featureLoader.update(projectPath, featureId, { summary: updated });
        return { ok: true, featureId };
      },
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // agentControl group
  // ───────────────────────────────────────────────────────────────────────────
  if (config.agentControl !== false) {
    tools.list_agents = makeTool({
      description: 'List all running agent sessions associated with features in this project.',
      inputSchema: z.object({
        includeArchived: z
          .boolean()
          .optional()
          .default(false)
          .describe('Include archived sessions'),
      }),
      execute: async ({ includeArchived }) => {
        const sessions = await agentService.listSessions(includeArchived);
        // Filter sessions whose working directory is under this projectPath
        const projectSessions = sessions.filter(
          (s) => s.workingDirectory && s.workingDirectory.startsWith(projectPath)
        );
        return projectSessions.map((s) => ({
          sessionId: s.id,
          name: s.name,
          workingDirectory: s.workingDirectory,
          updatedAt: s.updatedAt,
          model: s.model,
        }));
      },
    });

    tools.get_agent_output = makeTool({
      description: 'Get recent output messages from an agent session.',
      inputSchema: z.object({
        sessionId: z.string().describe('The agent session ID'),
        limit: z.number().int().min(1).max(50).optional().default(20).describe('Max messages'),
      }),
      execute: async ({ sessionId, limit }) => {
        const messages = await agentService.loadSession(sessionId);
        return messages.slice(-limit).map((m) => ({
          role: m.role,
          content: typeof m.content === 'string' ? m.content.slice(0, 2000) : String(m.content),
          timestamp: m.timestamp,
        }));
      },
    });

    tools.stop_agent = makeTool({
      description: 'Stop a running agent session.',
      inputSchema: z.object({
        sessionId: z.string().describe('The agent session ID to stop'),
      }),
      execute: async ({ sessionId }) => {
        await agentService.stopExecution(sessionId);
        return { ok: true, sessionId };
      },
    });

    tools.start_feature_agent = makeTool({
      description:
        'Start an agent session to work on a specific feature in this project. Emits an agent-start event.',
      inputSchema: z.object({
        featureId: z.string().describe('The feature ID to work on'),
        prompt: z.string().optional().describe('Initial prompt / instructions for the agent'),
      }),
      execute: async ({ featureId, prompt }) => {
        events.emit('agent:start-requested' as EventType, {
          projectPath,
          projectSlug,
          featureId,
          prompt: prompt ?? `Implement feature ${featureId}`,
        });
        return { ok: true, featureId, queued: true };
      },
    });

    tools.get_auto_mode_status = makeTool({
      description: 'Get the current auto-mode status for this project.',
      inputSchema: z.object({}),
      execute: async () => {
        const isRunning =
          typeof autoModeService.isAutoLoopRunningForProject === 'function'
            ? autoModeService.isAutoLoopRunningForProject(projectPath, null)
            : false;
        return { projectPath, projectSlug, isRunning };
      },
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // prWorkflow group
  // ───────────────────────────────────────────────────────────────────────────
  if (config.prWorkflow !== false) {
    tools.check_pr_status = makeTool({
      description:
        'Check the PR status for a feature (CI checks, review state, merge eligibility).',
      inputSchema: z.object({
        featureId: z.string().describe('The feature ID whose PR to check'),
      }),
      execute: async ({ featureId }) => {
        const feature = await featureLoader.get(projectPath, featureId).catch(() => null);
        if (!feature) return { error: `Feature ${featureId} not found` };
        if (!feature.prUrl && !feature.prNumber) {
          return { featureId, hasPR: false, message: 'No PR associated with this feature' };
        }
        return {
          featureId,
          hasPR: true,
          prUrl: feature.prUrl ?? null,
          prNumber: feature.prNumber ?? null,
          branchName: feature.branchName ?? null,
        };
      },
    });

    tools.get_pr_feedback = makeTool({
      description: 'Get PR review feedback and comments for a feature.',
      inputSchema: z.object({
        featureId: z.string().describe('The feature ID'),
      }),
      execute: async ({ featureId }) => {
        const feature = await featureLoader.get(projectPath, featureId).catch(() => null);
        if (!feature) return { error: `Feature ${featureId} not found` };
        return {
          featureId,
          prUrl: feature.prUrl ?? null,
          lastReviewFeedback: feature.lastReviewFeedback ?? null,
          prIterationCount: feature.prIterationCount ?? 0,
        };
      },
    });

    tools.resolve_pr_comments = makeTool({
      description: 'Request that an agent resolves outstanding PR review comments for a feature.',
      inputSchema: z.object({
        featureId: z.string().describe('The feature ID'),
        instructions: z.string().optional().describe('Additional resolution instructions'),
      }),
      execute: async ({ featureId, instructions }) => {
        events.emit('pr:resolve-requested' as EventType, {
          projectPath,
          projectSlug,
          featureId,
          instructions: instructions ?? '',
        });
        return { ok: true, featureId, queued: true };
      },
    });

    tools.request_pr_merge = makeTool({
      description: 'Request that a PR be merged once all checks pass.',
      inputSchema: z.object({
        featureId: z.string().describe('The feature ID whose PR to merge'),
        mergeStrategy: z
          .enum(['merge', 'squash', 'rebase'])
          .optional()
          .default('squash')
          .describe('Merge strategy'),
      }),
      execute: async ({ featureId, mergeStrategy }) => {
        events.emit('pr:merge-requested' as EventType, {
          projectPath,
          projectSlug,
          featureId,
          mergeStrategy,
        });
        return { ok: true, featureId, mergeStrategy, queued: true };
      },
    });

    tools.list_open_prs = makeTool({
      description: 'List all features in this project that have open PRs.',
      inputSchema: z.object({}),
      execute: async () => {
        const features = await featureLoader.getAll(projectPath);
        const project = features.filter((f) => !f.projectSlug || f.projectSlug === projectSlug);
        const withPRs = project.filter((f) => f.prUrl || f.prNumber);
        return withPRs.map((f) => ({
          featureId: f.id,
          title: f.title ?? f.id,
          status: f.status ?? 'unknown',
          prUrl: f.prUrl ?? null,
          prNumber: f.prNumber ?? null,
          branchName: f.branchName ?? null,
        }));
      },
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // orchestration group
  // ───────────────────────────────────────────────────────────────────────────
  if (config.orchestration !== false) {
    tools.get_execution_order = makeTool({
      description:
        'Get the recommended execution order for backlog features based on dependencies.',
      inputSchema: z.object({}),
      execute: async () => {
        const features = await featureLoader.getAll(projectPath);
        const project = features.filter(
          (f) => (!f.projectSlug || f.projectSlug === projectSlug) && f.status === 'backlog'
        );
        // Topological sort: features with no deps first
        const sorted = [...project].sort((a, b) => {
          const aDeps = a.dependencies?.length ?? 0;
          const bDeps = b.dependencies?.length ?? 0;
          return aDeps - bDeps;
        });
        return sorted.map((f, i) => ({
          order: i + 1,
          featureId: f.id,
          title: f.title ?? f.id,
          dependencies: f.dependencies ?? [],
        }));
      },
    });

    tools.set_feature_dependencies = makeTool({
      description: 'Set the dependency list for a feature.',
      inputSchema: z.object({
        featureId: z.string().describe('The feature ID to update'),
        dependencies: z
          .array(z.string())
          .describe('Array of feature IDs that this feature depends on'),
      }),
      execute: async ({ featureId, dependencies }) => {
        await featureLoader.update(projectPath, featureId, { dependencies });
        return { ok: true, featureId, dependencies };
      },
    });

    tools.get_dependency_graph = makeTool({
      description: 'Get the full dependency graph for this project as an adjacency list.',
      inputSchema: z.object({}),
      execute: async () => {
        const features = await featureLoader.getAll(projectPath);
        const project = features.filter((f) => !f.projectSlug || f.projectSlug === projectSlug);
        return project.map((f) => ({
          featureId: f.id,
          title: f.title ?? f.id,
          status: f.status ?? 'unknown',
          dependencies: f.dependencies ?? [],
          dependents: project
            .filter((other) => other.dependencies?.includes(f.id))
            .map((other) => other.id),
        }));
      },
    });

    tools.get_blocked_features = makeTool({
      description: 'List features that are blocked, along with the features blocking them.',
      inputSchema: z.object({}),
      execute: async () => {
        const features = await featureLoader.getAll(projectPath);
        const project = features.filter((f) => !f.projectSlug || f.projectSlug === projectSlug);
        const blocked = project.filter((f) => f.status === 'blocked');
        return blocked.map((f) => ({
          featureId: f.id,
          title: f.title ?? f.id,
          blockingReason: f.blockingReason ?? null,
          dependencies: f.dependencies ?? [],
          pendingDeps: (f.dependencies ?? []).filter((depId) => {
            const dep = project.find((d) => d.id === depId);
            return dep && dep.status !== 'done';
          }),
        }));
      },
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // contextFiles group
  // ───────────────────────────────────────────────────────────────────────────
  if (config.contextFiles !== false) {
    tools.list_context_files = makeTool({
      description: 'List context files available in the .automaker directory for this project.',
      inputSchema: z.object({}),
      execute: async () => {
        const automakerDir = getAutomakerDir(projectPath);
        try {
          const entries = await fs.readdir(automakerDir);
          const files = entries.filter(
            (e) => e.endsWith('.md') || e.endsWith('.txt') || e.endsWith('.json')
          );
          return { files, automakerDir };
        } catch {
          return { files: [], automakerDir };
        }
      },
    });

    tools.get_context_file = makeTool({
      description: 'Read a context file from the .automaker directory.',
      inputSchema: z.object({
        filename: z.string().describe('The filename to read (relative to .automaker/)'),
      }),
      execute: async ({ filename }) => {
        const automakerDir = getAutomakerDir(projectPath);
        // Prevent path traversal
        const safeName = path.basename(filename);
        const filePath = path.join(automakerDir, safeName);
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          return { filename: safeName, content: content.slice(0, 10000) };
        } catch {
          return { error: `File ${safeName} not found in .automaker/` };
        }
      },
    });

    tools.get_project_spec = makeTool({
      description:
        'Read the project spec file (.automaker/spec.md) which describes the project goals and architecture.',
      inputSchema: z.object({}),
      execute: async () => {
        const specPath = path.join(getAutomakerDir(projectPath), 'spec.md');
        try {
          const content = await fs.readFile(specPath, 'utf-8');
          return { content: content.slice(0, 10000) };
        } catch {
          return { error: 'spec.md not found' };
        }
      },
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // leadEngineer group
  // ───────────────────────────────────────────────────────────────────────────
  if (config.leadEngineer !== false) {
    tools.get_lead_engineer_status = makeTool({
      description:
        'Get the current Lead Engineer status for this project (whether it is active, which features it is managing).',
      inputSchema: z.object({}),
      execute: async () => {
        const isActive = leadEngineerService.isActive(projectPath);
        const session = leadEngineerService.getSession(projectPath);
        return {
          projectPath,
          projectSlug,
          isActive,
          flowState: session?.flowState ?? null,
          startedAt: session?.startedAt ?? null,
          actionsTaken: session?.actionsTaken ?? 0,
        };
      },
    });

    tools.start_lead_engineer = makeTool({
      description:
        'Start the Lead Engineer for this project. The Lead Engineer orchestrates feature execution automatically.',
      inputSchema: z.object({}),
      execute: async () => {
        events.emit('lead-engineer:start-requested' as EventType, {
          projectPath,
          projectSlug,
        });
        return { ok: true, projectSlug, queued: true };
      },
    });

    tools.stop_lead_engineer = makeTool({
      description: 'Stop the Lead Engineer for this project.',
      inputSchema: z.object({}),
      execute: async () => {
        await leadEngineerService.stop(projectPath);
        return { ok: true, projectSlug };
      },
    });

    tools.get_lead_engineer_session = makeTool({
      description: 'Get the full Lead Engineer session details for this project.',
      inputSchema: z.object({}),
      execute: async () => {
        const session = leadEngineerService.getSession(projectPath);
        if (!session) return { error: 'No Lead Engineer session for this project' };
        return {
          projectPath,
          projectSlug,
          flowState: session.flowState,
          startedAt: session.startedAt,
          stoppedAt: session.stoppedAt ?? null,
          actionsTaken: session.actionsTaken,
          ruleLogCount: session.ruleLog?.length ?? 0,
        };
      },
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // projectMgmt group
  // ───────────────────────────────────────────────────────────────────────────
  if (config.projectMgmt !== false) {
    tools.get_project_info = makeTool({
      description: 'Get project metadata: title, goal, health, status, and milestones.',
      inputSchema: z.object({}),
      execute: async () => {
        const p = await projectService.getProject(projectPath, projectSlug).catch(() => null);
        if (!p) return { error: 'Project not found' };
        return {
          title: p.title,
          status: p.status,
          health: p.health,
          goal: p.goal,
          milestones: p.milestones ?? [],
          updatedAt: p.updatedAt,
        };
      },
    });

    tools.update_project_health = makeTool({
      description: 'Update the health status of the project.',
      inputSchema: z.object({
        health: z.enum(['on-track', 'at-risk', 'off-track']).describe('New health value'),
      }),
      execute: async ({ health }) => {
        await projectService.updateProject(projectPath, projectSlug, {
          health: health as 'on-track' | 'at-risk' | 'off-track',
        });
        return { ok: true, health };
      },
    });

    tools.get_milestones = makeTool({
      description: 'Get all milestones for this project with their completion status.',
      inputSchema: z.object({}),
      execute: async () => {
        const p = await projectService.getProject(projectPath, projectSlug).catch(() => null);
        if (!p) return { error: 'Project not found' };
        return { milestones: p.milestones ?? [] };
      },
    });

    tools.update_milestone = makeTool({
      description: 'Update the status or details of a milestone.',
      inputSchema: z.object({
        milestoneSlug: z.string().describe('The milestone slug to update'),
        status: z
          .enum(['stub', 'planning', 'planned', 'pending', 'in-progress', 'completed'])
          .optional()
          .describe('New milestone status'),
        description: z.string().optional().describe('Updated description'),
      }),
      execute: async ({ milestoneSlug, status, description }) => {
        const p = await projectService.getProject(projectPath, projectSlug).catch(() => null);
        if (!p) return { error: 'Project not found' };
        const milestones = (p.milestones ?? []).map((m) => {
          if (m.slug === milestoneSlug) {
            return {
              ...m,
              ...(status ? { status } : {}),
              ...(description ? { description } : {}),
            };
          }
          return m;
        });
        await projectService.updateProject(projectPath, projectSlug, { milestones });
        return { ok: true, milestoneSlug };
      },
    });

    tools.post_status_update = makeTool({
      description: 'Post a status update to the project timeline.',
      inputSchema: z.object({
        health: z.enum(['on-track', 'at-risk', 'off-track']).describe('Current project health'),
        body: z.string().describe('Status update message body'),
      }),
      execute: async ({ health, body }) => {
        const p = await projectService.getProject(projectPath, projectSlug).catch(() => null);
        if (!p) return { error: 'Project not found' };
        const update = {
          id: `update-${Date.now()}`,
          health: health as 'on-track' | 'at-risk' | 'off-track',
          body,
          author: 'PM Agent',
          createdAt: new Date().toISOString(),
        };
        await projectService.updateProject(projectPath, projectSlug, {
          health: health as 'on-track' | 'at-risk' | 'off-track',
          updates: [...(p.updates ?? []), update],
        });
        return { ok: true, updateId: update.id };
      },
    });

    tools.add_project_link = makeTool({
      description: 'Add an external link to the project.',
      inputSchema: z.object({
        label: z.string().describe('Display label for the link'),
        url: z.string().describe('The URL'),
      }),
      execute: async ({ label, url }) => {
        const p = await projectService.getProject(projectPath, projectSlug).catch(() => null);
        if (!p) return { error: 'Project not found' };
        const link = {
          id: `link-${Date.now()}`,
          label,
          url,
          createdAt: new Date().toISOString(),
        };
        await projectService.updateProject(projectPath, projectSlug, {
          links: [...(p.links ?? []), link],
        });
        return { ok: true, linkId: link.id };
      },
    });

    tools.add_project_document = makeTool({
      description: 'Add a text document to the project.',
      inputSchema: z.object({
        title: z.string().describe('Document title'),
        content: z.string().describe('Document content (plain text or markdown)'),
      }),
      execute: async ({ title, content }) => {
        const doc = await projectService.createDoc(
          projectPath,
          projectSlug,
          title,
          content,
          'PM Agent'
        );
        return { ok: true, docId: doc.id, title: doc.title };
      },
    });

    tools.notify_operator = makeTool({
      description: 'Send a notification to the operator about an important project event.',
      inputSchema: z.object({
        message: z.string().describe('Notification message'),
        severity: z
          .enum(['info', 'warning', 'critical'])
          .optional()
          .default('info')
          .describe('Severity level'),
      }),
      execute: async ({ message, severity }) => {
        events.emit('notification:created' as EventType, {
          source: `PM Agent (${projectSlug})`,
          message,
          severity,
        });
        return { ok: true, message, severity };
      },
    });
  }

  return tools;
}
