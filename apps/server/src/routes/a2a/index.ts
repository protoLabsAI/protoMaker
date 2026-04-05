/**
 * A2A (Agent-to-Agent) routes — Google A2A protocol adapter for Ava
 *
 * Two endpoints:
 *
 *   GET  /.well-known/agent.json       — Agent Card (unauthenticated, discovery)
 *   GET  /.well-known/agent-card.json  — Same card, our internal convention
 *   POST /a2a                          — JSON-RPC message/send handler (API key auth)
 *
 * The agent card describes Ava's skills so other agents (and the LiteLLM
 * gateway) can discover and delegate to it. The /a2a endpoint is a thin
 * adapter: it receives A2A SendMessage, calls the existing /api/chat service
 * internally, collects the streamed response, and returns an A2A Task result.
 *
 * Wire format (A2A spec, Google Agent2Agent protocol):
 *   Request:  { jsonrpc: "2.0", id, method: "message/send", params: { message: { role, parts: [{kind:"text",text}] } } }
 *   Response: { jsonrpc: "2.0", id, result: { id, contextId, status: {state:"completed"}, artifacts: [{parts:[{kind:"text",text}]}] } }
 *
 * Auth: X-API-Key header (same key as the rest of the API).
 * The /.well-known/* endpoints are intentionally unauthenticated.
 */

import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { createLogger } from '@protolabsai/utils';
import { validateApiKey } from '../../lib/auth.js';
import { getVersion } from '../../lib/version.js';

const logger = createLogger('A2ARoutes');

// ─── Agent Card ──────────────────────────────────────────────────────────────
// Describes Ava's skills in the A2A standard format.
// Agents read this to understand what they can delegate here.

function buildAgentCard(host: string) {
  const version = getVersion();
  return {
    name: 'ava',
    description:
      'protoLabs.studio autonomous development orchestrator. ' +
      'Monitors board health, manages features, coordinates the agent fleet, ' +
      'runs auto-mode, and reports status via Discord.',
    url: `http://${host}`,
    version,
    provider: {
      organization: 'protoLabsAI',
      url: 'https://github.com/protoLabsAI',
    },
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: false,
    },
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/markdown'],
    skills: [
      {
        id: 'sitrep',
        name: 'Situation Report',
        description:
          'Returns current board state: feature counts by status, running agents, ' +
          'auto-mode status, and recent escalations.',
        tags: ['monitoring', 'board'],
        inputModes: ['text/plain'],
        outputModes: ['text/markdown'],
        examples: ['give me a sitrep', "what's the board looking like?"],
      },
      {
        id: 'manage_feature',
        name: 'Manage Feature',
        description:
          'Create, update, unblock, reassign, or change the status of a feature on the board.',
        tags: ['features', 'board'],
        inputModes: ['text/plain'],
        outputModes: ['text/markdown'],
        examples: [
          'unblock feature feature-123',
          'create a feature: add dark mode',
          'mark feature-456 as done',
        ],
      },
      {
        id: 'auto_mode',
        name: 'Auto Mode Control',
        description: 'Start or stop the autonomous feature execution loop.',
        tags: ['automation'],
        inputModes: ['text/plain'],
        outputModes: ['text/plain'],
        examples: ['start auto-mode', 'stop auto-mode', 'is auto-mode running?'],
      },
      {
        id: 'board_health',
        name: 'Board Health Check',
        description:
          'Analyse board health: blocked features, stalled agents, CI failures, dependency issues.',
        tags: ['monitoring', 'health'],
        inputModes: ['text/plain'],
        outputModes: ['text/markdown'],
        examples: ["what's blocked?", 'check board health', 'any stalled agents?'],
      },
      {
        id: 'bug_triage',
        name: 'Bug Triage',
        description:
          'Triage an incoming bug report from GitHub. Classifies severity and category, ' +
          'applies labels, and creates a board feature. Trust-tier-aware: external submissions ' +
          '(tier 0/1) are wrapped in untrusted framing and quarantined for human review before ' +
          'auto-mode picks them up.',
        tags: ['bugs', 'triage', 'github'],
        inputModes: ['text/plain'],
        outputModes: ['text/markdown'],
        examples: [
          'triage GitHub issue #42',
          'classify and label this bug report',
          'create a board feature for this external bug',
        ],
      },
      {
        id: 'onboard_project',
        name: 'Onboard Project',
        description:
          'Onboard a GitHub repository into protoLabs Studio. ' +
          'Fetches repo metadata, scaffolds .automaker project files, ' +
          'provisions Discord channels, updates workspace/projects.yaml, ' +
          'and posts a kickoff message.',
        tags: ['ops', 'onboarding'],
        inputModes: ['text/plain'],
        outputModes: ['text/markdown'],
        examples: ['onboard protoLabsAI/protoWorkstacean', '/onboard_project protoLabsAI/my-repo'],
      },
      {
        id: 'provision_discord',
        name: 'Provision Discord Channels',
        description:
          'Provision Discord channels for a new project. ' +
          'Creates a category with standard project channels (#dev, #alerts, #releases). ' +
          'Called by Ava during onboard_project to set up team communication infrastructure. ' +
          'Returns channel IDs for writing back to project settings.',
        tags: ['discord', 'onboarding', 'provisioning'],
        inputModes: ['text/plain'],
        outputModes: ['application/json'],
        examples: [
          'provision discord channels for project MyApp',
          'set up discord for projectSlug=my-app projectTitle=My App',
        ],
      },
    ],
    securitySchemes: {
      apiKey: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
      },
    },
    security: [{ apiKey: [] }],
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Extract plain text from an A2A message parts array */
function extractText(parts: Array<{ kind?: string; type?: string; text?: string }>): string {
  return parts
    .filter((p) => (p.kind ?? p.type) === 'text')
    .map((p) => p.text ?? '')
    .join('\n')
    .trim();
}

