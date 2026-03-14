/**
 * Agent tools — SharedTool wrappers for agent control operations.
 *
 * Factory: createAgentTools(deps) returns LangGraph-compatible SharedTool
 * instances for start_agent, stop_agent, list_running_agents, get_agent_output,
 * and send_message_to_agent.
 */

import { z } from 'zod';
import { defineSharedTool } from './define-tool.js';
import type { SharedTool } from './types.js';

// ---------------------------------------------------------------------------
// Minimal structural interface — avoids importing concrete service classes
// ---------------------------------------------------------------------------

export interface AgentDeps {
  agentService: {
    startAgent: (
      projectPath: string,
      featureId: string,
      options?: { useWorktrees?: boolean }
    ) => Promise<{ featureId: string; started: boolean }>;
    stopAgent: (featureId: string) => Promise<{ featureId: string; stopped: boolean }>;
    listRunningAgents: () => Promise<Array<{ featureId: string; projectPath: string }>>;
    getAgentOutput: (projectPath: string, featureId: string, maxLines?: number) => Promise<string>;
    sendMessageToAgent: (
      projectPath: string,
      featureId: string,
      message: string
    ) => Promise<{ featureId: string; sent: boolean }>;
  };
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const StartAgentInputSchema = z.object({
  projectPath: z.string().describe('Absolute path to the project directory'),
  featureId: z.string().describe('The feature ID to work on'),
  useWorktrees: z
    .boolean()
    .optional()
    .default(true)
    .describe('Whether to use isolated git worktrees for the agent (default: true)'),
});

const StopAgentInputSchema = z.object({
  featureId: z.string().describe('The feature ID of the running agent to stop'),
});

const ListRunningAgentsInputSchema = z.object({});

const GetAgentOutputInputSchema = z.object({
  projectPath: z.string().describe('Absolute path to the project directory'),
  featureId: z.string().describe('The feature ID'),
  maxLines: z
    .number()
    .int()
    .optional()
    .describe('Maximum lines to return (default: 200). Use -1 for unlimited.'),
});

const SendMessageToAgentInputSchema = z.object({
  projectPath: z.string().describe('Absolute path to the project directory'),
  featureId: z.string().describe('The feature ID of the running agent'),
  message: z.string().describe('Message to send to the agent'),
});

const StartAgentOutputSchema = z.object({
  featureId: z.string(),
  started: z.boolean(),
});

const StopAgentOutputSchema = z.object({
  featureId: z.string(),
  stopped: z.boolean(),
});

const ListRunningAgentsOutputSchema = z.object({
  agents: z.array(
    z.object({
      featureId: z.string(),
      projectPath: z.string(),
    })
  ),
  count: z.number(),
});

const GetAgentOutputOutputSchema = z.object({
  output: z.string(),
});

const SendMessageToAgentOutputSchema = z.object({
  featureId: z.string(),
  sent: z.boolean(),
});

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates agent control tools bound to the provided agentService.
 *
 * @param deps - Agent dependencies (agentService)
 * @returns Array of SharedTool instances for use with ToolRegistry or toLangGraphTools()
 */
export function createAgentTools(deps: AgentDeps): SharedTool[] {
  const { agentService } = deps;

  const startAgentTool = defineSharedTool({
    name: 'start_agent',
    description:
      'Start an AI agent to work on a feature. The agent will create a git worktree and begin implementation.',
    inputSchema: StartAgentInputSchema,
    outputSchema: StartAgentOutputSchema,
    metadata: { category: 'agent', tags: ['agent', 'start'] },
    execute: async (rawInput) => {
      const input = rawInput as z.infer<typeof StartAgentInputSchema>;
      try {
        const result = await agentService.startAgent(input.projectPath, input.featureId, {
          useWorktrees: input.useWorktrees,
        });
        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to start agent',
        };
      }
    },
  });

  const stopAgentTool = defineSharedTool({
    name: 'stop_agent',
    description: 'Stop a running agent.',
    inputSchema: StopAgentInputSchema,
    outputSchema: StopAgentOutputSchema,
    metadata: { category: 'agent', tags: ['agent', 'stop'] },
    execute: async (rawInput) => {
      const input = rawInput as z.infer<typeof StopAgentInputSchema>;
      try {
        const result = await agentService.stopAgent(input.featureId);
        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to stop agent',
        };
      }
    },
  });

  const listRunningAgentsTool = defineSharedTool({
    name: 'list_running_agents',
    description: 'List all currently running agents across all projects.',
    inputSchema: ListRunningAgentsInputSchema,
    outputSchema: ListRunningAgentsOutputSchema,
    metadata: { category: 'agent', tags: ['agent', 'list'] },
    execute: async () => {
      try {
        const agents = await agentService.listRunningAgents();
        return { success: true, data: { agents, count: agents.length } };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to list running agents',
        };
      }
    },
  });

  const getAgentOutputTool = defineSharedTool({
    name: 'get_agent_output',
    description:
      "Get the output/log from an agent's execution on a feature. Useful for reviewing what the agent did.",
    inputSchema: GetAgentOutputInputSchema,
    outputSchema: GetAgentOutputOutputSchema,
    metadata: { category: 'agent', tags: ['agent', 'output', 'logs'] },
    execute: async (rawInput) => {
      const input = rawInput as z.infer<typeof GetAgentOutputInputSchema>;
      try {
        const output = await agentService.getAgentOutput(
          input.projectPath,
          input.featureId,
          input.maxLines
        );
        return { success: true, data: { output } };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get agent output',
        };
      }
    },
  });

  const sendMessageToAgentTool = defineSharedTool({
    name: 'send_message_to_agent',
    description:
      'Send a message to a running agent. Use this to provide clarification or additional instructions.',
    inputSchema: SendMessageToAgentInputSchema,
    outputSchema: SendMessageToAgentOutputSchema,
    metadata: { category: 'agent', tags: ['agent', 'message'] },
    execute: async (rawInput) => {
      const input = rawInput as z.infer<typeof SendMessageToAgentInputSchema>;
      try {
        const result = await agentService.sendMessageToAgent(
          input.projectPath,
          input.featureId,
          input.message
        );
        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to send message to agent',
        };
      }
    },
  });

  return [
    startAgentTool,
    stopAgentTool,
    listRunningAgentsTool,
    getAgentOutputTool,
    sendMessageToAgentTool,
  ];
}
