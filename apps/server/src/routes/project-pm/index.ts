/**
 * Project PM Agent Routes
 *
 * POST /api/project-pm/chat — streaming chat with the Project PM agent.
 *   Body: { projectPath, projectSlug, messages }
 *   Headers: x-model-alias (optional) — override model (haiku|sonnet|opus)
 *   Uses Vercel AI SDK streamText with PM system prompt and inline tools.
 *   PM agent defaults to sonnet model; supports extended thinking on sonnet/opus.
 *
 * GET /api/project-pm/sessions — returns all active PM sessions.
 * GET /api/project-pm/session/:slug — returns session history + ceremony state.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Router, type Request, type Response } from 'express';
import {
  streamText,
  stepCountIs,
  createUIMessageStream,
  pipeUIMessageStreamToResponse,
  convertToModelMessages,
  type UIMessage,
  type Tool,
  type ModelMessage,
} from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { createLogger } from '@protolabsai/utils';
import { resolveModelString } from '@protolabsai/model-resolver';
import type { ProjectPMService } from '../../services/project-pm-service.js';
import type { ProjectService } from '../../services/project-service.js';
import type { CeremonyService } from '../../services/ceremony-service.js';
import type { FeatureLoader } from '../../services/feature-loader.js';
import type { LeadEngineerService } from '../../services/lead-engineer-service.js';
import type { EventEmitter } from '../../lib/events.js';
import { buildCeremonyTools } from './pm-tools.js';

const logger = createLogger('ProjectPMRoutes');

/** Approximate token count: ~4 chars per token */
const MAX_PROMPT_CHARS = 16_000; // ~4k tokens

/** Resolve __dirname in ESM context */
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * PM prompt template — loaded once at startup.
 * The template's static preamble section drives the agent persona.
 * Dynamic sections are built programmatically below and appended after
 * the preamble lines (everything up to and including the first blank line
 * after the constraints statement).
 */
const _PM_PROMPT_PREAMBLE = (() => {
  // Build step copies .md files from src/ to dist/, so __dirname works everywhere.
  const template = readFileSync(path.join(__dirname, 'pm-prompt.md'), 'utf-8');
  // Extract the static preamble: lines up to and including the constraints line
  const lines = template.split('\n');
  const cutoff = lines.findIndex((l) => l.startsWith('You do NOT have access'));
  return cutoff >= 0 ? lines.slice(0, cutoff + 1).join('\n') : lines.slice(0, 7).join('\n');
})();

/**
 * Truncate a string to at most `maxChars`, appending a truncation note if needed.
 */
function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return value.slice(0, maxChars) + ' … [truncated]';
}

