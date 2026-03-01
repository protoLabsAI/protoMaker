/**
 * Maintenance LangGraph flow — reference implementation for Automation-powered health checks.
 *
 * This is the first automation migrated from a hardcoded maintenance task to a real LangGraph
 * StateGraph. It replaces the board-health cron task with a proper flow that can be
 * composed, extended, and observed like any other flow in the system.
 *
 * Three sequential nodes:
 *   START → loadBoardState → analyzeHealth → reportToDiscord → END
 *
 * Dependencies are injected via MaintenanceFlowDeps — structural interfaces only,
 * so this flow has no hard dependencies on @protolabs-ai/tools or concrete service classes.
 */

import { StateGraph, Annotation, END, START } from '@langchain/langgraph';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Feature } from '@protolabs-ai/types';

// ---------------------------------------------------------------------------
// Minimal structural interfaces (dependency injection without concrete imports)
// ---------------------------------------------------------------------------

/**
 * Subset of FeatureLoader used by the maintenance flow.
 * Any object with a matching getAll signature satisfies this interface.
 */
export interface MaintenanceFeatureLoader {
  getAll: (projectPath: string) => Promise<Feature[]>;
}

/**
 * Subset of DiscordBot used by the maintenance flow.
 * Any object with a matching sendMessage signature satisfies this interface.
 */
export interface MaintenanceDiscordBot {
  sendMessage: (channelId: string, content: string) => Promise<{ id: string }>;
}

/**
 * All dependencies required to create a maintenance flow instance.
 */
export interface MaintenanceFlowDeps {
  /** Feature loader for reading board state */
  featureLoader: MaintenanceFeatureLoader;
  /** LangChain BaseChatModel for board health analysis */
  model: BaseChatModel;
  /** Discord bot for sending the health report */
  discordBot: MaintenanceDiscordBot;
  /** Absolute path to the project directory */
  projectPath: string;
  /** Discord channel ID to send the report to */
  discordChannelId: string;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const MaintenanceStateAnnotation = Annotation.Root({
  boardSummary: Annotation<string>,
  analysis: Annotation<string>,
  reportSent: Annotation<boolean>,
  error: Annotation<string>,
});

type MaintenanceState = typeof MaintenanceStateAnnotation.State;

// ---------------------------------------------------------------------------
// Node factories
// ---------------------------------------------------------------------------

/**
 * loadBoardState: Fetches all features and builds a concise board summary string.
 * Groups features by status, lists blocked feature titles for quick triage.
 */
function createLoadBoardStateNode(deps: MaintenanceFlowDeps) {
  return async (_state: MaintenanceState): Promise<Partial<MaintenanceState>> => {
    const features = await deps.featureLoader.getAll(deps.projectPath);

    const byStatus = features.reduce<Record<string, number>>((acc, f) => {
      const status = f.status ?? 'unknown';
      acc[status] = (acc[status] ?? 0) + 1;
      return acc;
    }, {});

    const statusLines = Object.entries(byStatus)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([status, count]) => `  ${status}: ${count}`)
      .join('\n');

    const blockedFeatures = features.filter((f) => f.status === 'blocked');
    const blockedSection =
      blockedFeatures.length > 0
        ? `\n\nBlocked features (${blockedFeatures.length}):\n` +
          blockedFeatures.map((f) => `  - ${f.title ?? f.id}`).join('\n')
        : '';

    const boardSummary =
      `Board state — ${features.length} total features:\n${statusLines}` + blockedSection;

    return { boardSummary };
  };
}

/**
 * analyzeHealth: Calls the LLM to analyze board health and produce a concise report
 * suitable for posting to a Discord channel.
 */
function createAnalyzeHealthNode(deps: MaintenanceFlowDeps) {
  return async (state: MaintenanceState): Promise<Partial<MaintenanceState>> => {
    const prompt =
      `You are a project health analyst. Review the following board state and provide a ` +
      `concise health report (3–5 bullet points) suitable for a Discord channel update. ` +
      `Flag any concerns (too many blocked features, large backlogs, stalled in-progress work). ` +
      `Keep the response under 300 words and use markdown bullet points.\n\n` +
      `Board state:\n${state.boardSummary}\n\nHealth report:`;

    const response = await deps.model.invoke([{ role: 'user', content: prompt }]);
    const analysis =
      typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

    return { analysis };
  };
}

/**
 * reportToDiscord: Sends the health analysis to the configured Discord channel.
 * Truncates to 2000 chars to stay within Discord's message limit.
 */
function createReportToDiscordNode(deps: MaintenanceFlowDeps) {
  return async (state: MaintenanceState): Promise<Partial<MaintenanceState>> => {
    const message = `**Board Health Report**\n\n${state.analysis}`;
    const truncated = message.length > 2000 ? message.slice(0, 1997) + '...' : message;

    await deps.discordBot.sendMessage(deps.discordChannelId, truncated);
    return { reportSent: true };
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates and compiles the maintenance LangGraph flow.
 *
 * Flow topology: START → loadBoardState → analyzeHealth → reportToDiscord → END
 *
 * Usage (server-side):
 * ```typescript
 * import { createMaintenanceFlow } from '@protolabs-ai/flows';
 * import { createLangChainModel } from '@protolabs-ai/llm-providers';
 *
 * const flow = createMaintenanceFlow({
 *   featureLoader,
 *   model: createLangChainModel({ model: 'claude-haiku-4-5-20251001' }),
 *   discordBot,
 *   projectPath: '/path/to/project',
 *   discordChannelId: '1469080556720623699',
 * });
 *
 * await flow.invoke({});
 * ```
 *
 * @param deps - Flow dependencies (featureLoader, LLM model, discordBot, projectPath, channelId)
 * @returns Compiled StateGraph ready for .invoke()
 */
export function createMaintenanceFlow(deps: MaintenanceFlowDeps) {
  const graph = new StateGraph(MaintenanceStateAnnotation);

  graph.addNode('loadBoardState', createLoadBoardStateNode(deps));
  graph.addNode('analyzeHealth', createAnalyzeHealthNode(deps));
  graph.addNode('reportToDiscord', createReportToDiscordNode(deps));

  // TypeScript's strict node-name literal inference requires casting here.
  // The same pattern is used in coordinator-flow.ts and research-flow.ts.
  const g = graph as unknown as {
    addEdge: (from: string, to: string) => void;
  };

  g.addEdge(START as unknown as string, 'loadBoardState');
  g.addEdge('loadBoardState', 'analyzeHealth');
  g.addEdge('analyzeHealth', 'reportToDiscord');
  g.addEdge('reportToDiscord', END as unknown as string);

  return graph.compile();
}
