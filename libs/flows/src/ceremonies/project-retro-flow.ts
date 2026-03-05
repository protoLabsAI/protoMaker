/**
 * Project retro ceremony LangGraph flow.
 *
 * Replaces ProjectRetroCeremony class hierarchy with three sequential nodes:
 *   START -> loadProjectData -> generateRetroDoc -> archiveProject -> END
 *
 * Dependencies are injected via ProjectRetroFlowDeps — structural interfaces only,
 * so this flow has no hard dependencies on concrete service classes.
 *
 * Usage (server-side):
 * ```typescript
 * import { createProjectRetroFlow } from '@protolabsai/flows';
 *
 * const flow = createProjectRetroFlow({
 *   featureLoader,
 *   model, // BaseChatModel instance
 *   discordBot,
 *   projectPath: '/path/to/project',
 *   projectSlug: 'my-project',
 *   projectTitle: 'My Project',
 *   totalMilestones: 3,
 *   totalFeatures: 15,
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
 * Subset of FeatureLoader used by the project retro flow.
 */
export interface ProjectRetroFeatureLoader {
  getAll: (projectPath: string) => Promise<Feature[]>;
}

/**
 * Subset of DiscordBot used by the project retro flow.
 */
export interface ProjectRetroDiscordBot {
  sendMessage: (channelId: string, content: string) => Promise<{ id: string }>;
}

/**
 * All dependencies required to create a project retro flow instance.
 */
export interface ProjectRetroFlowDeps {
  /** Feature loader for reading all project features */
  featureLoader: ProjectRetroFeatureLoader;
  /** LangChain BaseChatModel for retro document generation */
  model: BaseChatModel;
  /** Discord bot for posting the project retro */
  discordBot: ProjectRetroDiscordBot;
  /** Absolute path to the project directory */
  projectPath: string;
  /** Project slug identifier */
  projectSlug: string;
  /** Human-readable project title */
  projectTitle: string;
  /** Total number of milestones in the project */
  totalMilestones: number;
  /** Total number of features in the project */
  totalFeatures: number;
  /** Discord channel ID to post the retro to */
  discordChannelId: string;
}

// ---------------------------------------------------------------------------
// State — fields mirror CeremonyAuditEntry data
// ---------------------------------------------------------------------------

const ProjectRetroStateAnnotation = Annotation.Root({
  // Input context (mirrors CeremonyAuditEntry projectPath, projectSlug)
  projectPath: Annotation<string>,
  projectSlug: Annotation<string>,
  projectTitle: Annotation<string>,
  totalMilestones: Annotation<number>,
  totalFeatures: Annotation<number>,
  // Loaded in loadProjectData
  features: Annotation<Feature[]>,
  shippedCount: Annotation<number>,
  failureCount: Annotation<number>,
  totalCostUsd: Annotation<number>,
  dataSummary: Annotation<string>,
  // Generated in generateRetroDoc (mirrors CeremonyAuditEntry payload)
  retroDoc: Annotation<string>,
  // Set in archiveProject (mirrors CeremonyAuditEntry discordMessageId, deliveryStatus)
  archived: Annotation<boolean>,
  discordMessageId: Annotation<string>,
  discordPosted: Annotation<boolean>,
  // Error field
  error: Annotation<string>,
});

type ProjectRetroState = typeof ProjectRetroStateAnnotation.State;

// ---------------------------------------------------------------------------
// Node factories
// ---------------------------------------------------------------------------

/**
 * loadProjectData: Fetches all project features and builds a data summary for the LLM.
 * Populates features, shippedCount, failureCount, totalCostUsd, and dataSummary in state.
 */
