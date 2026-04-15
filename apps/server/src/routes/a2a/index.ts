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
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Router, type Request, type Response } from 'express';
import { createLogger } from '@protolabsai/utils';
import { validateApiKey } from '../../lib/auth.js';
import { getVersion } from '../../lib/version.js';
import { ProviderFactory } from '../../providers/provider-factory.js';
import { resolveModelString } from '@protolabsai/model-resolver';
import type { PlanningService } from '../../services/planning-service.js';
import type { SettingsService } from '../../services/settings-service.js';
import { getWorkflowSettings } from '../../lib/settings-helpers.js';

const logger = createLogger('A2ARoutes');

// ─── Declared skill surface ──────────────────────────────────────────────────
// Single source of truth for every skill Ava accepts via /a2a. buildAgentCard
// renders these into the public Agent Card, and the message/send handler
// checks incoming skillHint values against this set to reject anything that
// isn't declared. Without the guard Ava's LLM would silently answer skills
// she never claimed (observed on protoWorkstacean#104 — she narrated a pr_review
// despite having no such skill on her card, because the upstream router
// defaulted to her when no other agent claimed the skill).
//
// To add a skill: add an entry here, then — if it needs custom routing —
// handle the skillHint branch in the message/send handler below.

interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  tags: string[];
  inputModes: string[];
  outputModes: string[];
  examples: string[];
}

const DECLARED_SKILLS: readonly SkillDefinition[] = [
  {
    id: 'chat',
    name: 'Free-form Chat',
    description:
      'Free-form multi-turn dialogue with the user. No specific tool action required — ' +
      'Ava picks up context, asks clarifying questions, and routes to a specific skill ' +
      'internally if the conversation lands on something actionable. This is the default ' +
      'DM fallback skill (ROUTER_DM_DEFAULT_SKILL=chat) for messages that do not hit a ' +
      'keyword match.',
    tags: ['chat', 'dialogue', 'fallback'],
    inputModes: ['text/plain'],
    outputModes: ['text/markdown'],
    examples: [
      'hey ava, how are you?',
      "what's going on with the board today?",
      'can you help me think through this architecture question?',
    ],
  },
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
] as const;

/** Set of skill IDs Ava will accept — used as the allowlist check. Exported for testing. */
export const DECLARED_SKILL_IDS: ReadonlySet<string> = new Set(DECLARED_SKILLS.map((s) => s.id));

// ─── Agent Card ──────────────────────────────────────────────────────────────
// Describes the protoMaker team's skills in the A2A standard format.
// Other agents read this to understand what they can delegate here.
//
// Naming note: the returned card identifies this runtime as 'protomaker' —
// the multi-agent team that runs board ops, planning, feature lifecycle,
// and onboarding. This is distinct from the in-process 'ava' chat agent
// that lives in protoWorkstacean's workspace/agents/ava.yaml. We used to
// collapse both into a single "ava" slug; that caused confusion as the
// fleet grew. The HTTP env vars (AVA_BASE_URL, AVA_API_KEY, AVA_APP_ID)
// keep their historical names because they describe this server's HTTP
// identity, not the logical agent slug.