/**
 * Render the PM system prompt from template + context data.
 * Uses a lightweight conditional/loop mini-renderer (no external deps).
 * Enforces MAX_PROMPT_CHARS total budget.
 */
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
  ceremonyStatus: {
    phase?: string;
    currentMilestone?: string;
    lastStandup?: string;
    lastRetro?: string;
    standupCadence?: string;
  } | null;
  activeFeatures: Array<{ title: string; status: string; epicId?: string }>;
  leadState: {
    activeCount: number;
    activeSessions: Array<{ featureId: string; startedAt: string }>;
  } | null;
}): string {
  const { project, ceremonyStatus, activeFeatures, leadState } = opts;

  const parts: string[] = [];

  // ── Static preamble (sourced from pm-prompt.md template) ──────────────────
  parts.push(_PM_PROMPT_PREAMBLE);

  // ── Project overview ────────────────────────────────────────────────────────
  if (project) {
    parts.push('', `## Project: ${project.title ?? 'Unknown'}`);
    if (project.goal) parts.push(`**Goal:** ${truncate(project.goal, 500)}`);
    if (project.health) parts.push(`**Health:** ${project.health}`);
    if (project.status) parts.push(`**Status:** ${project.status}`);
    if (project.lead) parts.push(`**Lead:** ${project.lead}`);
    if (project.targetDate) parts.push(`**Target Date:** ${project.targetDate}`);

    // PRD summary
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

    // Milestones
    if (project.milestones && project.milestones.length > 0) {
      parts.push('', '## Milestones');
      for (const m of project.milestones) {
        const due = m.targetDate ? ` — due ${m.targetDate}` : '';
        parts.push(`- **M${m.number}: ${m.title}** (${m.status})${due}`);
      }
    }

    // Recent timeline (last 5 updates)
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

  // ── Ceremony state ──────────────────────────────────────────────────────────
  if (ceremonyStatus) {
    parts.push('', '## Ceremony State');
    if (ceremonyStatus.phase) parts.push(`**Current Phase:** ${ceremonyStatus.phase}`);
    if (ceremonyStatus.currentMilestone)
      parts.push(`**Active Milestone:** ${ceremonyStatus.currentMilestone}`);
    if (ceremonyStatus.lastStandup) parts.push(`**Last Standup:** ${ceremonyStatus.lastStandup}`);
    if (ceremonyStatus.lastRetro) parts.push(`**Last Retro:** ${ceremonyStatus.lastRetro}`);
    if (ceremonyStatus.standupCadence)
      parts.push(`**Standup Cadence:** ${ceremonyStatus.standupCadence}`);
  }

  // ── Ceremony cadence schedule ──────────────────────────────────────────────
  if (project?.cadence) {
    const cadence = project.cadence;
    parts.push('', '## Ceremony Schedule');
    parts.push(
      `**Standup Frequency:** ${cadence.standupFrequency ?? 'daily'}`,
      `**Retro Frequency:** ${cadence.retroFrequency ?? 'per-milestone'}`
    );
    if (cadence.lastStandupAt) {
      parts.push(`**Last Standup:** ${cadence.lastStandupAt.slice(0, 10)}`);
    }
    if (cadence.lastRetroAt) {
      parts.push(`**Last Retro:** ${cadence.lastRetroAt.slice(0, 10)}`);
    }

    // Compute next standup due date based on frequency
    const standupFreq = cadence.standupFrequency ?? 'daily';
    const lastStandupDate = cadence.lastStandupAt ? new Date(cadence.lastStandupAt) : null;
    if (lastStandupDate) {
      const nextStandup = new Date(lastStandupDate);
      if (standupFreq === 'daily') {
        nextStandup.setDate(nextStandup.getDate() + 1);
      } else if (standupFreq === 'weekly') {
        nextStandup.setDate(nextStandup.getDate() + 7);
      }
      if (standupFreq !== 'never') {
        parts.push(`**Next Standup Due:** ${nextStandup.toISOString().slice(0, 10)}`);
      }
    } else if (standupFreq !== 'never') {
      parts.push(`**Next Standup Due:** today (no standup on record)`);
    }

    // Compute next retro due date based on frequency
    const retroFreq = cadence.retroFrequency ?? 'per-milestone';
    const lastRetroDate = cadence.lastRetroAt ? new Date(cadence.lastRetroAt) : null;
    if (retroFreq === 'weekly' || retroFreq === 'monthly') {
      if (lastRetroDate) {
        const nextRetro = new Date(lastRetroDate);
        if (retroFreq === 'weekly') {
          nextRetro.setDate(nextRetro.getDate() + 7);
        } else {
          nextRetro.setMonth(nextRetro.getMonth() + 1);
        }
        parts.push(`**Next Retro Due:** ${nextRetro.toISOString().slice(0, 10)}`);
      } else {
        parts.push(`**Next Retro Due:** as soon as possible (no retro on record)`);
      }
    } else if (retroFreq === 'per-milestone') {
      parts.push(`**Next Retro Due:** at end of current milestone`);
    }
  }

  // ── Active features (non-done, capped at 15) ────────────────────────────────
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

  // ── Lead Engineer state ─────────────────────────────────────────────────────
  if (leadState && leadState.activeCount > 0) {
    parts.push('', '## Lead Engineer State');
    parts.push(`**Active Sessions:** ${leadState.activeCount}`);
    for (const s of leadState.activeSessions.slice(0, 5)) {
      parts.push(`- Feature \`${s.featureId}\` — started ${s.startedAt}`);
    }
  }

  const prompt = parts.join('\n');

  // Enforce token budget (~4k tokens ≈ 16k chars)
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

export function createProjectPmRoutes(
  projectPmService: ProjectPMService,
  projectService: ProjectService,
  ceremonyService: CeremonyService,
  featureLoader: FeatureLoader,
  events: EventEmitter,
  leadEngineerService?: LeadEngineerService
): Router {
  const router = Router();

  /**
   * POST /api/project-pm/chat
   *
   * Streaming PM chat endpoint.
   * Body: { projectPath: string, projectSlug: string, messages: UIMessage[] }
   */
  router.post('/chat', async (req: Request, res: Response) => {
    try {
      const {
        projectPath,
        projectSlug,
        messages: rawMessages,
      } = req.body as {
        projectPath: string;
        projectSlug: string;
        messages: UIMessage[];
      };

      if (!projectPath || !projectSlug) {
        res.status(400).json({ error: 'projectPath and projectSlug are required' });
        return;
      }
      if (!rawMessages || !Array.isArray(rawMessages) || rawMessages.length === 0) {
        res.status(400).json({ error: 'messages array is required' });
        return;
      }

      // Load project data for system prompt
      const project = await projectService.getProject(projectPath, projectSlug).catch(() => null);

      const ceremonyStatus = await (async () => {
        try {
          const state = await ceremonyService.getCeremonyState(projectPath, projectSlug);
          return {
            phase: state.phase,
            currentMilestone: state.currentMilestone,
            lastStandup: state.lastStandup || undefined,
            lastRetro: state.lastRetro || undefined,
            standupCadence: state.standupCadence,
          };
        } catch {
          return null;
        }
      })();

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

      // Lead Engineer state: report how many features are actively in-progress
      const leadState = (() => {
        if (!leadEngineerService) return null;
        if (!leadEngineerService.isManaged(projectPath)) return null;
        const activeCount = activeFeatures.filter((f) => f.status === 'in_progress').length;
        return {
          activeCount,
          activeSessions: [] as Array<{ featureId: string; startedAt: string }>,
        };
      })();

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
        ceremonyStatus,
        activeFeatures,
        leadState,
      });

      // PM inline tools (ai v6: use inputSchema not parameters)
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

        add_link: makeTool({
          description: 'Add an external link to the project.',
          inputSchema: z.object({
            label: z.string().describe('Display label for the link'),
            url: z.string().describe('The URL to link to'),
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
        }),

        add_document: makeTool({
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

      // Model selection: x-model-alias header > default (sonnet)
      const modelAlias = (req.headers['x-model-alias'] as string) || 'sonnet';
      const resolvedModelId = resolveModelString(modelAlias, 'sonnet');
      const extendedThinking =
        resolvedModelId.includes('opus') || resolvedModelId.includes('sonnet');

      const messages: ModelMessage[] = await convertToModelMessages(rawMessages, { tools });

      // Prepend session history (system event messages from feature completions, etc.)
      // so the PM agent has persistent context across page refreshes.
      const session = projectPmService.getOrCreateSession(projectPath, projectSlug);
      const sessionHistory = session.messages.filter((m) => m.role === 'system');
      const allMessages: ModelMessage[] = [...sessionHistory, ...messages];

      logger.info(
        `PM chat request: ${messages.length} user messages + ${sessionHistory.length} session events, project=${projectSlug}, model=${modelAlias}, extendedThinking=${extendedThinking}`
      );

      const result = streamText({
        model: anthropic(resolvedModelId),
        system: systemPrompt,
        messages: allMessages,
        tools,
        stopWhen: stepCountIs(5),
        ...(extendedThinking && {
          providerOptions: {
            anthropic: {
              thinking: { type: 'enabled', budgetTokens: 10_000 },
            },
          },
        }),
        experimental_telemetry: {
          isEnabled: true,
          metadata: { route: '/api/project-pm/chat', projectSlug },
        },
      });

      const uiStream = createUIMessageStream({
        execute: async ({ writer }) => {
          writer.merge(result.toUIMessageStream());

          // Persist assistant response to session history
          try {
            const text = await result.text;
            if (text) {
              projectPmService.appendMessages(projectPath, projectSlug, [
                { role: 'assistant', content: text },
              ]);
            }
          } catch {
            // Non-fatal
          }
        },
        onError: (err) => {
          logger.error('PM chat stream error:', err);
          return err instanceof Error ? err.message : 'Stream error';
        },
      });

      pipeUIMessageStreamToResponse({ response: res, stream: uiStream });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('PM chat error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: message });
      } else {
        res.end();
      }
    }
  });

  /**
   * GET /api/project-pm/sessions
   *
   * Returns all active PM sessions (summary, no full message history).
   */
  router.get('/sessions', (_req: Request, res: Response) => {
    const sessions = projectPmService.listSessions().map((s) => ({
      projectPath: s.projectPath,
      projectSlug: s.projectSlug,
      messageCount: s.messages.length,
      createdAt: s.createdAt,
      lastActiveAt: s.lastActiveAt,
    }));
    res.json({ sessions });
  });

  /**
   * GET /api/project-pm/session/:slug
   *
   * Returns full session history + ceremony state for a project slug.
   * Query param: projectPath (required)
   */
  router.get('/session/:slug', async (req: Request, res: Response) => {
    const { slug } = req.params as { slug: string };
    const { projectPath } = req.query as { projectPath?: string };

    if (!projectPath) {
      res.status(400).json({ error: 'projectPath query parameter is required' });
      return;
    }

    const session = projectPmService.getSession(projectPath, slug);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    let ceremonyState: unknown = null;
    try {
      ceremonyState = await ceremonyService.getCeremonyState(projectPath, slug);
    } catch {
      // Non-fatal
    }

    res.json({ session, ceremonyState });
  });

  return router;
}
