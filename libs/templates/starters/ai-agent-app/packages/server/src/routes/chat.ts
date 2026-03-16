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
 *   Tools are defined using AI SDK's `tool()` helper and wrapped with progress
 *   emission so the WebSocket sideband receives live updates during execution.
 */

import { Router, type Request, type Response } from 'express';
import {
  streamText,
  createUIMessageStream,
  pipeUIMessageStreamToResponse,
  convertToModelMessages,
  stepCountIs,
  tool,
  type UIMessage,
} from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { traceStore } from '../tracing/trace-store.js';
import { buildTrace, type StepData } from '../tracing/build-trace.js';
import { getCommand, parseSlashCommand } from '../commands/registry.js';
import { toolProgress } from '../tools/progress.js';

// Side-effect import: registers all built-in commands into the registry
import '../commands/example.js';

const router = Router();

// ─── Anthropic provider with CLI auth support ─────────────────────────────────
//
// Matches the production credential chain: env var → CLI OAuth file → macOS Keychain.
// This lets the template work with Claude CLI auth (claude login) without needing
// a separate ANTHROPIC_API_KEY.

let _cachedProvider: ReturnType<typeof createAnthropic> | null = null;

function getAnthropicProvider(): ReturnType<typeof createAnthropic> {
  if (_cachedProvider) return _cachedProvider;

  // 1. ANTHROPIC_API_KEY env var
  if (process.env['ANTHROPIC_API_KEY']) {
    _cachedProvider = createAnthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] });
    return _cachedProvider;
  }

  // 2. ANTHROPIC_AUTH_TOKEN env var
  if (process.env['ANTHROPIC_AUTH_TOKEN']) {
    _cachedProvider = createAnthropic({
      authToken: process.env['ANTHROPIC_AUTH_TOKEN'],
      headers: { 'anthropic-beta': 'oauth-2025-04-20' },
    });
    return _cachedProvider;
  }

  // 3. Claude CLI OAuth token from credential files
  const token = readCliOAuthToken();
  if (token) {
    console.log('Using Claude CLI OAuth token for authentication');
    _cachedProvider = createAnthropic({
      authToken: token,
      headers: { 'anthropic-beta': 'oauth-2025-04-20' },
    });
    return _cachedProvider;
  }

  // 4. Fallback — will fail if no auth is available
  console.warn('No API key or CLI auth found. Set ANTHROPIC_API_KEY or run: claude login');
  _cachedProvider = createAnthropic();
  return _cachedProvider;
}

function readCliOAuthToken(): string | null {
  // Read from ~/.claude/.credentials.json (Claude Code CLI)
  const homedir = process.env['HOME'] ?? process.env['USERPROFILE'] ?? '';
  const credPaths = [
    path.join(homedir, '.claude', '.credentials.json'),
    path.join(homedir, '.claude', 'credentials.json'),
  ];

  for (const credPath of credPaths) {
    try {
      if (!fs.existsSync(credPath)) continue;
      const content = fs.readFileSync(credPath, 'utf-8');
      const creds = JSON.parse(content) as Record<string, unknown>;

      // Claude Code format: { claudeAiOauth: { accessToken } }
      const claudeOauth = creds.claudeAiOauth as { accessToken?: string } | undefined;
      if (claudeOauth?.accessToken) return claudeOauth.accessToken;

      // Legacy formats
      if (typeof creds.oauth_token === 'string') return creds.oauth_token;
      if (typeof creds.access_token === 'string') return creds.access_token;
    } catch {
      continue;
    }
  }

  // Try macOS Keychain
  if (process.platform === 'darwin') {
    try {
      const raw = execSync('security find-generic-password -s "Claude Code-credentials" -w', {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      const creds = JSON.parse(raw) as Record<string, unknown>;
      const claudeOauth = creds.claudeAiOauth as { accessToken?: string } | undefined;
      if (claudeOauth?.accessToken) return claudeOauth.accessToken;
    } catch {
      // Keychain not available
    }
  }

  return null;
}

// ─── Tool definitions ─────────────────────────────────────────────────────────
//
// Each tool is wrapped with progress emission so the WebSocket sideband
// receives live updates during execution.

const getCurrentTime = tool({
  description: 'Return the current date and time in UTC as an ISO 8601 string.',
  inputSchema: z.object({}),
  execute: async () => {
    toolProgress.emit('getCurrentTime', 'Getting current time...');
    const result = { time: new Date().toISOString() };
    toolProgress.emit('getCurrentTime', 'Done');
    toolProgress.flush();
    return result;
  },
});

const get_weather = tool({
  description: 'Get current weather for a location (demo — returns mock data).',
  inputSchema: z.object({
    location: z.string().describe('City name or location'),
  }),
  execute: async ({ location }) => {
    toolProgress.emit('get_weather', `Fetching weather for ${location}...`);
    const result = {
      location,
      temperature: Math.round(15 + Math.random() * 20),
      condition: ['sunny', 'cloudy', 'rainy', 'partly cloudy'][Math.floor(Math.random() * 4)],
      humidity: Math.round(30 + Math.random() * 50),
    };
    toolProgress.emit('get_weather', `Weather for ${location} ready`);
    toolProgress.flush();
    return result;
  },
});

// ─── Request schema ───────────────────────────────────────────────────────────

interface ChatRequestBody {
  messages: UIMessage[];
  model?: string;
  system?: string;
  maxSteps?: number;
}

// ─── POST / ───────────────────────────────────────────────────────────────────

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { messages, model: bodyModel, system, maxSteps = 5 } = req.body as ChatRequestBody;

  // Validate required fields
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: '"messages" must be a non-empty array' });
    return;
  }

  // Resolve model: header > body > env > default (matches production Ava pattern)
  const modelAlias = (req.headers['x-model-alias'] as string) || bodyModel || process.env['MODEL'] || 'claude-opus-4-6';
  const resolvedModelId = modelAlias;

  // Create Anthropic provider with credential chain matching the main app:
  // 1. ANTHROPIC_API_KEY env var → 2. Claude CLI OAuth token (file) → 3. macOS Keychain
  const provider = getAnthropicProvider();

  // ── Slash-command expansion ─────────────────────────────────────────────────
  // UIMessages use `parts` array, not `content` string
  let resolvedSystem = system;
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
  const lastUserText = lastUserMessage?.parts
    ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('') ?? '';

  const parsed = lastUserText ? parseSlashCommand(lastUserText) : null;
  if (parsed) {
    const cmd = getCommand(parsed.name);
    if (cmd) {
      const expansion = cmd.expand(parsed.args);
      resolvedSystem = expansion + (resolvedSystem ? '\n\n' + resolvedSystem : '');
    }
  }

  // Convert UIMessages (parts array) to ModelMessages (content string) for streamText
  // Production Ava uses the same pattern — must await and pass tools for tool result conversion
  const modelMessages = await convertToModelMessages(messages, {
    tools: {
      getCurrentTime,
      get_weather,
    },
  });

  // Trace bookkeeping
  const traceId = crypto.randomUUID();
  const traceStartedAt = new Date();

  pipeUIMessageStreamToResponse({
    response: res,
    stream: createUIMessageStream({
      execute: async ({ writer }) => {
        const result = streamText({
          model: provider(resolvedModelId),
          system: resolvedSystem,
          messages: modelMessages,

          tools: {
            getCurrentTime,
            get_weather,
          },

          stopWhen: stepCountIs(Math.max(1, maxSteps)),

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
