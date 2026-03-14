/**
 * Chat Routes — AI SDK streaming chat endpoint
 *
 * Replaces the CopilotKit runtime with a direct Vercel AI SDK integration.
 * Uses @ai-sdk/anthropic for Claude models with streamText for SSE streaming.
 * Langfuse OTEL tracing is enabled when configured via environment variables.
 *
 * Per-request enrichment:
 * - Loads AvaConfig from <projectPath>/.automaker/ava-config.json
 * - Injects project root CLAUDE.md + Ava skill prompt when contextInjection is true
 *   (NOT .automaker/context/ — that's for dev agents, not the orchestrator)
 * - Fetches a live sitrep via getSitrep() when sitrepInjection is true
 * - Builds tool set from buildAvaTools() gated by config.toolGroups
 * - Passes tools to streamText with maxSteps: 10
 *
 * Citation extraction:
 * - After the AI response text is complete, [[feature:id]] and [[doc:path]]
 *   patterns are extracted and resolved to Citation objects via the feature loader.
 * - Resolved citations are written to the UI message stream as a data-citations chunk
 *   so the client can render inline badges and a sources section.
 */

import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import {
  streamText,
  stepCountIs,
  createUIMessageStream,
  pipeUIMessageStreamToResponse,
  convertToModelMessages,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getAnthropicModel } from '../../lib/ai-provider.js';
import { createLogger } from '@protolabsai/utils';
import { resolveModelString } from '@protolabsai/model-resolver';
import { buildAvaSystemPrompt, type NotesContext } from './personas.js';
import { loadAvaConfig, DEFAULT_AVA_CONFIG, type AvaConfig } from './ava-config.js';
import { getSitrep } from './sitrep.js';
import { buildAvaTools } from './ava-tools.js';
import type { PlanData } from './ava-tools.js';
import {
  estimateTokens,
  compactMessageHistory,
  COMPACTION_BUDGET_TOKENS,
} from './message-compaction.js';
import { ToolProgressEmitter } from './tool-progress.js';
import { compactToolResult } from './tool-compaction.js';
import { buildCanUseToolCallback } from '../../lib/agent-trust.js';
import type { ToolApprovalResponse } from '../../lib/agent-trust.js';
import type { ServiceContainer } from '../../server/services.js';
import type { CheckpointService } from '../../services/checkpoint-service.js';
import type { FeatureLoader } from '../../services/feature-loader.js';
import type { EventType, SubagentProgress, SubagentStatus } from '@protolabsai/types';
import { parseSlashCommand, expandCommandBody } from '../../services/command-expansion-service.js';

export type { AvaConfig };

const logger = createLogger('ChatRoutes');

// ── Slash command helpers ─────────────────────────────────────────────────────

/**
 * Extract the plain text content from a UIMessage.
 * Handles both the parts-based format (AI SDK v4+) and legacy content string.
 */
function extractMessageText(message: UIMessage): string {
  if (Array.isArray(message.parts)) {
    return message.parts
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('');
  }
  const content = (message as unknown as Record<string, unknown>)['content'];
  return typeof content === 'string' ? content : '';
}

/**
 * Load Ava-level context: project root CLAUDE.md + Ava skill prompt body.
 *
 * Unlike dev agents (which load .automaker/context/ + .automaker/memory/),
 * Ava is the orchestrator and needs the project-level instructions and her
 * own operational prompt — not the internal agent plumbing.
 *
 * @param projectPath - Absolute path to the project root
 * @returns Combined context string, or undefined when no context is found
 */