function createLoadProjectDataNode(deps: ProjectRetroFlowDeps) {
  return async (_state: ProjectRetroState): Promise<Partial<ProjectRetroState>> => {
    const allFeatures = await deps.featureLoader.getAll(deps.projectPath);
    const features = allFeatures.filter((f) => f.projectSlug === deps.projectSlug);

    const shippedCount = features.filter((f) => f.status === 'done' && f.prUrl).length;
    const failureCount = features.reduce((sum, f) => sum + (f.failureCount || 0), 0);
    const totalCostUsd = features.reduce((sum, f) => sum + (f.costUsd || 0), 0);

    const shippedSummary = features
      .filter((f) => f.status === 'done')
      .map(
        (f) =>
          `- ${f.title || 'Untitled'} — PR: ${f.prUrl || 'No PR'}, ` +
          `Cost: $${(f.costUsd || 0).toFixed(2)}`
      )
      .join('\n');

    const failedSummary = features
      .filter((f) => (f.failureCount || 0) > 0)
      .map((f) => `- ${f.title || 'Untitled'} — Failures: ${f.failureCount}`)
      .join('\n');

    const dataSummary =
      `## ${deps.projectTitle} — Project Overview\n` +
      `- Total Milestones: ${deps.totalMilestones}\n` +
      `- Total Features: ${features.length}\n` +
      `- Shipped: ${shippedCount}\n` +
      `- Total Cost: $${totalCostUsd.toFixed(2)}\n` +
      `- Total Failures/Retries: ${failureCount}\n\n` +
      `### Features Shipped (${shippedCount})\n` +
      (shippedSummary || '- None') +
      `\n\n### Features with Failures (${features.filter((f) => (f.failureCount || 0) > 0).length})\n` +
      (failedSummary || '- None');

    return { features, shippedCount, failureCount, totalCostUsd, dataSummary };
  };
}

/**
 * generateRetroDoc: Calls the LLM to generate a comprehensive project retrospective document.
 */
function createGenerateRetroDocNode(deps: ProjectRetroFlowDeps) {
  return async (state: ProjectRetroState): Promise<Partial<ProjectRetroState>> => {
    if (state.error) return {};

    const prompt =
      `You are writing a comprehensive project retrospective document. ` +
      `Generate a structured retro (under 800 words) suitable for a Discord post and archival.\n\n` +
      `${state.dataSummary}\n\n` +
      `Write a retrospective covering:\n` +
      `1. **What Went Well**: Successes, efficient patterns, high-value features\n` +
      `2. **What Went Wrong**: Failures, blockers, inefficiencies\n` +
      `3. **Lessons Learned**: Key takeaways from the project\n` +
      `4. **Action Items**: Concrete improvements for future projects\n\n` +
      `Be specific — reference actual features and numbers. Keep it engaging and actionable.`;

    const response = await deps.model.invoke([{ role: 'user', content: prompt }]);
    const content =
      typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

    const header = `**${deps.projectTitle}** — Project Complete! All milestones delivered.`;
    return { retroDoc: `${header}\n\n${content}` };
  };
}

/**
 * archiveProject: Posts the retro document to Discord and marks the project as archived.
 * Truncates to 2000 chars to stay within Discord's message limit.
 */
function createArchiveProjectNode(deps: ProjectRetroFlowDeps) {
  return async (state: ProjectRetroState): Promise<Partial<ProjectRetroState>> => {
    if (state.error || !state.retroDoc) {
      return { archived: false, discordPosted: false };
    }

    const message =
      state.retroDoc.length > 2000 ? state.retroDoc.slice(0, 1997) + '...' : state.retroDoc;

    const result = await deps.discordBot.sendMessage(deps.discordChannelId, message);

    return { archived: true, discordPosted: true, discordMessageId: result.id };
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates and compiles the project retro ceremony LangGraph flow.
 *
 * Flow topology:
 *   START -> loadProjectData -> generateRetroDoc -> archiveProject -> END
 *
 * @param deps - Flow dependencies (featureLoader, LLM model, discordBot, identifiers)
 * @returns Compiled StateGraph ready for .invoke({})
 */
export function createProjectRetroFlow(deps: ProjectRetroFlowDeps) {
  const graph = new StateGraph(ProjectRetroStateAnnotation);

  graph.addNode('loadProjectData', createLoadProjectDataNode(deps));
  graph.addNode('generateRetroDoc', createGenerateRetroDocNode(deps));
  graph.addNode('archiveProject', createArchiveProjectNode(deps));

  // TypeScript's strict node-name literal inference requires casting here.
  // The same pattern is used in maintenance-flow.ts and coordinator-flow.ts.
  const g = graph as unknown as {
    addEdge: (from: string, to: string) => void;
  };

  g.addEdge(START as unknown as string, 'loadProjectData');
  g.addEdge('loadProjectData', 'generateRetroDoc');
  g.addEdge('generateRetroDoc', 'archiveProject');
  g.addEdge('archiveProject', END as unknown as string);

  return graph.compile();
}
