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
import { anthropic } from '@ai-sdk/anthropic';
import { createLogger } from '@protolabs-ai/utils';
import { resolveModelString } from '@protolabs-ai/model-resolver';
import { buildAvaSystemPrompt, type NotesContext } from './personas.js';
import { loadAvaConfig, DEFAULT_AVA_CONFIG, type AvaConfig } from './ava-config.js';
import { getSitrep } from './sitrep.js';
import { buildAvaTools } from './ava-tools.js';
import type { PlanData } from './ava-tools.js';
import { ToolProgressEmitter } from './tool-progress.js';
import type { ServiceContainer } from '../../server/services.js';
import type { FeatureLoader } from '../../services/feature-loader.js';

export type { AvaConfig };

const logger = createLogger('ChatRoutes');

/**
 * Budget tokens for extended thinking (Anthropic "extended thinking" feature).
 * Chosen to allow meaningful multi-step reasoning without excessive cost.
 */
const THINKING_BUDGET_TOKENS = 10_000;

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

      // Load AvaConfig when a projectPath is available; fall back to defaults
      const avaConfig: AvaConfig = projectPath
        ? await loadAvaConfig(projectPath)
        : { ...DEFAULT_AVA_CONFIG, toolGroups: { ...DEFAULT_AVA_CONFIG.toolGroups } };

      // Model selection: session picker (header/body) > AvaConfig.model > default (sonnet)
      // The inline ChatModelSelect sends x-model-alias; config model is the fallback for new chats.
      const modelAlias =
        (req.headers['x-model-alias'] as string) || bodyModel || avaConfig.model || 'sonnet';

      const resolvedModelId = resolveModelString(modelAlias, 'sonnet');
      const aiModel = anthropic(resolvedModelId);

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
      const tools = projectPath
        ? buildAvaTools(
            projectPath,
            {
              featureLoader: services.featureLoader,
              autoModeService: services.autoModeService,
              agentService: services.agentService,
              roleRegistryService: services.roleRegistryService,
              agentFactoryService: services.agentFactoryService,
              dynamicAgentExecutor: services.dynamicAgentExecutor,
              metricsService: services.metricsService,
              settingsService: services.settingsService,
              projectService: services.projectService,
              toolProgressEmitter,
              sensorRegistryService: userPresenceDetection
                ? services.sensorRegistryService
                : undefined,
            },
            {
              ...avaConfig.toolGroups,
              userPresenceDetection,
              autoApproveTools: avaConfig.autoApproveTools,
            }
          )
        : {};

      // Enable extended thinking for models that support it (opus / sonnet).
      // The thinking budget caps how many tokens the model may use for internal
      // reasoning before producing its visible response.
      const extendedThinking = modelSupportsExtendedThinking(resolvedModelId);

      // Convert UIMessages (with tool-invocation, reasoning, approval parts) to
      // ModelMessages that streamText understands. This preserves tool call/result
      // pairs required for HITL approval continuation and multi-turn tool use.
      const messages = await convertToModelMessages(rawMessages, { tools });

      logger.info(
        `Chat request: ${messages.length} messages, model=${modelAlias}, projectPath=${projectPath ?? 'none'}, contextInjection=${avaConfig.contextInjection}, sitrepInjection=${avaConfig.sitrepInjection}, extendedThinking=${extendedThinking}`
      );

      const result = streamText({
        model: aiModel,
        messages,
        system: systemPrompt,
        tools,
        stopWhen: stepCountIs(10),
        ...(extendedThinking && {
          providerOptions: {
            anthropic: {
              thinking: { type: 'enabled', budgetTokens: THINKING_BUDGET_TOKENS },
            },
          },
        }),
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

          // Await the full text (separate internal stream tee in streamText)
          const fullText = await result.text;

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

  return router;
}