export async function loadAvaContext(projectPath: string): Promise<string | undefined> {
  const contextParts: string[] = [];

  // 1. Project root CLAUDE.md
  try {
    const claudeMd = await fs.readFile(path.join(projectPath, 'CLAUDE.md'), 'utf-8');
    if (claudeMd.trim()) {
      contextParts.push(`# Project Instructions (CLAUDE.md)\n\n${claudeMd}`);
    }
  } catch {
    // No CLAUDE.md at project root — that's fine
  }

  // 2. Ava UI prompt — prefer the UI-specific ava-prompt.md (co-located with this module),
  //    fall back to the CLI skill file for backward compatibility.
  try {
    // Resolve relative to the compiled module so this works in both src and dist.
    // dist/routes/chat → ../../.. → apps/server → src/routes/chat/ava-prompt.md
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const uiPromptPath = path.join(__dirname, '../../../src/routes/chat/ava-prompt.md');

    let avaPromptRaw: string | null = null;

    try {
      avaPromptRaw = await fs.readFile(uiPromptPath, 'utf-8');
    } catch {
      // ava-prompt.md not found — fall back to CLI skill file
    }

    if (avaPromptRaw === null) {
      // Fallback: CLI skill file (strips YAML frontmatter)
      const cliSkillPath = path.resolve(
        projectPath,
        'packages/mcp-server/plugins/automaker/commands/ava.md'
      );
      const cliSkillRaw = await fs.readFile(cliSkillPath, 'utf-8');
      const fmEnd = cliSkillRaw.indexOf('\n---', 4);
      avaPromptRaw = fmEnd !== -1 ? cliSkillRaw.slice(fmEnd + 4).trim() : cliSkillRaw.trim();
    }

    if (avaPromptRaw?.trim()) {
      contextParts.push(avaPromptRaw.trim());
    }
  } catch {
    // Ava prompt not found — continue without it
  }

  return contextParts.length > 0 ? contextParts.join('\n\n---\n\n') : undefined;
}

/**
 * Strip YAML frontmatter delimited by --- ... --- from a markdown string.
 * Exported for testing.
 */
export function stripFrontmatter(raw: string): string {
  const fmEnd = raw.indexOf('\n---', 4);
  return fmEnd !== -1 ? raw.slice(fmEnd + 4).trim() : raw.trim();
}

/**
 * Returns true when the resolved model ID supports Anthropic extended thinking.
 * Currently all claude-opus and claude-sonnet models support this feature.
 */
function modelSupportsExtendedThinking(resolvedModelId: string): boolean {
  return resolvedModelId.includes('opus') || resolvedModelId.includes('sonnet');
}

// ── Citation extraction ───────────────────────────────────────────────────────

/** A resolved citation object sent to the client as message annotation data */
export interface Citation {
  id: string;
  type: 'feature' | 'doc';
  title: string;
  url?: string;
  path?: string;
  status?: string;
}

/** Pattern matching [[feature:id]] and [[doc:path]] markers */
const CITATION_PATTERN = /\[\[(feature|doc):([^\]]+)\]\]/g;

/**
 * Scan the full assistant response text for citation markers, resolve each
 * unique citation (de-duplicated by type:id key), and return the ordered list.
 *
 * Feature citations are resolved via the feature loader; doc citations use the
 * path as their title. Graceful fallback: if a feature ID is not found, the raw
 * ID is used as the title and no status is attached.
 */
async function extractAndResolveCitations(
  text: string,
  projectPath: string,
  featureLoader: FeatureLoader
): Promise<Citation[]> {
  const matches = [...text.matchAll(CITATION_PATTERN)];
  if (matches.length === 0) return [];

  const seen = new Set<string>();
  const citations: Citation[] = [];

  for (const match of matches) {
    const [, type, id] = match as unknown as [string, 'feature' | 'doc', string];
    const key = `${type}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (type === 'feature') {
      try {
        const feature = await featureLoader.get(projectPath, id);
        if (feature) {
          citations.push({
            id,
            type: 'feature',
            title: feature.title || id,
            status: feature.status,
          });
        } else {
          // Graceful fallback — ID not found in the project
          citations.push({ id, type: 'feature', title: id });
        }
      } catch {
        citations.push({ id, type: 'feature', title: id });
      }
    } else {
      // doc citation — use the path as the title
      citations.push({ id, type: 'doc', title: id, path: id });
    }
  }

  return citations;
}

// ── Plan extraction ───────────────────────────────────────────────────────────

/** Matches a fenced ```plan ... ``` block in the assistant response text */
const PLAN_BLOCK_PATTERN = /```plan\s*([\s\S]*?)```/;

/**
 * Scan the assistant response text for a ```plan JSON block.
 * Returns a PlanData object when a valid plan block is found, or null otherwise.
 * Gracefully ignores malformed JSON without throwing.
 */
function extractPlan(text: string): PlanData | null {
  const match = text.match(PLAN_BLOCK_PATTERN);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1].trim()) as Record<string, unknown>;
    if (parsed && Array.isArray(parsed['steps'])) {
      return parsed as unknown as PlanData;
    }
  } catch {
    // Invalid JSON in plan block — ignore silently
  }
  return null;
}

