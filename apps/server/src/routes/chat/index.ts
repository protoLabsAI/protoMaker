/**
 * Chat Routes — AI SDK streaming chat endpoint
 *
 * Replaces the CopilotKit runtime with a direct Vercel AI SDK integration.
 * Uses @ai-sdk/anthropic for Claude models with streamText for SSE streaming.
 * Langfuse OTEL tracing is enabled when configured via environment variables.
 *
 * Per-request enrichment:
 * - Loads AvaConfig from <projectPath>/.automaker/ava-config.json
 * - Injects project context via loadContextFiles when contextInjection is true
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
  type ModelMessage,
  type UIMessageChunk,
} from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { createLogger, loadContextFiles } from '@protolabs-ai/utils';
import { resolveModelString } from '@protolabs-ai/model-resolver';
import { buildAvaSystemPrompt, type NotesContext } from './personas.js';
import { loadAvaConfig, DEFAULT_AVA_CONFIG, type AvaConfig } from './ava-config.js';
import { getSitrep } from './sitrep.js';
import { buildAvaTools } from './ava-tools.js';
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
 * Returns true when the resolved model ID supports Anthropic extended thinking.
 * Currently all claude-opus and claude-sonnet models support this feature.
 */
function modelSupportsExtendedThinking(resolvedModelId: string): boolean {
  return resolvedModelId.includes('opus') || resolvedModelId.includes('sonnet');
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

// ── Route factory ─────────────────────────────────────────────────────────────

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
        approvedActions,
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
        /** Pre-approved destructive tool calls for the HITL confirmation flow */
        approvedActions?: Array<{ toolName: string; inputHash: string }>;
      };

      if (!rawMessages || !Array.isArray(rawMessages) || rawMessages.length === 0) {
        res.status(400).json({ error: 'messages array is required' });
        return;
      }

      const messages = toModelMessages(rawMessages);

      // Load AvaConfig when a projectPath is available; fall back to defaults
      const avaConfig: AvaConfig = projectPath
        ? await loadAvaConfig(projectPath)
        : { ...DEFAULT_AVA_CONFIG, toolGroups: { ...DEFAULT_AVA_CONFIG.toolGroups } };

      // Model selection: AvaConfig.model > header > body > default (sonnet)
      const modelAlias =
        avaConfig.model || (req.headers['x-model-alias'] as string) || bodyModel || 'sonnet';

      const resolvedModelId = resolveModelString(modelAlias, 'sonnet');
      const aiModel = anthropic(resolvedModelId);

      // Conditionally load project context files
      let projectContext: string | undefined;
      if (avaConfig.contextInjection && projectPath) {
        try {
          const contextResult = await loadContextFiles({ projectPath });
          projectContext = contextResult.formattedPrompt || undefined;
        } catch (err) {
          logger.warn('Failed to load context files:', err);
        }
      }

      // Conditionally fetch live sitrep
      let sitrep: string | undefined;
      if (avaConfig.sitrepInjection && projectPath) {
        try {
          sitrep = await getSitrep(projectPath);
        } catch (err) {
          logger.warn('Failed to generate sitrep:', err);
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
      // approvedActions carries pre-approved destructive-tool call identifiers for
      // the HITL confirmation flow.
      const tools = projectPath
        ? buildAvaTools(
            projectPath,
            {
              featureLoader: services.featureLoader,
              autoModeService: services.autoModeService,
              agentService: services.agentService,
            },
            {
              ...avaConfig.toolGroups,
              approvedActions: approvedActions ?? [],
            }
          )
        : {};

      // Enable extended thinking for models that support it (opus / sonnet).
      // The thinking budget caps how many tokens the model may use for internal
      // reasoning before producing its visible response.
      const extendedThinking = modelSupportsExtendedThinking(resolvedModelId);

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
