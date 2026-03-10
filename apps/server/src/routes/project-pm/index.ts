/**
 * Project PM Agent Routes
 *
 * POST /api/project-pm/chat — streaming chat with the Project PM agent.
 *   Body: { projectPath, projectSlug, messages }
 *   Uses Vercel AI SDK streamText with PM system prompt and tools from buildPMTools().
 *   PM agent is haiku model, no bash, no file write.
 *
 * POST /api/project-pm/config/get    — load PMConfig for a project
 * POST /api/project-pm/config/update — save PMConfig for a project
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
  type ModelMessage,
} from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { createLogger } from '@protolabsai/utils';
import { resolveModelString } from '@protolabsai/model-resolver';
import type { ProjectPMService } from '../../services/project-pm-service.js';
import type { ProjectService } from '../../services/project-service.js';
import type { CeremonyService } from '../../services/ceremony-service.js';
import type { FeatureLoader } from '../../services/feature-loader.js';
import type { AgentService } from '../../services/agent-service.js';
import type { LeadEngineerService } from '../../services/lead-engineer-service.js';
import type { AutoModeService } from '../../services/auto-mode-service.js';
import type { EventEmitter } from '../../lib/events.js';
import { buildPMTools } from './pm-tools.js';
import { loadPMConfig, savePMConfig } from './pm-config.js';
import type { PMConfig } from './pm-config.js';

const logger = createLogger('ProjectPMRoutes');

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
    '- Control agents and the Lead Engineer for autonomous feature execution',
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
  events: EventEmitter,
  agentService: AgentService,
  leadEngineerService: LeadEngineerService,
  autoModeService: AutoModeService
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
          .filter((f) => (!f.projectSlug || f.projectSlug === projectSlug) && f.status !== 'done')
          .slice(0, 20)
          .map((f) => ({ title: f.title ?? f.id, status: f.status ?? 'unknown' }));
      } catch {
        // Non-fatal
      }

      const systemPrompt = buildPmSystemPrompt({ project, ceremonyStatus, recentFeatures });

      // Load PM config for tool group toggles
      const pmConfig = await loadPMConfig(projectPath).catch(() => null);
      const toolGroupConfig = pmConfig?.toolGroups ?? {};

      // Build the expanded PM tool registry
      const tools = buildPMTools(
        projectPath,
        projectSlug,
        {
          featureLoader,
          agentService,
          leadEngineerService,
          autoModeService,
          projectService,
          events,
        },
        toolGroupConfig
      );

      const resolvedModelId = resolveModelString('haiku', 'haiku');
      const messages: ModelMessage[] = await convertToModelMessages(rawMessages, { tools });

      // Prepend session history so the PM agent has persistent context across page refreshes.
      const session = projectPmService.getOrCreateSession(projectPath, projectSlug);
      const sessionHistory = session.messages.filter((m) => m.role === 'system');
      const allMessages: ModelMessage[] = [...sessionHistory, ...messages];

      logger.info(
        `PM chat request: ${messages.length} user messages + ${sessionHistory.length} session events, project=${projectSlug}, model=haiku, tools=${Object.keys(tools).length}`
      );

      const result = streamText({
        model: anthropic(resolvedModelId),
        system: systemPrompt,
        messages: allMessages,
        tools,
        stopWhen: stepCountIs(10),
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
   * POST /api/project-pm/config/get
   * Body: { projectPath: string }
   */
  router.post('/config/get', async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath?: string };
      if (!projectPath || typeof projectPath !== 'string') {
        res.status(400).json({ success: false, error: { message: 'projectPath is required' } });
        return;
      }
      const config = await loadPMConfig(projectPath);
      res.json({ success: true, config });
    } catch (error) {
      logger.error('Failed to get PM config:', error);
      res.status(500).json({
        success: false,
        error: { message: error instanceof Error ? error.message : 'Unknown error' },
      });
    }
  });

  /**
   * POST /api/project-pm/config/update
   * Body: { projectPath: string, config: Partial<PMConfig> }
   */
  router.post('/config/update', async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, config: configUpdate } = req.body as {
        projectPath?: string;
        config?: Partial<PMConfig>;
      };
      if (!projectPath || typeof projectPath !== 'string') {
        res.status(400).json({ success: false, error: { message: 'projectPath is required' } });
        return;
      }
      if (!configUpdate || typeof configUpdate !== 'object') {
        res.status(400).json({ success: false, error: { message: 'config is required' } });
        return;
      }
      const config = await savePMConfig(projectPath, configUpdate);
      res.json({ success: true, config });
    } catch (error) {
      logger.error('Failed to update PM config:', error);
      res.status(500).json({
        success: false,
        error: { message: error instanceof Error ? error.message : 'Unknown error' },
      });
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
