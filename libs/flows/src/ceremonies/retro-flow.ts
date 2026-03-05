/**
 * Retro ceremony LangGraph flow.
 *
 * Replaces RetroCeremony class hierarchy with three sequential nodes:
 *   START -> loadFeatureHistory -> generateRetroContent -> postToDiscord -> END
 *
 * Dependencies are injected via RetroFlowDeps — structural interfaces only,
 * so this flow has no hard dependencies on concrete service classes.
 *
 * Usage (server-side):
 * ```typescript
 * import { createRetroFlow } from '@protolabsai/flows';
 *
 * const flow = createRetroFlow({
 *   featureLoader,
 *   model, // BaseChatModel instance
 *   discordBot,
 *   projectPath: '/path/to/project',
 *   projectSlug: 'my-project',
 *   milestoneSlug: 'milestone-1',
 *   milestoneTitle: 'Foundation',
 *   milestoneNumber: 1,
 *   projectTitle: 'My Project',
 *   discordChannelId: '1469080556720623699',
 * });
 *
 * await flow.invoke({});
 * ```
 */

import { StateGraph, Annotation, END, START } from '@langchain/langgraph';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Feature } from '@protolabsai/types';

// ---------------------------------------------------------------------------
// Minimal structural interfaces (dependency injection without concrete imports)
// ---------------------------------------------------------------------------

/**
 * Subset of FeatureLoader used by the retro flow.
 */
export interface RetroFeatureLoader {
  getAll: (projectPath: string) => Promise<Feature[]>;
}

/**
 * Subset of DiscordBot used by the retro flow.
 */
export interface RetroDiscordBot {
  sendMessage: (channelId: string, content: string) => Promise<{ id: string }>;
}

/**
 * All dependencies required to create a retro flow instance.
 */
export interface RetroFlowDeps {
  /** Feature loader for reading milestone feature history */
  featureLoader: RetroFeatureLoader;
  /** LangChain BaseChatModel for content generation */
  model: BaseChatModel;
  /** Discord bot for posting the retro */
  discordBot: RetroDiscordBot;
  /** Absolute path to the project directory */
  projectPath: string;
  /** Project slug identifier */
  projectSlug: string;
  /** Milestone slug to generate retro for */
  milestoneSlug: string;
  /** Human-readable milestone title */
  milestoneTitle: string;
  /** Milestone number (1-based) */
  milestoneNumber: number;
  /** Human-readable project title */
  projectTitle: string;
  /** Discord channel ID to post the retro to */
  discordChannelId: string;
}

// ---------------------------------------------------------------------------
// State — fields mirror CeremonyAuditEntry data
// ---------------------------------------------------------------------------

const RetroStateAnnotation = Annotation.Root({
  // Input context (mirrors CeremonyAuditEntry projectPath, projectSlug, milestoneSlug)
  projectPath: Annotation<string>,
  projectSlug: Annotation<string>,
  milestoneSlug: Annotation<string>,
  milestoneTitle: Annotation<string>,
  milestoneNumber: Annotation<number>,
  projectTitle: Annotation<string>,
  // Loaded in loadFeatureHistory
  features: Annotation<Feature[]>,
  shippedCount: Annotation<number>,
  totalCostUsd: Annotation<number>,
  failureCount: Annotation<number>,
  // Generated in generateRetroContent (mirrors CeremonyAuditEntry payload)
  retroContent: Annotation<string>,
  // Set in postToDiscord (mirrors CeremonyAuditEntry discordMessageId, deliveryStatus)
  discordMessageId: Annotation<string>,
  discordPosted: Annotation<boolean>,
  // Error field
  error: Annotation<string>,
});

type RetroState = typeof RetroStateAnnotation.State;

// ---------------------------------------------------------------------------
// Node factories
// ---------------------------------------------------------------------------

/**
 * loadFeatureHistory: Fetches all features for the milestone and computes metrics.
 * Populates features, shippedCount, totalCostUsd, and failureCount in state.
 */