// ── Tool result compaction ────────────────────────────────────────────────────

/**
 * Wrap every tool's execute function so its result is compacted before being
 * added to the conversation history sent back to the model.
 */
function applyToolCompaction(tools: Record<string, unknown>): Record<string, unknown> {
  const wrapped: Record<string, unknown> = {};
  for (const [name, tool] of Object.entries(tools)) {
    const t = tool as Record<string, unknown>;
    if (typeof t['execute'] === 'function') {
      const originalExecute = t['execute'] as (...args: unknown[]) => Promise<unknown>;
      wrapped[name] = {
        ...t,
        execute: async (...args: unknown[]) => {
          const result = await originalExecute(...args);
          return compactToolResult(name, result);
        },
      };
    } else {
      wrapped[name] = tool;
    }
  }
  return wrapped;
}

// ── Checkpoint tool wrapping ──────────────────────────────────────────────────

/**
 * Tool names that modify files on disk.
 * These are the Agent SDK built-in names forwarded through the Ava tool layer.
 */
const FILE_MODIFYING_TOOLS = new Set(['Write', 'Edit']);

/**
 * Wrap Write and Edit tools so their file state is captured before execution.
 * Other tools are passed through unchanged.
 *
 * The capture step is idempotent — if the same file is touched multiple times
 * within the same checkpoint, only the first (pre-modification) state is stored.
 */
function applyCheckpointing(
  tools: Record<string, unknown>,
  checkpointService: CheckpointService,
  sessionId: string,
  checkpointId: string
): Record<string, unknown> {
  const wrapped: Record<string, unknown> = {};
  for (const [name, tool] of Object.entries(tools)) {
    const t = tool as Record<string, unknown>;
    if (FILE_MODIFYING_TOOLS.has(name) && typeof t['execute'] === 'function') {
      const originalExecute = t['execute'] as (...args: unknown[]) => Promise<unknown>;
      wrapped[name] = {
        ...t,
        execute: async (...args: unknown[]) => {
          // Capture file state BEFORE the tool modifies it
          const input = args[0] as Record<string, unknown> | undefined;
          const filePath = input?.['file_path'] as string | undefined;
          if (filePath) {
            await checkpointService.captureFileState(sessionId, checkpointId, filePath);
          }
          return originalExecute(...args);
        },
      };
    } else {
      wrapped[name] = tool;
    }
  }
  return wrapped;
}

// ── Route factory ─────────────────────────────────────────────────────────────

