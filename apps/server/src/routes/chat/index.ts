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

const logger = createLogger('ChatRoutes');

/** Map our internal aliases to AI SDK model IDs */
function resolveAISDKModel(modelAlias?: string) {
  const resolved = resolveModelString(modelAlias, 'sonnet');
  return anthropic(resolved);
}

export function createChatRoutes(): Router {
  const router = Router();

  /**
   * POST /api/chat
   *
   * Streaming chat endpoint compatible with @ai-sdk/react useChat hook.
   * Accepts the standard AI SDK message format and returns an SSE stream.
   *
   * Body: { messages: CoreMessage[], model?: string, system?: string }
   * Headers: x-model-alias (optional) — override model (haiku|sonnet|opus)
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const {
        messages,
        model: bodyModel,
        system,
      } = req.body as {
        messages: ModelMessage[];
        model?: string;
        system?: string;
      };

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: 'messages array is required' });
        return;
      }

      // Model selection: header > body > default (sonnet)
      const modelAlias = (req.headers['x-model-alias'] as string) || bodyModel || 'sonnet';

      const aiModel = resolveAISDKModel(modelAlias);

      logger.info(`Chat request: ${messages.length} messages, model=${modelAlias}`);

      const result = streamText({
        model: aiModel,
        messages,
        system:
          system ||
          'You are a helpful AI assistant integrated into protoLabs Studio, an autonomous AI development platform. Be concise and technical.',
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
