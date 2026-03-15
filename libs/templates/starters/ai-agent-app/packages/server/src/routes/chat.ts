/**
 * POST /api/chat — Streaming chat endpoint.
 *
 * Powered by the Vercel AI SDK (`ai` + `@ai-sdk/anthropic`).
 *
 * Request body:
 *   {
 *     messages:  ModelMessage[]   — conversation history (required)
 *     model?:    string          — model alias or full ID (default: env MODEL or claude-opus-4-6)
 *     system?:   string          — system prompt override
 *     maxSteps?: number          — max agent loop iterations (default: 5)
 *   }
 *
 * Response:
 *   text/event-stream  — Vercel AI SDK UI message stream, compatible with `useChat`.
 *
 * Multi-step agentic loop:
 *   Claude may call tools across multiple steps. `stepCountIs(maxSteps)` stops the
 *   loop after the specified number of steps, preventing runaway inference.
 *
 * Tool support:
 *   Define tools below. Each tool is executed server-side and its result is streamed
 *   back within the same response so the client stays in sync with every step.
 */

import { Router, type Request, type Response } from 'express';
import {
  streamText,
  createUIMessageStream,
  pipeUIMessageStreamToResponse,
  stepCountIs,
  tool,
  type ModelMessage,
} from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { traceStore } from '../tracing/trace-store.js';
import { buildTrace, type StepData } from '../tracing/build-trace.js';

const router = Router();

// ─── Tool definitions ─────────────────────────────────────────────────────────
//
// Add your domain tools here.  Each entry in the `tools` object below is
// automatically exposed to the model and streamed back to `useChat` on the
// client.  For reusable, cross-adapter tools (MCP / LangGraph / Express) see
// packages/tools/src/examples/.

/**
 * getCurrentTime — Demo tool that returns the current UTC timestamp.
 * Replace (or augment) with real tools for your application.
 */
const getCurrentTime = tool({
  description: 'Return the current date and time in UTC as an ISO 8601 string.',
  inputSchema: z.object({}),
  execute: async (): Promise<{ time: string }> => ({
    time: new Date().toISOString(),
  }),
});

// ─── Request schema ───────────────────────────────────────────────────────────

interface ChatRequestBody {
  messages: ModelMessage[];
  model?: string;
  system?: string;
  maxSteps?: number;
}

// ─── POST / ───────────────────────────────────────────────────────────────────

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { messages, model: modelId, system, maxSteps = 5 } = req.body as ChatRequestBody;

  // Validate required fields
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: '"messages" must be a non-empty array' });
    return;
  }

  // Resolve model: explicit request body > MODEL env var > hardcoded default
  const resolvedModelId = modelId ?? process.env['MODEL'] ?? 'claude-opus-4-6';

  // Create a scoped Anthropic provider (reads ANTHROPIC_API_KEY automatically)
  const provider = createAnthropic({
    apiKey: process.env['ANTHROPIC_API_KEY'],
  });

  // Trace bookkeeping — assign a unique ID and record the start time
  const traceId = crypto.randomUUID();
  const traceStartedAt = new Date();

  // Build and pipe the UI message stream to the HTTP response.
  // createUIMessageStream wraps the async generator and handles backpressure;
  // pipeUIMessageStreamToResponse sets the correct headers and flushes to the client.
  pipeUIMessageStreamToResponse({
    response: res,
    stream: createUIMessageStream({
      execute: async ({ writer }) => {
        const result = streamText({
          model: provider(resolvedModelId),
          system,
          messages,

          // ── Tools available to the model ─────────────────────────────────
          tools: {
            getCurrentTime,
          },

          // ── Agent loop limit ─────────────────────────────────────────────
          // stopWhen: stepCountIs(n) stops after n model steps, preventing
          // runaway tool-call chains.  Clients may pass maxSteps to override.
          stopWhen: stepCountIs(Math.max(1, maxSteps)),

          // ── Observability: capture trace on completion ────────────────────
          onFinish: ({ steps }) => {
            const traceEndedAt = new Date();
            const stepData: StepData[] = steps.map((s) => ({
              text: s.text,
              toolCalls: (s.toolCalls ?? []).map((tc) => ({
                toolCallId: tc.toolCallId,
                toolName: tc.toolName,
                input: tc.input,
              })),
              toolResults: (s.toolResults ?? []).map((tr) => ({
                toolCallId: tr.toolCallId,
                toolName: tr.toolName,
                result: tr.output,
              })),
              usage: {
                inputTokens: s.usage?.inputTokens,
                outputTokens: s.usage?.outputTokens,
              },
            }));
            const trace = buildTrace(
              traceId,
              resolvedModelId,
              traceStartedAt,
              traceEndedAt,
              stepData
            );
            traceStore.add(trace);
          },
        });

        // Merge the streamText events (text deltas, tool calls, step
        // boundaries, usage data) into the UI message stream writer so the
        // client's useChat hook receives a fully-formed UIMessage stream.
        writer.merge(result.toUIMessageStream());
      },

      onError: (error) => {
        console.error('[POST /api/chat] Stream error:', error);
        return error instanceof Error ? error.message : 'Internal server error';
      },
    }),
  });
});

export default router;