/** Collect SSE text-delta events from the chat endpoint into a single string */
async function collectChatResponse(chatResponse: globalThis.Response): Promise<string> {
  const reader = chatResponse.body?.getReader();
  if (!reader) return '';

  const decoder = new TextDecoder();
  const chunks: string[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value, { stream: true });
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      try {
        const payload = JSON.parse(trimmed.slice(6));
        if (payload.type === 'text-delta' && typeof payload.delta === 'string') {
          chunks.push(payload.delta);
        }
      } catch {
        // non-JSON data line — skip
      }
    }
  }

  return chunks.join('');
}

// ─── Route factory ───────────────────────────────────────────────────────────

export function createA2ARoutes(): Router {
  const router = Router();

  // GET /.well-known/agent.json and /.well-known/agent-card.json
  // Unauthenticated — agent discovery must be open.
  // Registered in routes.ts BEFORE authMiddleware.
  router.get(['/agent.json', '/agent-card.json'], (req: Request, res: Response): void => {
    const host = req.headers.host ?? 'ava:3008';
    const card = buildAgentCard(host);
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json(card);
  });

  return router;
}

export function createA2AHandlerRoutes(projectPath: string): Router {
  const router = Router();

  /**
   * POST /a2a
   *
   * Accepts A2A JSON-RPC messages. Only message/send is implemented — enough
   * for gateway delegation. Unknown methods return a JSON-RPC error.
   *
   * Auth: X-API-Key header (same credential as /api/*).
   */
  router.post('/', async (req: Request, res: Response): Promise<void> => {
    // Auth check — /a2a sits outside the /api prefix so authMiddleware doesn't
    // cover it automatically. We do a manual key check here.
    const key = req.headers['x-api-key'] as string | undefined;
    if (!key || !validateApiKey(key)) {
      res.status(401).json({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32001, message: 'Unauthorized: valid X-API-Key header required' },
      });
      return;
    }

    const body = req.body as {
      jsonrpc?: string;
      id?: string | number;
      method?: string;
      params?: {
        message?: {
          role?: string;
          parts?: Array<{ kind?: string; type?: string; text?: string }>;
        };
        metadata?: Record<string, unknown>;
      };
    };

    const rpcId = body.id ?? null;

    // Only handle message/send — return proper JSON-RPC error for anything else
    if (body.method !== 'message/send') {
      res.status(200).json({
        jsonrpc: '2.0',
        id: rpcId,
        error: {
          code: -32601,
          message: `Method not found: ${body.method ?? '(none)'}. Supported: message/send`,
        },
      });
      return;
    }

    const parts = body.params?.message?.parts ?? [];
    const userText = extractText(parts);

    if (!userText) {
      res.status(200).json({
        jsonrpc: '2.0',
        id: rpcId,
        error: {
          code: -32602,
          message: 'Invalid params: message must contain at least one text part',
        },
      });
      return;
    }

    logger.info(
      `A2A message/send received: "${userText.slice(0, 80)}${userText.length > 80 ? '…' : ''}"`
    );

    try {
      // Call the existing /api/chat endpoint internally.
      // This reuses all tool registration, auth, sitrep injection, and
      // model configuration without duplicating any of that logic here.
      const baseUrl = `http://localhost:${process.env.PORT ?? 3008}`;
      const chatRes = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': key,
        },
        body: JSON.stringify({
          messages: [
            {
              id: randomUUID(),
              role: 'user',
              parts: [{ type: 'text', text: userText }],
            },
          ],
          projectPath,
        }),
      });

      if (!chatRes.ok) {
        const errorText = await chatRes.text();
        logger.error(`A2A chat call failed: ${chatRes.status} ${errorText}`);
        res.status(200).json({
          jsonrpc: '2.0',
          id: rpcId,
          error: {
            code: -32603,
            message: `Internal error: chat endpoint returned ${chatRes.status}`,
          },
        });
        return;
      }

      const responseText = await collectChatResponse(chatRes);
      const taskId = randomUUID();
      const contextId = randomUUID();

      res.status(200).json({
        jsonrpc: '2.0',
        id: rpcId,
        result: {
          id: taskId,
          contextId,
          status: { state: 'completed' },
          artifacts: [
            {
              artifactId: randomUUID(),
              parts: [{ kind: 'text', text: responseText }],
            },
          ],
        },
      });

      logger.info(`A2A task ${taskId} completed (${responseText.length} chars)`);
    } catch (err) {
      logger.error('A2A handler error:', err);
      res.status(200).json({
        jsonrpc: '2.0',
        id: rpcId,
        error: { code: -32603, message: 'Internal error' },
      });
    }
  });

  return router;
}
