/**
 * State Transformation Boundary Pattern
 *
 * Provides reusable state transformation interfaces and helpers for LangGraph subgraph composition.
 * When composing graphs with subgraphs, parent and child graphs often have different state shapes.
 * These utilities systematize the input/output transformation boundary at each subgraph boundary.
 */

/**
 * Compiled subgraph type - accepts input state and returns output state
 */
export interface CompiledSubgraph<TState> {
  invoke(input: TState): Promise<TState>;
}

/**
 * StateTransformer interface
 *
 * Defines the contract for transforming state between parent and child graphs.
 * Implement this interface to create custom state transformations for subgraph boundaries.
 *
 * @template TParent - Parent graph state type
 * @template TChild - Child subgraph state type
 *
 * @example
 * ```typescript
 * const transformer: StateTransformer<ContentState, ResearchState> = {
 *   toInput: (parent) => ({
 *     query: parent.topic,
 *     contentConfig: parent.config,
 *   }),
 *   extractOutput: (child, parent) => ({
 *     researchSummary: child.summary,
 *   }),
 * };
 * ```
 */
export interface StateTransformer<TParent, TChild> {
  /**
   * Extract child state from parent state
   *
   * Called before invoking the subgraph to prepare input state.
   *
   * @param parent - Current parent state
   * @returns Child state input
   */
  toInput(parent: TParent): TChild;

  /**
   * Merge child output back into parent state
   *
   * Called after subgraph execution to integrate results into parent state.
   *
   * @param child - Child state after subgraph execution
   * @param parent - Original parent state (for context)
   * @returns Partial parent state update
   */
  extractOutput(child: TChild, parent: TParent): Partial<TParent>;
}

/**
 * Creates a subgraph bridge that wraps a subgraph with input/output transformation
 *
 * Returns a node function that can be used directly in a parent graph.
 * The bridge handles state transformation in both directions automatically.
 *
 * @template TParent - Parent graph state type
 * @template TChild - Child subgraph state type
 *
 * @param config - Configuration object
 * @param config.transformer - StateTransformer implementation
 * @param config.subgraph - Compiled LangGraph subgraph
 *
 * @returns Node function that transforms state, invokes subgraph, and merges output
 *
 * @example
 * ```typescript
 * const researchBridge = createSubgraphBridge({
 *   transformer: researchTransformer,
 *   subgraph: compiledResearchSubgraph,
 * });
 *
 * // Use in parent graph
 * graph.addNode('research', researchBridge);
 * ```
 */
export function createSubgraphBridge<TParent, TChild>(config: {
  transformer: StateTransformer<TParent, TChild>;
  subgraph: CompiledSubgraph<TChild>;
}): (parent: TParent) => Promise<Partial<TParent>> {
  const { transformer, subgraph } = config;

  return async (parent: TParent): Promise<Partial<TParent>> => {
    // Transform parent state to child input
    const childInput = transformer.toInput(parent);

    // Invoke subgraph with child input
    const childOutput = await subgraph.invoke(childInput);

    // Transform child output back to parent state update
    const parentUpdate = transformer.extractOutput(childOutput, parent);

    return parentUpdate;
  };
}

/**
 * Field mapping specification for createFieldMapper
 *
 * Maps parent field names to child field names.
 *
 * @example
 * ```typescript
 * const mapping: FieldMapping<ParentState, ChildState> = {
 *   parentTopic: 'childQuery',
 *   parentConfig: 'childConfig',
 * };
 * ```
 */
export type FieldMapping<TParent, TChild> = {
  [K in keyof TChild]?: keyof TParent;
};

/**
 * Creates a simple StateTransformer from a field name mapping
 *
 * Useful for straightforward field renaming without custom logic.
 * Maps fields from parent to child in toInput(), and child back to parent in extractOutput().
 *
 * @template TParent - Parent graph state type
 * @template TChild - Child subgraph state type
 *
 * @param mapping - Field mapping object
 *
 * @returns StateTransformer that performs field mapping
 *
 * @example
 * ```typescript
 * const transformer = createFieldMapper<ContentState, ResearchState>({
 *   query: 'topic',
 *   contentConfig: 'config',
 * });
 *
 * // toInput: parent.topic → child.query
 * // extractOutput: child.query → parent.topic
 * ```
 */
export function createFieldMapper<TParent extends object, TChild extends object>(
  mapping: FieldMapping<TParent, TChild>
): StateTransformer<TParent, TChild> {
  return {
    toInput: (parent: TParent): TChild => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const childState: any = {};

      // Map fields from parent to child
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const [childKey, parentKey] of Object.entries(mapping) as [string, keyof TParent][]) {
        if (parentKey && parentKey in parent) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          childState[childKey] = (parent as any)[parentKey];
        }
      }

      return childState as TChild;
    },

    extractOutput: (child: TChild, _parent: TParent): Partial<TParent> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parentUpdate: any = {};

      // Map fields back from child to parent
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const [childKey, parentKey] of Object.entries(mapping) as [keyof TChild, string][]) {
        if (parentKey && childKey in child) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          parentUpdate[parentKey] = (child as any)[childKey];
        }
      }

      return parentUpdate as Partial<TParent>;
    },
  };
}

/**
 * Creates an identity StateTransformer for same-shape subgraphs
 *
 * Pass-through transformer that performs no transformation.
 * Useful when parent and child graphs share the same state shape.
 *
 * @template T - State type (same for parent and child)
 *
 * @returns StateTransformer that returns state unchanged
 *
 * @example
 * ```typescript
 * const transformer = createIdentityTransformer<SharedState>();
 *
 * // toInput: returns parent state as-is
 * // extractOutput: returns child state as-is
 * ```
 */
export function createIdentityTransformer<T>(): StateTransformer<T, T> {
  return {
    toInput: (parent: T): T => parent,
    extractOutput: (child: T, _parent: T): Partial<T> => child,
  };
}
