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
export declare function wrapSubgraph<TCoordinatorState, TSubgraphInput, TSubgraphOutput>(
  compiledGraph: {
    invoke: (input: TSubgraphInput) => Promise<TSubgraphOutput>;
  },
  inputMapper: (coordinatorState: TCoordinatorState) => TSubgraphInput,
  outputMapper: (subgraphState: TSubgraphOutput) => Partial<TCoordinatorState>
): (coordinatorState: TCoordinatorState) => Promise<Partial<TCoordinatorState>>;
/**
 * Creates a standard message for subgraph communication
 */
export declare function createMessage(
  role: 'user' | 'assistant' | 'system',
  content: string
): {
  role: 'user' | 'assistant' | 'system';
  content: string;
};
/**
 * Extracts the last assistant message from a message array
 */
export declare function getLastAssistantMessage(
  messages: Array<{
    role: string;
    content: string;
  }>
): string | undefined;
//# sourceMappingURL=subgraph-wrapper.d.ts.map
