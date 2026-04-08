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
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Router, type Request, type Response } from 'express';
import { createLogger } from '@protolabsai/utils';
import { validateApiKey } from '../../lib/auth.js';
import { getVersion } from '../../lib/version.js';
import { ProviderFactory } from '../../providers/provider-factory.js';
import { resolveModelString } from '@protolabsai/model-resolver';
import type { PlanningService } from '../../services/planning-service.js';

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
          'Onboard a new GitHub repo: scaffold .automaker board entry, patch .gitignore, ' +
          'create worktree-init hook, provision Discord category + channels via Quinn, ' +
          'and register the project in the Workstacean routing index.',
        tags: ['onboarding', 'projects'],
        inputModes: ['text/plain'],
        outputModes: ['text/markdown'],
        examples: [
          'onboard protoLabsAI/protoWorkstacean',
          '/onboard protoLabsAI/quinn',
          'set up protoLabsAI/myapp as a new project',
        ],
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
      {
        id: 'plan',
        name: 'Plan — SPARC PRD + Antagonistic Review',
        description:
          'Draft a SPARC PRD from a raw idea, run antagonistic review (Ava vs Jon), ' +
          'and publish a HITL gate for human approval. Returns immediately with ' +
          'status "pending_approval" and a correlationId. Use plan_resume to approve or reject.',
        tags: ['planning', 'prd', 'review', 'hitl'],
        inputModes: ['text/plain'],
        outputModes: ['application/json'],
        examples: [
          'plan: add a knowledge graph service to Ava',
          'plan: build a Grafana dashboard for seedbox metrics',
        ],
      },
      {
        id: 'plan_resume',
        name: 'Plan Resume — HITL Decision',
        description:
          'Resume a pending plan after human approval. Pass the correlationId and ' +
          'a decision (approve / reject / modify). If approved, creates the project ' +
          'and features on the board.',
        tags: ['planning', 'hitl', 'approval'],
        inputModes: ['application/json'],
        outputModes: ['application/json'],
        examples: [
          '{"correlationId":"ws-abc123","decision":"approve"}',
          '{"correlationId":"ws-abc123","decision":"modify","feedback":"reduce scope to MVP"}',
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
  const seenTypes = new Set<string>();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value, { stream: true });
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      try {
        const payload = JSON.parse(trimmed.slice(6));
        if (payload.type) seenTypes.add(String(payload.type));
        if (payload.type === 'text-delta' && typeof payload.delta === 'string') {
          chunks.push(payload.delta);
        }
      } catch {
        // non-JSON data line — skip
      }
    }
  }

  const result = chunks.join('');
  if (result.length === 0) {
    logger.warn(`collectChatResponse: 0 chars — event types seen: [${[...seenTypes].join(', ')}]`);
  }
  return result;
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

// ─── Native-tool skill execution ─────────────────────────────────────────────

/** Claude Code native tool names — skills that list only these need executeQuery */
const CLAUDE_CODE_NATIVE_TOOLS = new Set([
  'Read',
  'Write',
  'Edit',
  'Bash',
  'Glob',
  'Grep',
  'WebFetch',
  'WebSearch',
  'Task',
  'TodoRead',
  'TodoWrite',
  'NotebookRead',
  'NotebookEdit',
]);

interface SkillMeta {
  body: string;
  allowedTools: string[];
  isNativeTool: boolean;
}

/** Load a skill file and parse its frontmatter. Returns null if not found. */
async function loadSkill(projectPath: string, skillName: string): Promise<SkillMeta | null> {
  const skillPath = join(projectPath, '.claude', 'skills', `${skillName}.md`);
  let raw: string;
  try {
    raw = await readFile(skillPath, 'utf-8');
  } catch {
    return null;
  }

  // Parse YAML frontmatter between --- delimiters
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) return { body: raw, allowedTools: [], isNativeTool: false };

  const [, frontmatter, body] = fmMatch;

  // Extract allowed-tools list (simple line-by-line parse, no full YAML library needed)
  const toolLines: string[] = [];
  let inTools = false;
  for (const line of frontmatter.split('\n')) {
    if (/^allowed-tools\s*:/.test(line)) {
      inTools = true;
      continue;
    }
    if (inTools) {
      const itemMatch = line.match(/^\s+-\s+(.+)/);
      if (itemMatch) {
        toolLines.push(itemMatch[1].trim());
      } else if (/^\S/.test(line)) {
        inTools = false;
      }
    }
  }

  const isNativeTool =
    toolLines.length > 0 && toolLines.every((t) => CLAUDE_CODE_NATIVE_TOOLS.has(t));

  return { body: body.trim(), allowedTools: toolLines, isNativeTool };
}

