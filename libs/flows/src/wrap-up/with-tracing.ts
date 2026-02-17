/**
 * Wrap-Up Flow with Langfuse Tracing
 *
 * Helper to execute the wrap-up flow with automatic Langfuse trace instrumentation.
 * Tracks each node execution as a span and captures the full workflow.
 */

import type { LangfuseClient } from '@automaker/observability';
import { createWrapUpFlow, type WrapUpFlowConfig } from './graph.js';
import type { WrapUpState, WrapUpInput } from './types.js';

export interface ExecuteWrapUpFlowOptions {
  input: WrapUpInput;
  config?: WrapUpFlowConfig;
  langfuse?: LangfuseClient;
  sessionId?: string;
}

/**
 * Execute the wrap-up flow with Langfuse tracing
 *
 * @example
 * ```ts
 * const langfuse = new LangfuseClient({ ... });
 * const result = await executeWrapUpFlowWithTracing({
 *   input: {
 *     projectPath: '/path/to/project',
 *     projectTitle: 'My Project',
 *     projectSlug: 'my-project',
 *     totalMilestones: 3,
 *     totalFeatures: 15,
 *     totalCostUsd: 125.50,
 *     failureCount: 2,
 *     milestoneSummaries: [...]
 *   },
 *   langfuse,
 *   sessionId: 'project-completion-session',
 * });
 * ```
 */
export async function executeWrapUpFlowWithTracing(
  options: ExecuteWrapUpFlowOptions
): Promise<WrapUpState> {
  const { input, config = {}, langfuse, sessionId } = options;
  const startTime = new Date();

  // Create Langfuse trace if client provided
  const trace = langfuse?.createTrace({
    id: `wrap-up-${input.projectSlug}-${Date.now()}`,
    name: 'Project Wrap-Up',
    sessionId,
    metadata: {
      projectPath: input.projectPath,
      projectTitle: input.projectTitle,
      projectSlug: input.projectSlug,
      totalMilestones: input.totalMilestones,
      totalFeatures: input.totalFeatures,
      totalCostUsd: input.totalCostUsd,
    },
    tags: ['wrap-up', 'retrospective', 'langgraph'],
  });

  try {
    // Create the wrap-up flow with provided config
    const graph = createWrapUpFlow(config);

    // Create initial state
    const initialState: WrapUpState = {
      stage: 'gathering_metrics',
      input,
      memoryEntries: [],
      learnings: [],
      improvements: [],
      createdBeadsIds: [],
      createdFeatureIds: [],
      createdPrdIds: [],
      createdLinearIssueIds: [],
      errors: [],
    };

    // Stream the graph execution
    const stream = await graph.stream(initialState);

    let finalState: WrapUpState | undefined;

    for await (const event of stream) {
      // Event is a Record<nodeName, Partial<State>>
      const nodeNames = Object.keys(event);
      for (const nodeName of nodeNames) {
        const nodeOutput = event[nodeName];

        // Log span for each node execution
        if (langfuse && trace) {
          langfuse.createSpan({
            traceId: trace.id,
            name: nodeName,
            input: nodeOutput,
            metadata: {
              projectSlug: input.projectSlug,
              node: nodeName,
              stage: (nodeOutput as Partial<WrapUpState>).stage,
            },
          });
        }

        // Track final state
        finalState = { ...finalState, ...nodeOutput } as WrapUpState;
      }
    }

    if (!finalState) {
      throw new Error('Wrap-up flow completed without producing final state');
    }

    const endTime = new Date();

    // Update trace with final results
    if (trace) {
      trace.update({
        output: {
          stage: finalState.stage,
          retrospectiveGenerated: !!finalState.retrospective,
          learningsExtracted: finalState.learnings.length,
          improvementsProposed: finalState.improvements.length,
          beadsCreated: finalState.createdBeadsIds.length,
          featuresCreated: finalState.createdFeatureIds.length,
          prdsCreated: finalState.createdPrdIds.length,
          errors: finalState.errors,
        },
        metadata: {
          duration: endTime.getTime() - startTime.getTime(),
          completed: finalState.stage === 'completed',
        },
      });
    }

    await langfuse?.flush();

    return finalState;
  } catch (error) {
    const endTime = new Date();

    // Log error to trace
    if (trace) {
      trace.update({
        output: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: {
          duration: endTime.getTime() - startTime.getTime(),
          failed: true,
        },
      });
    }

    await langfuse?.flush();
    throw error;
  }
}
