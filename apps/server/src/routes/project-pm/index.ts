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
import type { EventEmitter } from '../../lib/events.js';
import type { EventType } from '@protolabsai/types';

const logger = createLogger('ProjectPMRoutes');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeTool<TSchema extends z.ZodType<any>>(config: {
  description: string;
  inputSchema: TSchema;
  execute: (input: z.infer<TSchema>) => Promise<unknown>;
}): Tool {
  return config as unknown as Tool;
}

function buildPmSystemPrompt(opts: {
  project: {
    title?: string;
    goal?: string;
    prd?: { situation?: string; problem?: string; approach?: string };
  } | null;
  ceremonyStatus: { phase?: string; lastStandup?: string; lastRetro?: string } | null;
  recentFeatures: Array<{ title: string; status: string }>;
}): string {
  const { project, ceremonyStatus, recentFeatures } = opts;

  const parts: string[] = [
    'You are the Project PM Agent for this software project. Your role is to:',
    '- Track project health and surface risks',
    '- Answer questions about project status, features, and ceremonies',
    '- Create status updates and manage project documentation',
    '- Coordinate ceremonies (standups, retros) when appropriate',
    '- Notify the operator about important project events',
    '',
    'You do NOT have access to the file system or bash. Use the provided tools to interact with project data.',
  ];

  if (project) {
    parts.push('', `## Project: ${project.title ?? 'Unknown'}`, `**Goal:** ${project.goal ?? ''}`);
    if (project.prd) {
      if (project.prd.situation) parts.push(`**Situation:** ${project.prd.situation}`);
      if (project.prd.problem) parts.push(`**Problem:** ${project.prd.problem}`);
      if (project.prd.approach) parts.push(`**Approach:** ${project.prd.approach}`);
    }
  }

  if (ceremonyStatus) {
    parts.push('', '## Ceremony State');
    if (ceremonyStatus.phase) parts.push(`**Current Phase:** ${ceremonyStatus.phase}`);
    if (ceremonyStatus.lastStandup) parts.push(`**Last Standup:** ${ceremonyStatus.lastStandup}`);
    if (ceremonyStatus.lastRetro) parts.push(`**Last Retro:** ${ceremonyStatus.lastRetro}`);
  }

  if (recentFeatures.length > 0) {
    parts.push('', '## Recent Feature Statuses');
    for (const f of recentFeatures.slice(0, 20)) {
      parts.push(`- ${f.title} (${f.status})`);
    }
  }

  return parts.join('\n');
}

export function createProjectPmRoutes(
  projectPmService: ProjectPMService,
  projectService: ProjectService,
  ceremonyService: CeremonyService,
  featureLoader: FeatureLoader,
  events: EventEmitter
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
            lastStandup: state.lastStandup || undefined,
            lastRetro: state.lastRetro || undefined,
          };
        } catch {
          return null;
        }
      })();

      let recentFeatures: Array<{ title: string; status: string }> = [];
      try {
        const features = await featureLoader.getAll(projectPath);
        recentFeatures = features
          .filter((f) => f.status !== 'done')
          .slice(0, 20)
          .map((f) => ({ title: f.title ?? f.id, status: f.status ?? 'unknown' }));
      } catch {
        // Non-fatal
      }

      const systemPrompt = buildPmSystemPrompt({ project, ceremonyStatus, recentFeatures });

      // PM inline tools (ai v6: use inputSchema not parameters)
      const tools: Record<string, Tool> = {
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
            events.emit('ceremony:trigger-requested' as EventType, {
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
            events.emit('notification:created' as EventType, {
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
