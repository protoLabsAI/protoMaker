/**
 * PM Agent - Standalone one-shot query interface for the Project PM.
 *
 * Exports queryPm() for direct function-call delegation from Ava.
 * Uses generateText (non-streaming) with the same system prompt and tools
 * as the streaming PM chat endpoint.
 */

import { generateText, stepCountIs, type ModelMessage, type Tool } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { createLogger } from '@protolabsai/utils';
import { resolveModelString } from '@protolabsai/model-resolver';
import type { ProjectService } from '../../services/project-service.js';
import type { CeremonyService } from '../../services/ceremony-service.js';
import type { FeatureLoader } from '../../services/feature-loader.js';
import type { EventEmitter } from '../../lib/events.js';
import { buildCeremonyTools } from './pm-tools.js';

const logger = createLogger('PMAgent');

/** Approximate token count: ~4 chars per token */
const MAX_PROMPT_CHARS = 16_000;

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return value.slice(0, maxChars) + ' … [truncated]';
}

/** Re-uses the same prompt-building logic as the streaming PM route. */
function buildPmSystemPrompt(opts: {
  project: {
    slug?: string;
    title?: string;
    goal?: string;
    health?: string;
    status?: string;
    lead?: string;
    targetDate?: string;
    cadence?: {
      standupFrequency?: string;
      retroFrequency?: string;
      lastStandupAt?: string;
      lastRetroAt?: string;
    };
    prd?: {
      situation?: string;
      problem?: string;
      approach?: string;
      results?: string;
      constraints?: string;
    };
    milestones?: Array<{
      number: number;
      slug: string;
      title: string;
      status: string;
      targetDate?: string;
    }>;
    updates?: Array<{ health: string; body: string; author: string; createdAt: string }>;
  } | null;
  activeFeatures: Array<{ title: string; status: string; epicId?: string }>;
}): string {
  const { project, activeFeatures } = opts;
  const parts: string[] = [
    'You are the Project Manager (PM) for this project. Answer questions concisely and accurately.',
  ];

  if (project) {
    parts.push('', `## Project: ${project.title ?? 'Unknown'}`);
    if (project.goal) parts.push(`**Goal:** ${truncate(project.goal, 500)}`);
    if (project.health) parts.push(`**Health:** ${project.health}`);
    if (project.status) parts.push(`**Status:** ${project.status}`);
    if (project.lead) parts.push(`**Lead:** ${project.lead}`);
    if (project.targetDate) parts.push(`**Target Date:** ${project.targetDate}`);

    if (project.prd) {
      parts.push('', '### PRD Summary');
      if (project.prd.situation)
        parts.push(`**Situation:** ${truncate(project.prd.situation, 400)}`);
      if (project.prd.problem) parts.push(`**Problem:** ${truncate(project.prd.problem, 400)}`);
      if (project.prd.approach) parts.push(`**Approach:** ${truncate(project.prd.approach, 400)}`);
      if (project.prd.results)
        parts.push(`**Expected Results:** ${truncate(project.prd.results, 300)}`);
      if (project.prd.constraints)
        parts.push(`**Constraints:** ${truncate(project.prd.constraints, 300)}`);
    }

    if (project.milestones && project.milestones.length > 0) {
      parts.push('', '## Milestones');
      for (const m of project.milestones) {
        const due = m.targetDate ? ` — due ${m.targetDate}` : '';
        parts.push(`- **M${m.number}: ${m.title}** (${m.status})${due}`);
      }
    }

    if (project.updates && project.updates.length > 0) {
      const recent = project.updates.slice(-5);
      parts.push('', '## Recent Timeline');
      for (const u of recent) {
        const date = u.createdAt ? u.createdAt.slice(0, 10) : '';
        parts.push(
          `- [${u.health}] ${truncate(u.body, 200)} — ${u.author}${date ? `, ${date}` : ''}`
        );
      }
    }
  }

  if (activeFeatures.length > 0) {
    parts.push('', '## Active Features');
    for (const f of activeFeatures.slice(0, 15)) {
      const epicNote = f.epicId ? ` (epic: ${f.epicId})` : '';
      parts.push(`- **${f.title}** — ${f.status}${epicNote}`);
    }
    if (activeFeatures.length > 15) {
      parts.push(`… and ${activeFeatures.length - 15} more.`);
    }
  }

  const prompt = parts.join('\n');
  if (prompt.length > MAX_PROMPT_CHARS) {
    return (
      prompt.slice(0, MAX_PROMPT_CHARS) + '\n\n… [prompt truncated to stay within token budget]'
    );
  }
  return prompt;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeTool<TSchema extends z.ZodType<any>>(config: {
  description: string;
  inputSchema: TSchema;
  execute: (input: z.infer<TSchema>) => Promise<unknown>;
}): Tool {
  return config as unknown as Tool;
}

export interface QueryPmDeps {
  projectPath: string;
  projectService: ProjectService;
  ceremonyService: CeremonyService;
  featureLoader: FeatureLoader;
  /** Minimal interface: only getOrCreateSession is required. */
  projectPmService: {
    getOrCreateSession(
      projectPath: string,
      projectSlug: string
    ): {
      messages: Array<{ role: string; content: unknown }>;
      projectSlug: string;
      createdAt: string;
    };
  };
  events: EventEmitter;
}

/**
 * One-shot PM query — called directly by Ava's delegate_to_pm tool.
 *
 * Loads project context, builds the PM system prompt, and runs a single
 * generateText call (non-streaming) with the full PM tool surface.
 * Returns the PM's text response.
 */
export async function queryPm(
  deps: QueryPmDeps,
  projectSlug: string,
  question: string
): Promise<string> {
  const { projectPath, projectService, ceremonyService, featureLoader, projectPmService, events } =
    deps;

  // Load project data
  const project = await projectService.getProject(projectPath, projectSlug).catch(() => null);

  let activeFeatures: Array<{ title: string; status: string; epicId?: string }> = [];
  try {
    const features = await featureLoader.getAll(projectPath);
    activeFeatures = features
      .filter((f) => f.status !== 'done' && f.projectSlug === projectSlug)
      .map((f) => ({
        title: f.title ?? f.id,
        status: f.status ?? 'unknown',
        epicId: f.epicId,
      }));
  } catch {
    // Non-fatal
  }

  const systemPrompt = buildPmSystemPrompt({
    project: project
      ? {
          slug: project.slug,
          title: project.title,
          goal: project.goal,
          health: project.health,
          status: project.status,
          lead: project.lead,
          targetDate: project.targetDate,
          cadence: project.cadence
            ? {
                standupFrequency: project.cadence.standupFrequency,
                retroFrequency: project.cadence.retroFrequency,
                lastStandupAt: project.cadence.lastStandupAt,
                lastRetroAt: project.cadence.lastRetroAt,
              }
            : undefined,
          prd: project.prd
            ? {
                situation: project.prd.situation,
                problem: project.prd.problem,
                approach: project.prd.approach,
                results: project.prd.results,
                constraints: project.prd.constraints,
              }
            : undefined,
          milestones: project.milestones?.map((m) => ({
            number: m.number,
            slug: m.slug,
            title: m.title,
            status: m.status,
            targetDate: m.targetDate,
          })),
          updates: project.updates,
        }
      : null,
    activeFeatures,
  });

  const tools: Record<string, Tool> = {
    ...buildCeremonyTools(projectPath, projectSlug),
    get_project_status: makeTool({
      description: 'Get the current project status, health, and key metrics.',
      inputSchema: z.object({}),
      execute: async () => {
        const p = await projectService.getProject(projectPath, projectSlug).catch(() => null);
        if (!p) return { error: 'Project not found' };
        return {
          title: p.title,
          status: p.status,
          health: p.health,
          goal: p.goal,
          milestoneCount: p.milestones?.length ?? 0,
          updatedAt: p.updatedAt,
        };
      },
    }),

    get_ceremony_state: makeTool({
      description:
        'Get the current ceremony phase, transition history, and cadence for this project.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const state = await ceremonyService.getCeremonyState(projectPath, projectSlug);
          return {
            phase: state.phase,
            currentMilestone: state.currentMilestone ?? null,
            lastStandup: state.lastStandup || null,
            lastRetro: state.lastRetro || null,
            standupCadence: state.standupCadence,
            transitionCount: state.history.length,
            recentTransitions: state.history.slice(-5),
          };
        } catch {
          return { error: 'Ceremony state unavailable' };
        }
      },
    }),

    trigger_ceremony: makeTool({
      description: 'Trigger a ceremony (standup or retro) for the project.',
      inputSchema: z.object({
        ceremonyType: z
          .enum(['standup', 'retro', 'project-retro'])
          .describe('The type of ceremony to trigger'),
        milestoneSlug: z
          .string()
          .optional()
          .describe('Milestone slug (required for retro and project-retro)'),
      }),
      execute: async ({ ceremonyType, milestoneSlug }) => {
        events.emit('ceremony:trigger-requested', {
          projectPath,
          projectSlug,
          ceremonyType,
          milestoneSlug,
        });
        return { ok: true, ceremonyType, milestoneSlug };
      },
    }),

    list_features: makeTool({
      description: 'List features on the project board, optionally filtered by status.',
      inputSchema: z.object({
        status: z
          .enum(['backlog', 'in_progress', 'review', 'blocked', 'done'])
          .optional()
          .describe('Filter by feature status'),
      }),
      execute: async ({ status }) => {
        const features = await featureLoader.getAll(projectPath);
        const filtered = status ? features.filter((f) => f.status === status) : features;
        return filtered.slice(0, 50).map((f) => ({
          id: f.id,
          title: f.title ?? f.id,
          status: f.status ?? 'unknown',
          complexity: f.complexity,
        }));
      },
    }),

    create_status_update: makeTool({
      description: 'Post a status update to the project timeline.',
      inputSchema: z.object({
        health: z
          .enum(['on-track', 'at-risk', 'off-track'])
          .describe('Current health of the project'),
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
    }),

    notify_operator: makeTool({
      description: 'Send a notification to the operator about an important project event.',
      inputSchema: z.object({
        message: z.string().describe('The notification message'),
        severity: z
          .enum(['info', 'warning', 'critical'])
          .optional()
          .default('info')
          .describe('Severity level'),
      }),
      execute: async ({ message, severity }) => {
        events.emit('notification:created', {
          source: `PM Agent (${projectSlug})`,
          message,
          severity,
        });
        return { ok: true, message, severity };
      },
    }),
  };

  const resolvedModelId = resolveModelString('sonnet');

  // Prepend session history for context continuity
  const session = projectPmService.getOrCreateSession(projectPath, projectSlug);
  const sessionHistory = session.messages.filter((m) => m.role === 'system');

  logger.info(`PM delegation query: projectSlug=${projectSlug}`);

  const result = await generateText({
    model: anthropic(resolvedModelId),
    system: systemPrompt,
    messages: [
      ...(sessionHistory.map((m) => ({
        role: m.role,
        content: (m.content as string) ?? '',
      })) as ModelMessage[]),
      { role: 'user' as const, content: question },
    ],
    tools,
    stopWhen: stepCountIs(5),
    providerOptions: {
      anthropic: {
        thinking: { type: 'enabled', budgetTokens: 10_000 },
      },
    },
    experimental_telemetry: {
      isEnabled: true,
      metadata: { route: 'delegate_to_pm', projectSlug },
    },
  });

  return result.text;
}