export function createChatRoutes(services: ServiceContainer): Router {
  const router = Router();
  const toolProgressEmitter = new ToolProgressEmitter(services.events);

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
        messages: UIMessage[];
        model?: string;
        system?: string;
        context?: NotesContext;
        projectPath?: string;
      };

      if (!rawMessages || !Array.isArray(rawMessages) || rawMessages.length === 0) {
        res.status(400).json({ error: 'messages array is required' });
        return;
      }

      // Establish session identity for checkpointing.
      // Clients should send a stable x-session-id header across turns in the same
      // chat; if absent a per-request UUID is used (rewind still works within the
      // same request, and the client can opt-in to cross-turn rewind via the header).
      const sessionId = (req.headers['x-session-id'] as string | undefined) || randomUUID();
      const lastUserMessage = [...rawMessages].reverse().find((m) => m.role === 'user');
      const messageId = lastUserMessage?.id ?? randomUUID();

      // Create a checkpoint for this message turn before any tools execute.
      const checkpointId = services.checkpointService.createCheckpoint(sessionId, messageId);

      // Load AvaConfig when a projectPath is available; fall back to defaults
      const avaConfig: AvaConfig = projectPath
        ? await loadAvaConfig(projectPath)
        : { ...DEFAULT_AVA_CONFIG, toolGroups: { ...DEFAULT_AVA_CONFIG.toolGroups } };

      // Build canUseTool callback for gated subagent trust.
      // Full trust (default) returns undefined — subagents run with bypassPermissions.
      const canUseTool =
        avaConfig.subagentTrust === 'gated'
          ? buildCanUseToolCallback('gated', services.events)
          : undefined;

      // Model selection: session picker (header/body) > AvaConfig.model > default (sonnet)
      // The inline ChatModelSelect sends x-model-alias; config model is the fallback for new chats.
      const modelAlias =
        (req.headers['x-model-alias'] as string) || bodyModel || avaConfig.model || 'sonnet';
      const effortLevel = (req.headers['x-effort-level'] as string) || 'medium';

      const resolvedModelId = resolveModelString(modelAlias, 'sonnet');
      const aiModel = await getAnthropicModel(resolvedModelId);

      // Load Ava-level context (project root CLAUDE.md + Ava skill prompt)
      let projectContext: string | undefined;
      if (avaConfig.contextInjection && projectPath) {
        projectContext = await loadAvaContext(projectPath);
      }

      // Conditionally fetch live sitrep
      let sitrep: string | undefined;
      if (avaConfig.sitrepInjection && projectPath) {
        try {
          sitrep = await getSitrep(projectPath);
        } catch (err) {
          logger.warn('Failed to generate sitrep:', err);
        }

        // Append presence section when userPresenceDetection feature flag is enabled
        try {
          const globalSettings = await services.settingsService.getGlobalSettings();
          if (globalSettings.featureFlags?.userPresenceDetection) {
            const presenceSection = services.contextAggregator.formatPresenceSection();
            sitrep = sitrep ? `${sitrep}\n\n${presenceSection}` : presenceSection;
          }
        } catch (err) {
          logger.warn('Failed to append presence section to sitrep:', err);
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

      // Build tool set for this request — gated by per-project toolGroups config.
      // Read the userPresenceDetection flag from global settings (non-blocking fallback to false).
      let userPresenceDetection = false;
      try {
        const globalSettings = await services.settingsService.getGlobalSettings();
        userPresenceDetection = globalSettings.featureFlags?.userPresenceDetection ?? false;
      } catch {
        // Settings unavailable — safe default (flag disabled)
      }
      // Convert ava-specific mcpServers to the agent SDK format and merge with
      // project-level MCP servers configured in global settings.  The converted
      // list is passed down to tools so inner agents delegated
      // from Ava chat can access the same additional MCP servers.
      const avaMcpServers = (avaConfig.mcpServers ?? [])
        .filter((s) => s.enabled !== false)
        .map((s) => ({
          name: s.name,
          ...(s.type !== undefined && { type: s.type }),
          ...(s.command !== undefined && { command: s.command }),
          ...(s.args !== undefined && { args: s.args }),
          ...(s.env !== undefined && { env: s.env }),
          ...(s.url !== undefined && { url: s.url }),
          ...(s.headers !== undefined && { headers: s.headers }),
        }));

      const rawTools = projectPath
        ? buildAvaTools(
            projectPath,
            {
              featureLoader: services.featureLoader,
              autoModeService: services.autoModeService,
              leadEngineerService: services.leadEngineerService,
              agentService: services.agentService,
              metricsService: services.metricsService,
              settingsService: services.settingsService,
              projectService: services.projectService,
              projectLifecycleService: services.projectLifecycleService,
              projectPMService: undefined,
              toolProgressEmitter,
              sensorRegistryService: userPresenceDetection
                ? services.sensorRegistryService
                : undefined,
              canUseTool,
              discordBotService: services.discordBotService,
              calendarService: services.calendarService,
              healthMonitorService: services.healthMonitorService,
            },
            {
              ...avaConfig.toolGroups,
              userPresenceDetection,
              autoApproveTools: avaConfig.autoApproveTools,
            },
            avaMcpServers.length > 0 ? avaMcpServers : undefined
          )
        : {};
      // Apply checkpointing first (captures file state before execution),
      // then compaction (compacts tool results after execution).
      const withCheckpoints = applyCheckpointing(
        rawTools,
        services.checkpointService,
        sessionId,
        checkpointId
      );
      const tools = applyToolCompaction(withCheckpoints) as typeof rawTools;

      // ── Slash command expansion ─────────────────────────────────────────────
      // If the last user message starts with a slash command, intercept it:
      //   1. Look up the command body from CommandRegistryService
      //   2. Expand placeholders ($ARGUMENTS, $1/$2, @file, `!cmd`)
      //   3. Prepend the expanded body to the system prompt for this turn
      //   4. Restrict tools to the command's allowed-tools (if specified)
      // Unknown slash commands pass through as normal messages (no-op).

      let commandSystemPrefix: string | undefined;
      // Start with the full tool set; may be narrowed by command frontmatter
      let activeTools: typeof tools = tools;

      if (lastUserMessage) {
        const lastText = extractMessageText(lastUserMessage);
        const parsed = parseSlashCommand(lastText);

        if (parsed) {
          const command = services.commandRegistryService?.get(parsed.name);

          if (command?.body) {
            try {
              commandSystemPrefix = await expandCommandBody(command.body, {
                argumentString: parsed.argumentString,
                positionalArgs: parsed.positionalArgs,
                projectPath: projectPath,
              });
              logger.info(
                `Slash command /${parsed.name} expanded (${commandSystemPrefix?.length} chars)`
              );
            } catch (err) {
              logger.warn(`Command expansion failed for /${parsed.name}:`, err);
            }

            // Apply tool restrictions from command frontmatter
            if (command.allowedTools && command.allowedTools.length > 0) {
              const allowedSet = new Set(command.allowedTools);
              activeTools = Object.fromEntries(
                Object.entries(tools).filter(([name]) => allowedSet.has(name))
              ) as typeof tools;
              logger.info(
                `Tool set restricted to [${[...allowedSet].join(', ')}] for /${parsed.name}`
              );
            }
          }
          // If command not found or has no body, pass through as a normal message
        }
      }

      // Prepend the expanded command body to the system prompt for this turn
      const finalSystemPrompt = commandSystemPrefix
        ? `${commandSystemPrefix}\n\n---\n\n${systemPrompt}`
        : systemPrompt;
      // Enable extended thinking for models that support it (opus / sonnet).
      // Uses adaptive thinking with effort level from the client UI.
      const extendedThinking = modelSupportsExtendedThinking(resolvedModelId);
      const validEffort = ['low', 'medium', 'high'].includes(effortLevel)
        ? (effortLevel as 'low' | 'medium' | 'high')
        : 'medium';

      // Convert UIMessages (with tool-invocation, reasoning, approval parts) to
      // ModelMessages that streamText understands. This preserves tool call/result
      // pairs required for HITL approval continuation and multi-turn tool use.
      const convertedMessages = await convertToModelMessages(rawMessages, { tools });

      // Apply message-level compaction when the estimated token count exceeds the
      // budget. Older tool results are summarized to one-line and long assistant
      // responses are truncated; the most recent messages are preserved verbatim.
      const preCompactionTokens = estimateTokens(convertedMessages);
      const messages = compactMessageHistory(convertedMessages, COMPACTION_BUDGET_TOKENS);
      if (messages !== convertedMessages) {
        logger.info(
          `Message compaction applied: ${preCompactionTokens} -> ${estimateTokens(messages)} est. tokens, ${convertedMessages.length} messages`
        );
      }

      // Estimate payload size for perf tracking
      const systemPromptChars = systemPrompt.length;
      const messagesJson = JSON.stringify(messages);
      const messagesChars = messagesJson.length;
      const estimatedInputTokens = Math.ceil((systemPromptChars + messagesChars) / 4);
      const requestStartTime = Date.now();

      logger.info(
        `Chat request: ${messages.length} messages, model=${modelAlias}, ~${estimatedInputTokens} est. input tokens, ` +
          `systemPrompt=${(systemPromptChars / 1024).toFixed(1)}KB, messages=${(messagesChars / 1024).toFixed(1)}KB, ` +
          `projectPath=${projectPath ?? 'none'}, contextInjection=${avaConfig.contextInjection}, sitrepInjection=${avaConfig.sitrepInjection}, extendedThinking=${extendedThinking}, effort=${validEffort}`
      );

      if (estimatedInputTokens > 150_000) {
        logger.warn(
          `Chat payload approaching context limit: ~${estimatedInputTokens} tokens, ${messages.length} messages, ${(messagesChars / 1024).toFixed(0)}KB payload`
        );
      }

      const result = streamText({
        model: aiModel,
        messages,
        system: systemPrompt,
        tools,
        stopWhen: stepCountIs(10),
        providerOptions: {
          anthropic: {
            ...(extendedThinking && {
              thinking: { type: 'adaptive' },
            }),
            outputConfig: { effort: validEffort },
            contextManagement: {
              edits: [
                {
                  type: 'clear_tool_uses_20250919',
                  trigger: { type: 'input_tokens', value: 80000 },
                  keep: { type: 'tool_uses', value: 5 },
                  clearAtLeast: { type: 'input_tokens', value: 10000 },
                  clearToolInputs: true,
                },
                {
                  type: 'compact_20260112',
                  trigger: { type: 'input_tokens', value: 150000 },
                },
              ],
            },
          },
        },
        experimental_telemetry: {
          isEnabled: true,
          metadata: {
            route: '/api/chat',
            modelAlias,
          },
        },
      });

      // Wrap the AI stream with a citation extraction step.
      //
      // 1. writer.merge() forwards all AI SDK UI message chunks to the client as
      //    they arrive (text, reasoning, tool calls, etc.).
      // 2. result.text is a separate consumer of the underlying model stream that
      //    resolves with the complete assistant text once streaming finishes.
      // 3. After the text is resolved, we extract [[feature:id]] / [[doc:path]]
      //    patterns, resolve them, and write a data-citations chunk that the client
      //    uses to populate inline badges and the Sources section.
      //
      // The createUIMessageStream stream stays open until the execute function
      // resolves, so the data-citations chunk is guaranteed to arrive before the
      // stream closes.
      const uiStream = createUIMessageStream({
        execute: async ({ writer }) => {
          // Forward the main AI response stream to the client
          writer.merge(result.toUIMessageStream());

          // Detect Agent tool_use blocks and emit data-subagent progress chunks.
          // result.fullStream is a separate tee of the underlying model stream so
          // it can be consumed independently of result.toUIMessageStream() above.
          // We track tool-call → tool-result pairs by toolCallId to correlate
          // spawning events with their final done/failed status.
          try {
            const pendingSubagents = new Map<
              string,
              { subagentType: string; description: string }
            >();
            for await (const part of result.fullStream) {
              const p = part as unknown as Record<string, unknown>;
              if (p['type'] === 'tool-call' && p['toolName'] === 'Agent') {
                const args = (p['args'] ?? {}) as Record<string, unknown>;
                const subagentType = String(args['subagent_type'] ?? 'unknown');
                const description = String(args['description'] ?? '');
                pendingSubagents.set(String(p['toolCallId'] ?? ''), {
                  subagentType,
                  description,
                });
                writer.write({
                  type: 'data-subagent',
                  data: {
                    subagentType,
                    status: 'spawning' as SubagentStatus,
                    description,
                    resultSummary: null,
                  } satisfies SubagentProgress,
                } as UIMessageChunk);
              } else if (p['type'] === 'tool-result' && p['toolName'] === 'Agent') {
                const toolCallId = String(p['toolCallId'] ?? '');
                const pending = pendingSubagents.get(toolCallId);
                const status: SubagentStatus = p['isError'] === true ? 'failed' : 'done';
                const rawResult = p['result'];
                const resultText =
                  typeof rawResult === 'string'
                    ? rawResult
                    : rawResult != null
                      ? JSON.stringify(rawResult)
                      : '';
                writer.write({
                  type: 'data-subagent',
                  data: {
                    subagentType: pending?.subagentType ?? 'unknown',
                    status,
                    description: pending?.description ?? '',
                    resultSummary: resultText.slice(0, 500) || null,
                  } satisfies SubagentProgress,
                } as UIMessageChunk);
                pendingSubagents.delete(toolCallId);
              }
            }
          } catch (err) {
            logger.warn('Subagent progress stream processing failed:', err);
          }

          // Await the full text (separate internal stream tee in streamText)
          const fullText = await result.text;

          // Log completion metrics and stream usage data to the client
          try {
            const usage = await result.usage;
            const durationMs = Date.now() - requestStartTime;
            logger.info(
              `Chat complete: ${durationMs}ms, ` +
                `inputTokens=${usage.inputTokens}, outputTokens=${usage.outputTokens}, ` +
                `totalTokens=${(usage.inputTokens ?? 0) + (usage.outputTokens ?? 0)}, ` +
                `responseChars=${fullText.length}, messages=${messages.length}`
            );

            // Send real token usage to the client as a data part on the message.
            // The AI SDK surfaces this as { type: 'data-usage', data: { ... } } in
            // the message's parts array — same pattern as data-citations and data-plan.
            writer.write({
              type: 'data-usage',
              data: {
                inputTokens: usage.inputTokens ?? 0,
                outputTokens: usage.outputTokens ?? 0,
              },
            } as UIMessageChunk);

            // Detect server-side compaction activation (compact_20260112).
            // When compaction fires, the Anthropic API includes a compaction block
            // in the response. The AI SDK surfaces provider-specific data via
            // providerMetadata — log when this occurs so we can monitor its frequency.
            try {
              const meta = await result.providerMetadata;
              const anthropicMeta = meta?.['anthropic'] as Record<string, unknown> | undefined;
              if (anthropicMeta && 'compaction' in anthropicMeta) {
                logger.info(
                  `Server-side compaction activated (compact_20260112): ${JSON.stringify(anthropicMeta['compaction'])}`
                );
              }
            } catch {
              // providerMetadata unavailable — not critical, skip
            }
          } catch {
            logger.warn(`Chat complete: ${Date.now() - requestStartTime}ms (usage unavailable)`);
          }

          // Resolve citations when a projectPath is available
          if (projectPath && fullText) {
            try {
              const citations = await extractAndResolveCitations(
                fullText,
                projectPath,
                services.featureLoader
              );
              if (citations.length > 0) {
                writer.write({
                  type: 'data-citations',
                  data: citations,
                } as UIMessageChunk);
              }
            } catch (err) {
              logger.warn('Citation extraction failed:', err);
            }
          }

          // Extract and stream a plan block when the response contains one
          if (fullText) {
            try {
              const plan = extractPlan(fullText);
              if (plan) {
                writer.write({
                  type: 'data-plan',
                  data: plan,
                } as UIMessageChunk);
              }
            } catch (err) {
              logger.warn('Plan extraction failed:', err);
            }
          }
        },
        onError: (err) => {
          logger.error('UI message stream error:', err);
          return err instanceof Error ? err.message : 'Stream error';
        },
      });

      // Pipe the wrapped UI message stream (with citations) to the HTTP response
      pipeUIMessageStreamToResponse({ response: res, stream: uiStream });
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

  /**
   * POST /api/chat/tool-approval
   *
   * Resolves a pending subagent tool-approval request for the gated trust model.
   * Accepts { approvalId, approved, message? } and emits
   * `subagent:tool-approval-response` on the shared event bus so the waiting
   * `canUseTool` promise in agent-trust.ts resolves immediately.
   *
   * Body: { approvalId: string, approved: boolean, message?: string }
   */
  router.post('/tool-approval', (req: Request, res: Response) => {
    const { approvalId, approved, message } = req.body as {
      approvalId: string;
      approved: boolean;
      message?: string;
    };

    if (!approvalId || typeof approved !== 'boolean') {
      res.status(400).json({ error: 'approvalId and approved (boolean) are required' });
      return;
    }

    const response: ToolApprovalResponse = {
      approvalId,
      approved,
      ...(message !== undefined && { message }),
    };

    // Use EventType cast — subagent approval event types are defined in
    // libs/types/src/event.ts but the shared dist may be ahead of the published package.
    services.events.emit('subagent:tool-approval-response' as EventType, response);

    logger.info(`Tool approval response emitted: approvalId=${approvalId}, approved=${approved}`);

    res.json({ ok: true });
  });

  /**
   * GET /api/chat/commands
   *
   * Returns the registered slash command registry as a typed array for the
   * ChatInput autocomplete dropdown. Each entry includes name, description,
   * argumentHint, and source. The body field is excluded to keep payloads small.
   *
   * Response: SlashCommandSummary[]
   */
  router.get('/commands', (_req: Request, res: Response) => {
    const commands = services.commandRegistryService
      .getAll()
      .map(({ body: _body, ...summary }) => summary);
    res.json(commands);
  });

  /**
   * POST /api/chat/rewind
   *
   * Rewinds the chat session to a previous checkpoint, restoring file state
   * as it was when that checkpoint was created.
   *
   * Body: { checkpointId?: string, sessionId?: string }
   *   - checkpointId: optional — if omitted, rewinds to the most recent checkpoint
   *   - sessionId: optional — identifies the chat session to rewind
   *
   * Response: { ok: true, restoredFiles: string[], checkpointId: string }
   *         | { ok: false, message: string }
   */
  router.post('/rewind', async (req: Request, res: Response) => {
    const { checkpointId, sessionId } = req.body as {
      checkpointId?: string;
      sessionId?: string;
    };

    logger.info(
      `Rewind requested: checkpointId=${checkpointId ?? 'most-recent'}, sessionId=${sessionId ?? 'none'}`
    );

    try {
      // Delegate to CheckpointService when available on the service container.
      // The service exposes a rewind(checkpointId?) method that restores files
      // and returns the list of restored paths.
      const checkpointService = (services as unknown as Record<string, unknown>)[
        'checkpointService'
      ];

      if (
        checkpointService &&
        typeof (checkpointService as Record<string, unknown>)['rewind'] === 'function'
      ) {
        const rewindFn = (checkpointService as Record<string, unknown>)['rewind'] as (
          checkpointId?: string,
          sessionId?: string
        ) => Promise<{ restoredFiles: string[]; checkpointId: string } | null>;

        const result = await rewindFn(checkpointId, sessionId);

        if (!result) {
          res.json({ ok: false, message: 'No checkpoints exist to rewind to.' });
          return;
        }

        logger.info(
          `Rewind complete: checkpointId=${result.checkpointId}, restoredFiles=${result.restoredFiles.length}`
        );
        res.json({
          ok: true,
          restoredFiles: result.restoredFiles,
          checkpointId: result.checkpointId,
        });
      } else {
        // CheckpointService not yet wired — return graceful message
        logger.warn('CheckpointService not available on service container');
        res.json({ ok: false, message: 'No checkpoints exist to rewind to.' });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Rewind failed';
      logger.error('Rewind error:', err);
      res.status(500).json({ ok: false, message });
    }
  });

  return router;
}
