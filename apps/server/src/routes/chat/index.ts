/**
 * Chat Routes — AI SDK streaming chat endpoint
 *
 * Replaces the CopilotKit runtime with a direct Vercel AI SDK integration.
 * Uses @ai-sdk/anthropic for Claude models with streamText for SSE streaming.
 * Langfuse OTEL tracing is enabled when configured via environment variables.
 *
 * Per-request enrichment:
 * - Loads AvaConfig from <projectPath>/.automaker/ava-config.json
 * - Injects project context via loadContextFiles when contextInjection is true
 * - Fetches a live sitrep via getSitrep() when sitrepInjection is true
 * - Builds tool set from buildAvaTools() gated by config.toolGroups
 * - Passes tools to streamText with maxSteps: 10
 */

import { Router, type Request, type Response } from 'express';
import { streamText, stepCountIs, type ModelMessage } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { createLogger, loadContextFiles } from '@protolabs-ai/utils';
import { resolveModelString } from '@protolabs-ai/model-resolver';
import { buildAvaSystemPrompt, type NotesContext } from './personas.js';
import { loadAvaConfig, DEFAULT_AVA_CONFIG, type AvaConfig } from './ava-config.js';
import { getSitrep } from './sitrep.js';
import { buildAvaTools } from './ava-tools.js';
import type { ServiceContainer } from '../../server/services.js';

export type { AvaConfig };

const logger = createLogger('ChatRoutes');

/** Map our internal aliases to AI SDK model IDs */
function resolveAISDKModel(modelAlias?: string) {
  const resolved = resolveModelString(modelAlias, 'sonnet');
  return anthropic(resolved);
}

/**
 * Convert UIMessage format (from useChat) to ModelMessage format (for streamText).
 * useChat sends: { role, parts: [{ type: "text", text: "..." }] }
 * streamText expects: { role, content: "..." }
 */
function toModelMessages(
  messages: Array<{
    role: string;
    content?: string;
    parts?: Array<{ type: string; text?: string }>;
  }>
): ModelMessage[] {
  return messages.map((msg) => {
    // If content already exists, use it directly (standard format)
    if (typeof msg.content === 'string') {
      return { role: msg.role, content: msg.content } as ModelMessage;
    }
    // Convert parts format to content string
    const text =
      msg.parts
        ?.filter((p) => p.type === 'text' && p.text)
        .map((p) => p.text)
        .join('') || '';
    return { role: msg.role, content: text } as ModelMessage;
  });
}

export function createChatRoutes(services: ServiceContainer): Router {
  const router = Router();

  /**
   * POST /api/chat
   *
   * Streaming chat endpoint compatible with @ai-sdk/react useChat hook.
   * Accepts both UIMessage (parts) and ModelMessage (content) formats.
   *
   * Body: { messages: Message[], model?: string, system?: string, projectPath?: string, context?: { view, projectPath, notesContext? } }
   * Headers: x-model-alias (optional) — override model (haiku|sonnet|opus)
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const {
        messages: rawMessages,
        model: bodyModel,
        system,
        context,
        projectPath,
      } = req.body as {
        messages: Array<{
          role: string;
          content?: string;
          parts?: Array<{ type: string; text?: string }>;
        }>;
        model?: string;
        system?: string;
        context?: NotesContext;
        projectPath?: string;
      };

      if (!rawMessages || !Array.isArray(rawMessages) || rawMessages.length === 0) {
        res.status(400).json({ error: 'messages array is required' });
        return;
      }

      const messages = toModelMessages(rawMessages);

      // Load AvaConfig when a projectPath is available; fall back to defaults
      const avaConfig: AvaConfig = projectPath
        ? await loadAvaConfig(projectPath)
        : { ...DEFAULT_AVA_CONFIG, toolGroups: { ...DEFAULT_AVA_CONFIG.toolGroups } };

      // Model selection: AvaConfig.model > header > body > default (sonnet)
      const modelAlias =
        avaConfig.model || (req.headers['x-model-alias'] as string) || bodyModel || 'sonnet';

      const aiModel = resolveAISDKModel(modelAlias);

      // Conditionally load project context files
      let projectContext: string | undefined;
      if (avaConfig.contextInjection && projectPath) {
        try {
          const contextResult = await loadContextFiles({ projectPath });
          projectContext = contextResult.formattedPrompt || undefined;
        } catch (err) {
          logger.warn('Failed to load context files:', err);
        }
      }

      // Conditionally fetch live sitrep
      let sitrep: string | undefined;
      if (avaConfig.sitrepInjection && projectPath) {
        try {
          sitrep = await getSitrep(projectPath);
        } catch (err) {
          logger.warn('Failed to generate sitrep:', err);
        }
      }

      // Build Ava system prompt — enriched with project context, sitrep, and extension
      const systemPrompt =
        system ??
        buildAvaSystemPrompt({
          ctx: context,
          projectContext,
          sitrep,
          extension: avaConfig.systemPromptExtension || undefined,
        });

      // Build tool set for this request — gated by per-project toolGroups config
      const tools = projectPath
        ? buildAvaTools(
            projectPath,
            {
              featureLoader: services.featureLoader,
              autoModeService: services.autoModeService,
              agentService: services.agentService,
            },
            avaConfig.toolGroups
          )
        : {};

      logger.info(
        `Chat request: ${messages.length} messages, model=${modelAlias}, projectPath=${projectPath ?? 'none'}, contextInjection=${avaConfig.contextInjection}, sitrepInjection=${avaConfig.sitrepInjection}`
      );

      const result = streamText({
        model: aiModel,
        messages,
        system: systemPrompt,
        tools,
        stopWhen: stepCountIs(10),
        experimental_telemetry: {
          isEnabled: true,
          metadata: {
            route: '/api/chat',
            modelAlias,
          },
        },
      });

      // Pipe the full AI SDK UI message stream to the response.
      // Uses the AI SDK's UI message stream protocol so tool calls, reasoning,
      // and source parts flow through to the client (not just text tokens).
      result.pipeUIMessageStreamToResponse(res);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Chat stream error:', error);

      // If headers already sent (mid-stream error), we can't send JSON
      if (res.headersSent) {
        res.end();
        return;
      }

      res.status(500).json({ error: message });
    }
  });

  return router;
}