/**
 * Execute a skill using the Claude Code SDK (ProviderFactory.executeQuery).
 * Used when the skill's allowed-tools are all native Claude Code tools
 * (Bash, Read, Write, etc.) which are not available in Ava's Vercel AI SDK path.
 */
async function executeNativeSkill(
  projectPath: string,
  skill: SkillMeta,
  userText: string
): Promise<string> {
  const resolvedModel = resolveModelString('claude-sonnet');
  const provider = ProviderFactory.getProviderForModel(resolvedModel);
  const stream = provider.executeQuery({
    prompt: userText,
    model: resolvedModel,
    systemPrompt: skill.body,
    cwd: projectPath,
    maxTurns: 30,
    allowedTools: skill.allowedTools,
  });

  let responseText = '';
  for await (const msg of stream) {
    const m = msg as unknown as Record<string, unknown>;
    if (m['type'] === 'assistant' && m['message']) {
      const message = m['message'] as Record<string, unknown>;
      if (Array.isArray(message['content'])) {
        for (const block of message['content'] as Array<Record<string, unknown>>) {
          if (block['type'] === 'text' && typeof block['text'] === 'string') {
            responseText += block['text'];
          }
        }
      }
    } else if (m['type'] === 'result') {
      if (typeof m['result'] === 'string') {
        responseText = m['result'];
      }
    }
  }

  return responseText;
}

/** Call /api/chat and collect the SSE text-delta response. */
async function callChatEndpoint(
  apiKey: string,
  projectPath: string,
  userText: string,
  skillOverride?: string
): Promise<string> {
  const baseUrl = `http://localhost:${process.env['PORT'] ?? 3008}`;
  const chatRes = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify({
      messages: [{ id: randomUUID(), role: 'user', parts: [{ type: 'text', text: userText }] }],
      projectPath,
      ...(skillOverride ? { skillOverride } : {}),
    }),
  });

  if (!chatRes.ok) {
    const errorText = await chatRes.text();
    logger.error(`A2A chat call failed: ${chatRes.status} ${errorText}`);
    throw new Error(`chat endpoint returned ${chatRes.status}`);
  }

  return collectChatResponse(chatRes);
}

/** Optional services for planning pipeline skills */
export interface A2AHandlerDeps {
  planningService?: PlanningService;
}