function buildAgentCard(host: string) {
  const version = getVersion();
  return {
    name: 'protomaker',
    description:
      'protoLabs.studio autonomous development team. ' +
      'Multi-agent runtime coordinating board health, feature management, ' +
      'auto-mode, planning, and project onboarding. Historically addressed ' +
      'as "ava" — the underlying HTTP server identity is unchanged.',
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
    skills: DECLARED_SKILLS,
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
  if (!projectPath) {
    throw new Error(
      'executeNativeSkill requires a valid projectPath but received a falsy value. ' +
        'Cross-project dispatches must include metadata.projectPath.'
    );
  }
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

// Default A2A skill execution settings — sized for multi-step skills like bug_triage
// which involve sequential LLM + tool calls and routinely take 3–5 minutes.
const A2A_DEFAULT_TIMEOUT_MS = 600_000; // 10 minutes
const A2A_DEFAULT_MAX_RETRIES = 2;
const A2A_DEFAULT_RETRY_BASE_DELAY_MS = 5_000;

/** Simple promise-based sleep for retry backoff */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Call /api/chat and collect the SSE text-delta response. */
async function callChatEndpoint(
  apiKey: string,
  projectPath: string,
  userText: string,
  skillOverride?: string,
  correlationId?: string,
  timeoutMs: number = A2A_DEFAULT_TIMEOUT_MS
): Promise<string> {
  if (!projectPath) {
    throw new Error(
      `callChatEndpoint requires a valid projectPath but received "${String(projectPath)}". ` +
        `Skill: ${skillOverride ?? 'none'}.`
    );
  }
  const baseUrl = `http://localhost:${process.env['PORT'] ?? 3008}`;

  // AbortSignal.timeout() is built-in since Node 18 — creates a signal that
  // automatically aborts after the given delay. A fresh signal is created per
  // attempt so retries each get their own full timeout window.
  const signal = AbortSignal.timeout(timeoutMs);

  const chatRes = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
      // Propagate the trace context so ava's internal spans are linked to the
      // originating workstacean correlationId.
      ...(correlationId ? { 'X-Correlation-Id': correlationId } : {}),
    },
    body: JSON.stringify({
      messages: [{ id: randomUUID(), role: 'user', parts: [{ type: 'text', text: userText }] }],
      projectPath,
      ...(skillOverride ? { skillOverride } : {}),
      ...(correlationId ? { correlationId } : {}),
    }),
  });

  if (!chatRes.ok) {
    const errorText = await chatRes.text();
    logger.error(`A2A chat call failed: ${chatRes.status} ${errorText}`);
    throw new Error(`chat endpoint returned ${chatRes.status}`);
  }

  return collectChatResponse(chatRes);
}

/**
 * Call the chat endpoint with exponential-backoff retry.
 * Retries on timeout (TimeoutError) and 5xx server errors — both are transient.
 * Each retry gets a fresh AbortSignal so the full timeout window is available.
 */
async function callChatEndpointWithRetry(
  apiKey: string,
  projectPath: string,
  userText: string,
  skillOverride: string | undefined,
  correlationId: string | undefined,
  timeoutMs: number,
  maxRetries: number,
  retryBaseDelayMs: number
): Promise<string> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = retryBaseDelayMs * Math.pow(2, attempt - 1);
      logger.info(
        `A2A callChatEndpoint retry ${attempt}/${maxRetries} for skill="${skillOverride ?? 'none'}" after ${delay}ms (last error: ${lastError?.message ?? 'unknown'})`
      );
      await sleep(delay);
    }
    try {
      return await callChatEndpoint(
        apiKey,
        projectPath,
        userText,
        skillOverride,
        correlationId,
        timeoutMs
      );
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Retry only on timeout (TimeoutError name, set by AbortSignal.timeout) or 5xx
      const isTransient =
        lastError.name === 'TimeoutError' ||
        lastError.message.startsWith('chat endpoint returned 5');
      if (!isTransient || attempt === maxRetries) {
        if (attempt < maxRetries) {
          logger.warn(
            `A2A callChatEndpoint non-transient error for skill="${skillOverride ?? 'none'}", not retrying: ${lastError.message}`
          );
        }
        throw lastError;
      }
      logger.warn(
        `A2A callChatEndpoint attempt ${attempt + 1} failed (transient: ${lastError.message}), will retry`
      );
    }
  }
  throw lastError ?? new Error('callChatEndpointWithRetry: unreachable');
}

/** Optional services for planning pipeline skills */
export interface A2AHandlerDeps {
  planningService?: PlanningService;
  settingsService?: SettingsService;
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
    // Prefer params.contextId, then X-Correlation-Id header (set by workstacean A2AExecutor)
    const contextId =
      body.params?.contextId ?? (req.headers['x-correlation-id'] as string | undefined);
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

