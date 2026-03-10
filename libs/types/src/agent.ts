/**
 * Agent definition factory types.
 *
 * Defines the context object passed to AgentDefinition factory functions
 * (createAvaAgent, createPMAgent, createLEAgent). Factory functions are
 * pure — they take this context and return a fully configured AgentDefinition
 * with no side effects.
 */

/**
 * A partial slice of world state relevant to agent context.
 *
 * Factory functions may use this to conditionally adjust prompts or
 * tool lists based on runtime state (e.g., active projects, flags).
 */
export type WorldStateSlice = Record<string, unknown>;

/**
 * Context object passed to AgentDefinition factory functions.
 *
 * Provides all the runtime information needed to construct a fully
 * configured AgentDefinition for a given invocation.
 */
export interface AgentDefinitionContext {
  /**
   * Absolute path to the project root the agent will operate in.
   * Used to scope file operations and populate prompts.
   */
  projectPath: string;

  /**
   * Partial world state slice relevant to this agent.
   * Factories may inspect this to tailor prompts or restrict tools.
   */
  worldState?: WorldStateSlice;

  /**
   * Explicit tool list to make available to the agent.
   * When provided, the factory should use this list directly.
   * When omitted, the factory uses sensible role-specific defaults.
   */
  availableTools?: string[];
}