export function createA2AHandlerRoutes(projectPath: string, deps?: A2AHandlerDeps): Router {
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
        contextId?: string;
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
    const skillOverride = body.params?.metadata?.skillHint as string | undefined;
    const contextId = body.params?.contextId;
    const metadata = body.params?.metadata ?? {};

    if (!userText && skillOverride !== 'plan_resume') {
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
      `A2A message/send received: "${(userText || '').slice(0, 80)}${(userText || '').length > 80 ? '…' : ''}" (skill=${skillOverride ?? 'none'})`
    );

    // ─── Planning pipeline skills (plan / plan_resume) ──────────────────
    // These return immediately and do not go through /api/chat.

    if (skillOverride === 'plan') {
      if (!deps?.planningService) {
        res.status(200).json({
          jsonrpc: '2.0',
          id: rpcId,
          error: { code: -32603, message: 'PlanningService not available' },
        });
        return;
      }

      const correlationId = contextId || randomUUID();
      const replyTopic = metadata.replyTopic as string | undefined;
      const source = metadata.source as
        | { interface: string; channelId?: string; userId?: string }
        | undefined;

      // Plane context forwarded by workstacean when the plan was triggered
      // from a Plane issue webhook — used to update the issue state on approval.
      const planeIssueId = metadata.planeIssueId as string | undefined;
      const planeProjectId = metadata.planeProjectId as string | undefined;
      const planeMeta = planeIssueId
        ? { plane_issue_id: planeIssueId, plane_project_id: planeProjectId ?? '' }
        : undefined;

      // Fire-and-forget: start the plan pipeline asynchronously.
      // The A2A response returns immediately with pending_approval status.
      // If the plan auto-approves (both Ava + Jon high confidence), the
      // PlanningService creates the project in the background.
      deps.planningService
        .startPlan({
          correlationId,
          idea: userText,
          replyTopic,
          source,
          projectPath,
          metadata: planeMeta,
        })
        .then((result) => {
          logger.info(
            `Plan skill completed for correlationId=${correlationId}: status=${result.status}`
          );
        })
        .catch((err) => {
          logger.error(`Plan skill failed for correlationId=${correlationId}:`, err);
        });

      const taskId = randomUUID();
      res.status(200).json({
        jsonrpc: '2.0',
        id: rpcId,
        result: {
          id: taskId,
          contextId: correlationId,
          status: { state: 'working' },
          artifacts: [
            {
              artifactId: randomUUID(),
              parts: [
                {
                  kind: 'text',
                  text: JSON.stringify({
                    status: 'pending_approval',
                    correlationId,
                    message:
                      'Plan pipeline started. PRD drafting + antagonistic review in progress. ' +
                      'A HITLRequest will be published when ready for approval.',
                  }),
                },
              ],
            },
          ],
        },
      });
      return;
    }

    if (skillOverride === 'plan_resume') {
      if (!deps?.planningService) {
        res.status(200).json({
          jsonrpc: '2.0',
          id: rpcId,
          error: { code: -32603, message: 'PlanningService not available' },
        });
        return;
      }

      // Parse decision from text body (JSON) or metadata
      let decision: 'approve' | 'reject' | 'modify' = 'approve';
      let feedback: string | undefined;
      let resumeCorrelationId = contextId || '';

      try {
        // Try parsing userText as JSON first (Workstacean sends structured payloads)
        const parsed = JSON.parse(userText || '{}') as {
          correlationId?: string;
          decision?: string;
          feedback?: string;
        };
        resumeCorrelationId = parsed.correlationId || resumeCorrelationId;
        decision = (parsed.decision as typeof decision) || decision;
        feedback = parsed.feedback;
      } catch {
        // Not JSON — use metadata fields
        decision = (metadata.decision as typeof decision) || decision;
        feedback = metadata.feedback as string | undefined;
        resumeCorrelationId = (metadata.correlationId as string) || resumeCorrelationId;
      }

      if (!resumeCorrelationId) {
        res.status(200).json({
          jsonrpc: '2.0',
          id: rpcId,
          error: {
            code: -32602,
            message: 'Invalid params: contextId or correlationId required for plan_resume',
          },
        });
        return;
      }

      try {
        const result = await deps.planningService.resumePlan({
          correlationId: resumeCorrelationId,
          decision,
          feedback,
          projectPath,
        });

        const taskId = randomUUID();
        res.status(200).json({
          jsonrpc: '2.0',
          id: rpcId,
          result: {
            id: taskId,
            contextId: resumeCorrelationId,
            status: { state: 'completed' },
            artifacts: [
              {
                artifactId: randomUUID(),
                parts: [{ kind: 'text', text: JSON.stringify(result) }],
              },
            ],
          },
        });
      } catch (err) {
        logger.error(`plan_resume failed for correlationId=${resumeCorrelationId}:`, err);
        res.status(200).json({
          jsonrpc: '2.0',
          id: rpcId,
          error: {
            code: -32603,
            message: err instanceof Error ? err.message : 'plan_resume failed',
          },
        });
      }
      return;
    }

    // ─── Standard skill routing (existing behaviour) ────────────────────

    try {
      let responseText: string;

      // When a skill is requested, check if it needs Claude Code native tools (Bash,
      // Read, Write, etc.). If so, bypass /api/chat and run via ProviderFactory.executeQuery
      // which has the full Claude Code SDK tool set. Otherwise use /api/chat as before.
      if (skillOverride) {
        const skill = await loadSkill(projectPath, skillOverride);
        if (skill?.isNativeTool) {
          logger.info(
            `A2A skill "${skillOverride}" uses native tools [${skill.allowedTools.join(', ')}] — routing via executeQuery`
          );
          responseText = await executeNativeSkill(projectPath, skill, userText);
        } else {
          // Skill not found, has no tool restrictions, or uses Ava board tools → /api/chat
          responseText = await callChatEndpoint(key, projectPath, userText, skillOverride);
        }
      } else {
        responseText = await callChatEndpoint(key, projectPath, userText, undefined);
      }

      const taskId = randomUUID();
      const responseContextId = randomUUID();

      res.status(200).json({
        jsonrpc: '2.0',
        id: rpcId,
        result: {
          id: taskId,
          contextId: responseContextId,
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
