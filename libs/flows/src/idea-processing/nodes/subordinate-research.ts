/**
 * Subordinate Research Nodes
 *
 * Four parallel research nodes that execute via Send() pattern:
 * 1. Frank - Backend architecture and system design research
 * 2. Sam - Frontend architecture and UX patterns research
 * 3. Kai - Data architecture and integration patterns research
 * 4. Matt - Performance and scalability considerations research
 *
 * Each node receives world state context and operates with a 30s timeout.
 * Graceful degradation on failure - returns partial findings.
 */

import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { RunnableConfig } from '@langchain/core/runnables';

/**
 * World state context injected into each subordinate
 */
export interface WorldStateContext {
  /** Current project features and their status */
  projectFeatures?: Array<{ id: string; title: string; status: string }>;
  /** Active crew members and their health status */
  crewStatus?: Array<{ name: string; status: string; lastCheck?: string }>;
  /** Recent system events or incidents */
  recentEvents?: Array<{ type: string; message: string; timestamp: string }>;
  /** Current system capacity and resources */
  systemCapacity?: { availableAgents: number; queueDepth: number; load: number };
  /** Custom context from APIs */
  customContext?: Record<string, unknown>;
}

/**
 * Research finding from a subordinate
 */
export interface SubordinateResearchFinding {
  /** Source subordinate (frank, sam, kai, matt) */
  source: 'frank' | 'sam' | 'kai' | 'matt';
  /** Research topic/area */
  topic: string;
  /** Main findings */
  findings: string;
  /** Relevance level */
  relevance: 'high' | 'medium' | 'low';
  /** Timestamp */
  timestamp: string;
  /** World state considerations */
  worldStateNotes?: string;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Error finding for tracking failures
 */
export interface SubordinateResearchError {
  subordinate: string;
  error: string;
  timestamp: string;
  timedOut?: boolean;
}

/**
 * State interface for subordinate research workers
 */
export interface SubordinateResearchState {
  /** Idea or topic to research */
  idea: string;
  /** World state context */
  worldState?: WorldStateContext;
  /** Research findings from subordinates */
  subordinateFindings: SubordinateResearchFinding[];
  /** Errors encountered */
  errors: SubordinateResearchError[];
  /** Model configuration */
  smartModel?: BaseChatModel;
  fastModel?: BaseChatModel;
  config?: RunnableConfig;
}

/**
 * Timeout wrapper for subordinate research with graceful degradation
 *
 * @param subordinateName - Name of the subordinate
 * @param researchFn - Research function to execute
 * @param timeoutMs - Timeout in milliseconds (default 30000)
 * @returns Research finding or error finding
 */
async function executeWithTimeout(
  subordinateName: string,
  researchFn: () => Promise<SubordinateResearchFinding>,
  timeoutMs = 30000
): Promise<SubordinateResearchFinding | SubordinateResearchError> {
  try {
    const result = await Promise.race([
      researchFn(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeoutMs)),
    ]);
    return result;
  } catch (error) {
    const isTimeout = error instanceof Error && error.message === 'Timeout';
    console.warn(
      `[${subordinateName}] ${isTimeout ? 'Timed out' : 'Failed'}:`,
      error instanceof Error ? error.message : String(error)
    );

    return {
      subordinate: subordinateName,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
      timedOut: isTimeout,
    };
  }
}

/**
 * Model fallback configuration
 */
interface ModelFallbackConfig {
  primary: BaseChatModel | undefined;
  fallback: BaseChatModel | undefined;
}

/**
 * Executes an LLM call with model fallback chain: smart → fast
 *
 * @param config - Model fallback configuration
 * @param promptFn - Function that takes a model and returns a promise with the result
 * @param nodeName - Name of the node for error tracking
 * @returns Result from the LLM call or throws if all models fail
 */
