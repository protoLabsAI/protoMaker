/**
 * Subgraph Wrapper Utility
 *
 * Provides message isolation pattern for LangGraph subgraphs.
 * Subgraphs maintain their own message state, preventing pollution
 * of the parent coordinator's message history.
 */

/**
 * Wraps a subgraph to provide message isolation from parent coordinator
 *
 * @param compiledGraph - The compiled LangGraph
 * @param inputMapper - Maps coordinator state to subgraph input
 * @param outputMapper - Maps subgraph result back to coordinator state
 * @returns Isolated subgraph wrapper
 */
export function wrapSubgraph<TCoordinatorState, TSubgraphInput, TSubgraphOutput>(
  compiledGraph: { invoke: (input: TSubgraphInput) => Promise<TSubgraphOutput> },
  inputMapper: (coordinatorState: TCoordinatorState) => TSubgraphInput,
  outputMapper: (subgraphState: TSubgraphOutput) => Partial<TCoordinatorState>
) {
  return async (coordinatorState: TCoordinatorState): Promise<Partial<TCoordinatorState>> => {
    // Create isolated subgraph input with fresh message state
    const subgraphInput = inputMapper(coordinatorState);

    // Run the compiled subgraph
    const result = await compiledGraph.invoke(subgraphInput);

    // Map result back to coordinator state (messages stay isolated)
    return outputMapper(result);
  };
}

/**
 * Creates a standard message for subgraph communication
 */
export function createMessage(role: 'user' | 'assistant' | 'system', content: string) {
  return { role, content };
}

/**
 * Extracts the last assistant message from a message array
 */
export function getLastAssistantMessage(
  messages: Array<{ role: string; content: string }>
): string | undefined {
  const lastMessage = [...messages].reverse().find((m) => m.role === 'assistant');
  return lastMessage?.content;
}