    // Agent-card allowlist enforcement. If the caller pinned a specific skill,
    // it MUST be one Ava declared in her Agent Card. Silently answering skills
    // outside that surface (as the LLM used to do) lets the fleet drift —
    // callers think the delegation worked, but Ava's answer has no tool
    // grounding and the sender never learns the skill wasn't implemented.
    // Returning -32601 ("method not found") forces the sender to route
    // elsewhere or surface the misconfiguration.
    if (skillOverride && !DECLARED_SKILL_IDS.has(skillOverride)) {
      logger.warn(
        `A2A rejected skill "${skillOverride}" — not in agent card. Declared: [${[...DECLARED_SKILL_IDS].join(', ')}]`
      );
      res.status(200).json({
        jsonrpc: '2.0',
        id: rpcId,
        error: {
          code: -32601,
          message:
            `Skill "${skillOverride}" is not declared in Ava's agent card. ` +
            `Declared skills: ${[...DECLARED_SKILL_IDS].join(', ')}.`,
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

    // Per-request projectPath override from metadata.
    //
    // By default this handler uses the route's fixed `projectPath` (Ava's own
    // repo). Cross-project dispatches (e.g. protoWorkstacean's pr-remediator
    // targeting protoMaker) need to steer Ava's board tools at a DIFFERENT
    // repo, so the sender passes an absolute path in `params.metadata.projectPath`.
    //
    // We validate the override defensively: must be an absolute string path
    // that exists and contains `.automaker/`. Any failure falls back to the
    // route default rather than erroring, so a misconfigured sender still
    // gets SOME response instead of a hard failure.
    const metaProjectPath = metadata.projectPath;
    let effectiveProjectPath = projectPath;
    if (typeof metaProjectPath === 'string' && metaProjectPath.startsWith('/')) {
      if (existsSync(join(metaProjectPath, '.automaker'))) {
        effectiveProjectPath = metaProjectPath;
        logger.info(`A2A projectPath override: "${metaProjectPath}" (from metadata, validated)`);
      } else {
        logger.warn(
          `A2A projectPath override rejected: "${metaProjectPath}" has no .automaker/ — falling back to ${projectPath}`
        );
      }
    }

    // Guard: effectiveProjectPath must be a non-empty string. If the route-level
    // projectPath was somehow undefined (e.g. misconfigured ServiceContainer) or
    // the metadata override resolved to a falsy value, reject early with a clear
    // error rather than passing undefined to downstream services (which causes
    // Python NoneType crashes in the Claude Agent SDK).
    if (!effectiveProjectPath) {
      logger.error(
        `A2A skill dispatch failed: effectiveProjectPath is falsy (route=${projectPath}, meta=${String(metaProjectPath)})`
      );
      res.status(200).json({
        jsonrpc: '2.0',
        id: rpcId,
        result: {
          id: randomUUID(),
          contextId: contextId ?? randomUUID(),
          status: { state: 'completed' },
          artifacts: [
            {
              parts: [
                {
                  type: 'text',
                  text: `ERROR: projectPath is missing — cannot execute skill "${skillOverride ?? 'chat'}". Ensure metadata.projectPath is set for cross-project dispatches.`,
                },
              ],
            },
          ],
        },
      });
      return;
    }

    // Load A2A execution settings for this project — controls timeout and retry behavior.
    // Defaults are generous (10 min timeout, 2 retries) to handle multi-step skills.
    const workflowSettings = await getWorkflowSettings(
      effectiveProjectPath,
      deps?.settingsService,
      '[A2AHandler]'
    );
    const a2aExec = workflowSettings.a2aSkillExecution ?? {};
    const timeoutMs = a2aExec.timeoutMs ?? A2A_DEFAULT_TIMEOUT_MS;
    const maxRetries = a2aExec.maxRetries ?? A2A_DEFAULT_MAX_RETRIES;
    const retryBaseDelayMs = a2aExec.retryBaseDelayMs ?? A2A_DEFAULT_RETRY_BASE_DELAY_MS;

    try {
      let responseText: string;

      // When a skill is requested, check if it needs Claude Code native tools (Bash,
      // Read, Write, etc.). If so, bypass /api/chat and run via ProviderFactory.executeQuery
      // which has the full Claude Code SDK tool set. Otherwise use /api/chat as before.
      if (skillOverride) {
        const skill = await loadSkill(effectiveProjectPath, skillOverride);
        if (skill?.isNativeTool) {
          logger.info(
            `A2A skill "${skillOverride}" uses native tools [${skill.allowedTools.join(', ')}] — routing via executeQuery`
          );
          responseText = await executeNativeSkill(effectiveProjectPath, skill, userText);
        } else {
          // Skill not found, has no tool restrictions, or uses Ava board tools → /api/chat
          responseText = await callChatEndpointWithRetry(
            key,
            effectiveProjectPath,
            userText,
            skillOverride,
            contextId,
            timeoutMs,
            maxRetries,
            retryBaseDelayMs
          );
        }
      } else {
        responseText = await callChatEndpointWithRetry(
          key,
          effectiveProjectPath,
          userText,
          undefined,
          contextId,
          timeoutMs,
          maxRetries,
          retryBaseDelayMs
        );
      }

      const taskId = randomUUID();
      // Propagate incoming contextId to preserve the distributed trace chain.
      // Only generate a new one if no contextId arrived (e.g. direct curl calls).
      const responseContextId = contextId ?? randomUUID();

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
