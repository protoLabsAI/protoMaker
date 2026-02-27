/**
 * Chat Routes — AI SDK streaming chat endpoint
 *
 * Replaces the CopilotKit runtime with a direct Vercel AI SDK integration.
 * Uses @ai-sdk/anthropic for Claude models with streamText for SSE streaming.
 * Langfuse OTEL tracing is enabled when configured via environment variables.
 *
 * Per-request enrichment:
 * - Loads AvaConfig from <projectPath>/.automaker/ava-config.json
 * - Injects project context via loadContextFiles when injectContext is true
 * - Injects sitrep from <projectPath>/.automaker/sitrep.md when injectSitrep is true
 * - Passes tools from buildAvaTools with maxSteps: 10
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Router, type Request, type Response } from 'express';
import { streamText, stepCountIs, type ModelMessage, type ToolSet } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { createLogger } from '@protolabs-ai/utils';
import { loadContextFiles } from '@protolabs-ai/utils';
import { resolveModelString } from '@protolabs-ai/model-resolver';
import { buildAvaSystemPrompt, type NotesContext } from './personas.js';
import type { ServiceContainer } from '../../server/services.js';

const logger = createLogger('ChatRoutes');

/**
 * Per-project Ava configuration loaded from .automaker/ava-config.json.
 * All fields are optional with sensible defaults.
 */
export interface AvaConfig {
  /** Override the model for this project (haiku | sonnet | opus) */
  model?: string;
  /** Whether to inject project context files into the system prompt */
  injectContext?: boolean;
  /** Whether to inject the current sitrep into the system prompt */
  injectSitrep?: boolean;
}

/**
 * Load AvaConfig from <projectPath>/.automaker/ava-config.json.
 * Returns an empty config if the file does not exist or is invalid JSON.
 * Errors are silently swallowed so a missing config is a no-op.
 */
async function loadAvaConfig(projectPath: string): Promise<AvaConfig> {
  try {
    const configPath = path.join(projectPath, '.automaker', 'ava-config.json');
    const content = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(content) as AvaConfig;
  } catch {
    return {};
  }
}

/**
 * Read the sitrep from <projectPath>/.automaker/sitrep.md.
 * Returns null if the file does not exist.
 */
async function getSitrep(projectPath: string): Promise<string | null> {
  try {
    const sitrepPath = path.join(projectPath, '.automaker', 'sitrep.md');
    return await fs.readFile(sitrepPath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Build the tool set available to Ava during chat.
 * Currently returns an empty set; extend as Ava tools are added in future features.
 */
export function buildAvaTools(_services: ServiceContainer): ToolSet {
  return {};
}

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

      // Load AvaConfig when a projectPath is available (cached read from disk)
      const avaConfig: AvaConfig = projectPath ? await loadAvaConfig(projectPath) : {};

      // Model selection: AvaConfig.model > header > body > default (sonnet)
      const modelAlias =
        avaConfig.model || (req.headers['x-model-alias'] as string) || bodyModel || 'sonnet';

      const aiModel = resolveAISDKModel(modelAlias);

      // Conditionally load project context files
      let projectContext: string | undefined;
      if (avaConfig.injectContext && projectPath) {
        try {
          const contextResult = await loadContextFiles({ projectPath });
          projectContext = contextResult.formattedPrompt || undefined;
        } catch (err) {
          logger.warn('Failed to load context files:', err);
        }
      }

      // Conditionally fetch sitrep
      let sitrep: string | undefined;
      if (avaConfig.injectSitrep && projectPath) {
        const sitrepText = await getSitrep(projectPath);
        sitrep = sitrepText ?? undefined;
      }

      // Build Ava system prompt — enriched with project context and sitrep when available
      const systemPrompt =
        system ??
        buildAvaSystemPrompt({
          ctx: context,
          projectContext,
          sitrep,
        });

      // Build tool set for this request
      const tools = buildAvaTools(services);

      logger.info(
        `Chat request: ${messages.length} messages, model=${modelAlias}, projectPath=${projectPath ?? 'none'}, injectContext=${avaConfig.injectContext ?? false}, injectSitrep=${avaConfig.injectSitrep ?? false}`
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
