/**
 * Chat Routes — AI SDK streaming chat endpoint
 *
 * Replaces the CopilotKit runtime with a direct Vercel AI SDK integration.
 * Uses @ai-sdk/anthropic for Claude models with streamText for SSE streaming.
 * Langfuse OTEL tracing is enabled when configured via environment variables.
 */

import { Router, type Request, type Response } from 'express';
import { streamText, type ModelMessage } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { createLogger } from '@automaker/utils';
import { resolveModelString } from '@automaker/model-resolver';
import { selectPersona, buildPersonaPrompt, type NotesContext } from './personas.js';

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

export function createChatRoutes(): Router {
  const router = Router();

  /**
   * POST /api/chat
   *
   * Streaming chat endpoint compatible with @ai-sdk/react useChat hook.
   * Accepts both UIMessage (parts) and ModelMessage (content) formats.
   *
   * Body: { messages: Message[], model?: string, system?: string, context?: { view, projectPath, notesContext? } }
   * Headers: x-model-alias (optional) — override model (haiku|sonnet|opus)
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const {
        messages: rawMessages,
        model: bodyModel,
        system,
        context,
      } = req.body as {
        messages: Array<{
          role: string;
          content?: string;
          parts?: Array<{ type: string; text?: string }>;
        }>;
        model?: string;
        system?: string;
        context?: NotesContext;
      };

      if (!rawMessages || !Array.isArray(rawMessages) || rawMessages.length === 0) {
        res.status(400).json({ error: 'messages array is required' });
        return;
      }

      const messages = toModelMessages(rawMessages);

      // Model selection: header > body > default (sonnet)
      const modelAlias = (req.headers['x-model-alias'] as string) || bodyModel || 'sonnet';

      const aiModel = resolveAISDKModel(modelAlias);

      // Build system prompt — use persona if notes context is provided
      let systemPrompt = system;
      if (!systemPrompt && context?.view === 'notes') {
        const persona = selectPersona(context.activeTabName);
        systemPrompt = buildPersonaPrompt(persona, context);
        logger.info(`Chat persona: ${persona} (tab: "${context.activeTabName}")`);
      }
      if (!systemPrompt) {
        systemPrompt =
          'You are a helpful AI assistant integrated into protoLabs Studio, an autonomous AI development platform. Be concise and technical.';
      }

      logger.info(`Chat request: ${messages.length} messages, model=${modelAlias}`);

      const result = streamText({
        model: aiModel,
        messages,
        system: systemPrompt,
        experimental_telemetry: {
          isEnabled: true,
          metadata: {
            route: '/api/chat',
            modelAlias,
          },
        },
      });

      // Pipe the AI SDK data stream to the response.
      // This uses the AI SDK's built-in SSE format that useChat expects.
      result.pipeTextStreamToResponse(res);
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