function createLoadFeatureHistoryNode(deps: RetroFlowDeps) {
  return async (_state: RetroState): Promise<Partial<RetroState>> => {
    const allFeatures = await deps.featureLoader.getAll(deps.projectPath);
    const features = allFeatures.filter((f) => f.milestoneSlug === deps.milestoneSlug);

    const shippedCount = features.filter((f) => f.status === 'done' && f.prUrl).length;
    const totalCostUsd = features.reduce((sum, f) => sum + (f.costUsd || 0), 0);
    const failureCount = features.reduce((sum, f) => sum + (f.failureCount || 0), 0);

    return { features, shippedCount, totalCostUsd, failureCount };
  };
}

/**
 * generateRetroContent: Calls the LLM to generate a milestone retrospective post.
 */
function createGenerateRetroContentNode(deps: RetroFlowDeps) {
  return async (state: RetroState): Promise<Partial<RetroState>> => {
    if (state.error) return {};

    const featureSummary = state.features
      .map(
        (f) =>
          `- ${f.title || 'Untitled'} [${f.status}]` +
          (f.prUrl ? ` PR: ${f.prUrl}` : '') +
          (f.failureCount ? ` (${f.failureCount} failures)` : '')
      )
      .join('\n');

    const prompt =
      `You are writing a milestone retrospective for a development team. ` +
      `Generate a concise retro post (under 500 words) for a Discord channel.\n\n` +
      `**Project:** ${deps.projectTitle}\n` +
      `**Milestone ${deps.milestoneNumber}:** ${deps.milestoneTitle}\n` +
      `**Features:** ${state.features.length} total, ${state.shippedCount} shipped\n` +
      `**Total Cost:** $${state.totalCostUsd.toFixed(2)}\n` +
      `**Failures/Retries:** ${state.failureCount}\n\n` +
      `**Feature List:**\n` +
      (featureSummary || '- No features found') +
      `\n\nWrite a retrospective that covers:\n` +
      `1. What was accomplished (features shipped, PRs merged)\n` +
      `2. Cost and efficiency metrics\n` +
      `3. What went well and what could improve\n` +
      `4. What's next\n\n` +
      `Use markdown formatting suitable for Discord. Be specific and reference actual features.`;

    const response = await deps.model.invoke([{ role: 'user', content: prompt }]);
    const content =
      typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

    const header = `**${deps.projectTitle}** — Milestone ${deps.milestoneNumber} Complete: ${deps.milestoneTitle}`;
    return { retroContent: `${header}\n\n${content}` };
  };
}

/**
 * postToDiscord: Sends the retro content to the configured Discord channel.
 * Truncates to 2000 chars to stay within Discord's message limit.
 */
function createRetroPostToDiscordNode(deps: RetroFlowDeps) {
  return async (state: RetroState): Promise<Partial<RetroState>> => {
    if (state.error || !state.retroContent) {
      return { discordPosted: false };
    }

    const message =
      state.retroContent.length > 2000
        ? state.retroContent.slice(0, 1997) + '...'
        : state.retroContent;

    const result = await deps.discordBot.sendMessage(deps.discordChannelId, message);
    return { discordPosted: true, discordMessageId: result.id };
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates and compiles the retro ceremony LangGraph flow.
 *
 * Flow topology:
 *   START -> loadFeatureHistory -> generateRetroContent -> postToDiscord -> END
 *
 * @param deps - Flow dependencies (featureLoader, LLM model, discordBot, identifiers)
 * @returns Compiled StateGraph ready for .invoke({})
 */
export function createRetroFlow(deps: RetroFlowDeps) {
  const graph = new StateGraph(RetroStateAnnotation);

  graph.addNode('loadFeatureHistory', createLoadFeatureHistoryNode(deps));
  graph.addNode('generateRetroContent', createGenerateRetroContentNode(deps));
  graph.addNode('postToDiscord', createRetroPostToDiscordNode(deps));

  // TypeScript's strict node-name literal inference requires casting here.
  // The same pattern is used in maintenance-flow.ts and coordinator-flow.ts.
  const g = graph as unknown as {
    addEdge: (from: string, to: string) => void;
  };

  g.addEdge(START as unknown as string, 'loadFeatureHistory');
  g.addEdge('loadFeatureHistory', 'generateRetroContent');
  g.addEdge('generateRetroContent', 'postToDiscord');
  g.addEdge('postToDiscord', END as unknown as string);

  return graph.compile();
}