async function executeWithFallback<T>(
  config: ModelFallbackConfig,
  promptFn: (model: BaseChatModel) => Promise<T>,
  nodeName: string
): Promise<T> {
  const models: Array<{ model: BaseChatModel | undefined; name: string }> = [
    { model: config.primary, name: 'smart' },
    { model: config.fallback, name: 'fast' },
  ];

  let lastError: Error | undefined;

  for (const { model, name } of models) {
    if (!model) continue;

    try {
      return await promptFn(model);
    } catch (error) {
      console.warn(
        `[${nodeName}] Model ${name} failed:`,
        error instanceof Error ? error.message : String(error)
      );
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError || new Error(`All models failed for ${nodeName}`);
}

/**
 * Frank - Backend architecture and system design research
 *
 * @param state - Subordinate research state
 * @returns Partial state with Frank's findings or error
 */
export async function frankResearchWorker(
  state: SubordinateResearchState
): Promise<Partial<SubordinateResearchState>> {
  const { idea, worldState, smartModel, fastModel } = state;
  const nodeName = 'FrankResearchWorker';

  console.log(`[${nodeName}] Starting backend architecture research for: "${idea}"`);

  const result = await executeWithTimeout(
    nodeName,
    async () => {
      // Execute with model fallback
      const llmResult = await executeWithFallback(
        { primary: smartModel, fallback: fastModel },
        async (model) => {
          const worldContext = worldState
            ? `\n\nCurrent World State Context:
- Project Features: ${worldState.projectFeatures?.length || 0} active features
- System Capacity: ${worldState.systemCapacity?.availableAgents || 'unknown'} available agents
- Queue Depth: ${worldState.systemCapacity?.queueDepth || 0}
${worldState.recentEvents ? `- Recent Events: ${worldState.recentEvents.map((e) => e.message).join(', ')}` : ''}`
            : '';

          const response = await model.invoke([
            {
              role: 'user',
              content: `You are Frank, a backend architecture and system design expert. Research the backend implications and architecture considerations for this idea:

Idea: "${idea}"${worldContext}

Focus on:
- Backend architecture patterns and design considerations
- System integration points and dependencies
- Scalability and infrastructure requirements
- Technical risks and constraints

Provide structured findings with relevance assessment (high/medium/low).`,
            },
          ]);

          return response.content.toString();
        },
        nodeName
      );

      const finding: SubordinateResearchFinding = {
        source: 'frank',
        topic: idea,
        findings: llmResult.substring(0, 2000), // Limit size
        relevance: 'high', // Default relevance
        timestamp: new Date().toISOString(),
        worldStateNotes: worldState
          ? `System capacity: ${worldState.systemCapacity?.availableAgents || 0} agents, Queue: ${worldState.systemCapacity?.queueDepth || 0}`
          : undefined,
        metadata: { subordinate: 'frank', role: 'backend_architecture' },
      };

      console.log(`[${nodeName}] Research complete`);
      return finding;
    },
    30000 // 30s timeout
  );

  // Handle result or error
  if ('error' in result) {
    return { errors: [result] };
  }
  return { subordinateFindings: [result] };
}

/**
 * Sam - Frontend architecture and UX patterns research
 *
 * @param state - Subordinate research state
 * @returns Partial state with Sam's findings or error
 */
export async function samResearchWorker(
  state: SubordinateResearchState
): Promise<Partial<SubordinateResearchState>> {
  const { idea, worldState, smartModel, fastModel } = state;
  const nodeName = 'SamResearchWorker';

  console.log(`[${nodeName}] Starting frontend architecture research for: "${idea}"`);

  const result = await executeWithTimeout(
    nodeName,
    async () => {
      // Execute with model fallback
      const llmResult = await executeWithFallback(
        { primary: smartModel, fallback: fastModel },
        async (model) => {
          const worldContext = worldState
            ? `\n\nCurrent World State Context:
- Project Features: ${worldState.projectFeatures?.length || 0} active features
- System Capacity: ${worldState.systemCapacity?.availableAgents || 'unknown'} available agents
${worldState.recentEvents ? `- Recent Events: ${worldState.recentEvents.map((e) => e.message).join(', ')}` : ''}`
            : '';

          const response = await model.invoke([
            {
              role: 'user',
              content: `You are Sam, a frontend architecture and UX patterns expert. Research the frontend implications and user experience considerations for this idea:

Idea: "${idea}"${worldContext}

Focus on:
- Frontend architecture patterns and component design
- User experience and interaction patterns
- UI/UX best practices and accessibility
- Client-side performance and optimization

Provide structured findings with relevance assessment (high/medium/low).`,
            },
          ]);

          return response.content.toString();
        },
        nodeName
      );

      const finding: SubordinateResearchFinding = {
        source: 'sam',
        topic: idea,
        findings: llmResult.substring(0, 2000), // Limit size
        relevance: 'high', // Default relevance
        timestamp: new Date().toISOString(),
        worldStateNotes: worldState
          ? `Active features: ${worldState.projectFeatures?.length || 0}`
          : undefined,
        metadata: { subordinate: 'sam', role: 'frontend_architecture' },
      };

      console.log(`[${nodeName}] Research complete`);
      return finding;
    },
    30000 // 30s timeout
  );

  // Handle result or error
  if ('error' in result) {
    return { errors: [result] };
  }
  return { subordinateFindings: [result] };
}

/**
 * Kai - Data architecture and integration patterns research
 *
 * @param state - Subordinate research state
 * @returns Partial state with Kai's findings or error
 */
export async function kaiResearchWorker(
  state: SubordinateResearchState
): Promise<Partial<SubordinateResearchState>> {
  const { idea, worldState, smartModel, fastModel } = state;
  const nodeName = 'KaiResearchWorker';

  console.log(`[${nodeName}] Starting data architecture research for: "${idea}"`);

  const result = await executeWithTimeout(
    nodeName,
    async () => {
      // Execute with model fallback
      const llmResult = await executeWithFallback(
        { primary: smartModel, fallback: fastModel },
        async (model) => {
          const worldContext = worldState
            ? `\n\nCurrent World State Context:
- Project Features: ${worldState.projectFeatures?.length || 0} active features
- Crew Status: ${worldState.crewStatus?.map((c) => `${c.name}: ${c.status}`).join(', ') || 'unknown'}
${worldState.recentEvents ? `- Recent Events: ${worldState.recentEvents.map((e) => e.message).join(', ')}` : ''}`
            : '';

          const response = await model.invoke([
            {
              role: 'user',
              content: `You are Kai, a data architecture and integration patterns expert. Research the data implications and integration considerations for this idea:

Idea: "${idea}"${worldContext}

Focus on:
- Data models, schemas, and database design
- Integration patterns and API design
- Data flow and synchronization requirements
- Data security and compliance considerations

Provide structured findings with relevance assessment (high/medium/low).`,
            },
          ]);

          return response.content.toString();
        },
        nodeName
      );

      const finding: SubordinateResearchFinding = {
        source: 'kai',
        topic: idea,
        findings: llmResult.substring(0, 2000), // Limit size
        relevance: 'high', // Default relevance
        timestamp: new Date().toISOString(),
        worldStateNotes: worldState
          ? `Crew health: ${worldState.crewStatus?.filter((c) => c.status === 'healthy').length || 0} healthy`
          : undefined,
        metadata: { subordinate: 'kai', role: 'data_architecture' },
      };

      console.log(`[${nodeName}] Research complete`);
      return finding;
    },
    30000 // 30s timeout
  );

  // Handle result or error
  if ('error' in result) {
    return { errors: [result] };
  }
  return { subordinateFindings: [result] };
}

/**
 * Matt - Performance and scalability considerations research
 *
 * @param state - Subordinate research state
 * @returns Partial state with Matt's findings or error
 */
export async function mattResearchWorker(
  state: SubordinateResearchState
): Promise<Partial<SubordinateResearchState>> {
  const { idea, worldState, smartModel, fastModel } = state;
  const nodeName = 'MattResearchWorker';

  console.log(`[${nodeName}] Starting performance research for: "${idea}"`);

  const result = await executeWithTimeout(
    nodeName,
    async () => {
      // Execute with model fallback
      const llmResult = await executeWithFallback(
        { primary: smartModel, fallback: fastModel },
        async (model) => {
          const worldContext = worldState
            ? `\n\nCurrent World State Context:
- System Load: ${worldState.systemCapacity?.load || 'unknown'}
- Available Agents: ${worldState.systemCapacity?.availableAgents || 'unknown'}
- Queue Depth: ${worldState.systemCapacity?.queueDepth || 0}
${worldState.recentEvents ? `- Recent Events: ${worldState.recentEvents.map((e) => e.message).join(', ')}` : ''}`
            : '';

          const response = await model.invoke([
            {
              role: 'user',
              content: `You are Matt, a performance and scalability expert. Research the performance implications and scalability considerations for this idea:

Idea: "${idea}"${worldContext}

Focus on:
- Performance bottlenecks and optimization opportunities
- Scalability patterns and capacity planning
- Resource utilization and efficiency
- Monitoring and observability requirements

Provide structured findings with relevance assessment (high/medium/low).`,
            },
          ]);

          return response.content.toString();
        },
        nodeName
      );

      const finding: SubordinateResearchFinding = {
        source: 'matt',
        topic: idea,
        findings: llmResult.substring(0, 2000), // Limit size
        relevance: 'high', // Default relevance
        timestamp: new Date().toISOString(),
        worldStateNotes: worldState
          ? `System load: ${worldState.systemCapacity?.load || 0}, Agents: ${worldState.systemCapacity?.availableAgents || 0}`
          : undefined,
        metadata: { subordinate: 'matt', role: 'performance_scalability' },
      };

      console.log(`[${nodeName}] Research complete`);
      return finding;
    },
    30000 // 30s timeout
  );

  // Handle result or error
  if ('error' in result) {
    return { errors: [result] };
  }
  return { subordinateFindings: [result] };
}
