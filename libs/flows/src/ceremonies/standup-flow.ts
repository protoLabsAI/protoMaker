/**
 * Standup ceremony LangGraph flow.
 *
 * Replaces StandupCeremony class hierarchy with three sequential nodes:
 *   START → loadMilestoneData → generateStandupContent → postToDiscord → END
 *
 * Dependencies are injected via StandupFlowDeps — structural interfaces only,
 * so this flow has no hard dependencies on concrete service classes.
 *
 * Usage (server-side):
 * ```typescript
 * import { createStandupFlow } from '@protolabs-ai/flows';
 * import { createLangChainModel } from '@protolabs-ai/llm-providers';
 * import { createDiscordTools } from '@protolabs-ai/tools';
 *
 * const flow = createStandupFlow({
 *   projectService,
 *   model: createLangChainModel({ model: 'claude-sonnet-4-6' }),
 *   discordBot,
 *   projectPath: '/path/to/project',
 *   projectSlug: 'my-project',
 *   milestoneSlug: 'milestone-1',
 *   discordChannelId: '1469080556720623699',
 * });
 *
 * await flow.invoke({});
 * ```
 */

import { StateGraph, Annotation, END, START } from '@langchain/langgraph';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

// ---------------------------------------------------------------------------
// Minimal structural interfaces (dependency injection without concrete imports)
// ---------------------------------------------------------------------------

export interface StandupMilestone {
  slug: string;
  number: number;
  title: string;
  description?: string;
  status?: string;
  phases: Array<{ title: string; complexity?: string }>;
}

export interface StandupProject {
  title: string;
  milestones: StandupMilestone[];
}

/**
 * Subset of ProjectService used by the standup flow.
 */
export interface StandupProjectService {
  getProject: (projectPath: string, projectSlug: string) => Promise<StandupProject | null>;
}

/**
 * Subset of DiscordBot used by the standup flow.
 */
export interface StandupDiscordBot {
  sendMessage: (channelId: string, content: string) => Promise<{ id: string }>;
}

/**
 * All dependencies required to create a standup flow instance.
 */
export interface StandupFlowDeps {
  /** Project service for loading milestone data */
  projectService: StandupProjectService;
  /** LangChain BaseChatModel for content generation */
  model: BaseChatModel;
  /** Discord bot for posting the standup */
  discordBot: StandupDiscordBot;
  /** Absolute path to the project directory */
  projectPath: string;
  /** Project slug identifier */
  projectSlug: string;
  /** Milestone slug to generate standup for */
  milestoneSlug: string;
  /** Discord channel ID to post the standup to */
  discordChannelId: string;
}

// ---------------------------------------------------------------------------
// State — fields mirror CeremonyAuditEntry data
// ---------------------------------------------------------------------------

const StandupStateAnnotation = Annotation.Root({
  // Input context (mirrors CeremonyAuditEntry projectPath, projectSlug, milestoneSlug)
  projectPath: Annotation<string>,
  projectSlug: Annotation<string>,
  milestoneSlug: Annotation<string>,
  // Loaded in loadMilestoneData
  projectTitle: Annotation<string>,
  milestoneTitle: Annotation<string>,
  milestoneNumber: Annotation<number>,
  phases: Annotation<Array<{ title: string; complexity?: string }>>,
  // Generated in generateStandupContent (mirrors CeremonyAuditEntry payload)
  generatedContent: Annotation<string>,
  // Set in postToDiscord (mirrors CeremonyAuditEntry discordMessageId, deliveryStatus)
  discordMessageId: Annotation<string>,
  discordPosted: Annotation<boolean>,
  // Error field
  error: Annotation<string>,
});

type StandupState = typeof StandupStateAnnotation.State;

// ---------------------------------------------------------------------------
// Node factories
// ---------------------------------------------------------------------------

/**
 * loadMilestoneData: Loads project and milestone data from the project service.
 * Populates projectTitle, milestoneTitle, milestoneNumber, and phases in state.
 */
function createLoadMilestoneDataNode(deps: StandupFlowDeps) {
  return async (_state: StandupState): Promise<Partial<StandupState>> => {
    const project = await deps.projectService.getProject(deps.projectPath, deps.projectSlug);
    if (!project) {
      return { error: `Project not found: ${deps.projectSlug}` };
    }

    const milestone = project.milestones.find((m) => m.slug === deps.milestoneSlug);
    if (!milestone) {
      return { error: `Milestone not found: ${deps.milestoneSlug}` };
    }

    return {
      projectTitle: project.title,
      milestoneTitle: milestone.title,
      milestoneNumber: milestone.number,
      phases: milestone.phases,
    };
  };
}

/**
 * generateStandupContent: Calls the LLM to generate a standup post
 * for the milestone start event.
 */
function createGenerateStandupContentNode(deps: StandupFlowDeps) {
  return async (state: StandupState): Promise<Partial<StandupState>> => {
    if (state.error) return {};

    const phaseList = state.phases
      .map((p) => `- ${p.title}${p.complexity ? ` [${p.complexity}]` : ''}`)
      .join('\n');

    const prompt =
      `You are writing a standup update for a development team. ` +
      `Generate a concise standup post (under 400 words) for a Discord channel.\n\n` +
      `**Project:** ${state.projectTitle}\n` +
      `**Milestone ${state.milestoneNumber}:** ${state.milestoneTitle}\n` +
      `**Planned Phases (${state.phases.length}):**\n` +
      (phaseList || '- No phases defined') +
      `\n\nWrite a standup post that covers:\n` +
      `1. What milestone is starting and its goal\n` +
      `2. The planned phases and their complexity\n` +
      `3. What the team should expect\n\n` +
      `Use markdown formatting suitable for Discord. Keep it engaging and concise.`;

    const response = await deps.model.invoke([{ role: 'user', content: prompt }]);
    const content =
      typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

    const header = `**${state.projectTitle}** — Milestone ${state.milestoneNumber} Starting: ${state.milestoneTitle}`;
    return { generatedContent: `${header}\n\n${content}` };
  };
}

/**
 * postToDiscord: Sends the generated standup content to the configured Discord channel.
 * Truncates to 2000 chars to stay within Discord's message limit.
 */
function createPostToDiscordNode(deps: StandupFlowDeps) {
  return async (state: StandupState): Promise<Partial<StandupState>> => {
    if (state.error || !state.generatedContent) {
      return { discordPosted: false };
    }

    const message =
      state.generatedContent.length > 2000
        ? state.generatedContent.slice(0, 1997) + '...'
        : state.generatedContent;

    const result = await deps.discordBot.sendMessage(deps.discordChannelId, message);
    return { discordPosted: true, discordMessageId: result.id };
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates and compiles the standup ceremony LangGraph flow.
 *
 * Flow topology: START → loadMilestoneData → generateStandupContent → postToDiscord → END
 *
 * @param deps - Flow dependencies (projectService, LLM model, discordBot, identifiers)
 * @returns Compiled StateGraph ready for .invoke({})
 */
export function createStandupFlow(deps: StandupFlowDeps) {
  const graph = new StateGraph(StandupStateAnnotation);

  graph.addNode('loadMilestoneData', createLoadMilestoneDataNode(deps));
  graph.addNode('generateStandupContent', createGenerateStandupContentNode(deps));
  graph.addNode('postToDiscord', createPostToDiscordNode(deps));

  // TypeScript's strict node-name literal inference requires casting here.
  // The same pattern is used in maintenance-flow.ts and coordinator-flow.ts.
  const g = graph as unknown as {
    addEdge: (from: string, to: string) => void;
  };

  g.addEdge(START as unknown as string, 'loadMilestoneData');
  g.addEdge('loadMilestoneData', 'generateStandupContent');
  g.addEdge('generateStandupContent', 'postToDiscord');
  g.addEdge('postToDiscord', END as unknown as string);

  return graph.compile();
}
