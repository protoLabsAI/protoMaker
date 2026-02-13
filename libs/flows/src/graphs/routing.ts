import type { END, START } from '@langchain/langgraph';

/**
 * Type for node names in a graph (string, START, or END symbols)
 */
export type NodeName = string | typeof START | typeof END;

/**
 * Conditional edge function type
 */
export type ConditionalEdgeFunction<TState> = (state: TState) => NodeName | NodeName[];

/**
 * Creates a simple binary router based on a boolean condition
 */
export function createBinaryRouter<TState>(
  condition: (state: TState) => boolean,
  trueNode: NodeName,
  falseNode: NodeName
): ConditionalEdgeFunction<TState> {
  return (state: TState) => {
    return condition(state) ? trueNode : falseNode;
  };
}

/**
 * Creates a multi-way router based on a value
 */
export function createValueRouter<TState, TValue>(
  getValue: (state: TState) => TValue,
  routes: Map<TValue, NodeName>,
  defaultNode?: NodeName
): ConditionalEdgeFunction<TState> {
  return (state: TState) => {
    const value = getValue(state);
    const node = routes.get(value);

    if (node !== undefined) {
      return node;
    }

    if (defaultNode !== undefined) {
      return defaultNode;
    }

    throw new Error(`No route found for value: ${value}`);
  };
}

/**
 * Creates a router that checks multiple conditions in order
 */
export function createSequentialRouter<TState>(
  conditions: Array<{
    condition: (state: TState) => boolean;
    node: NodeName;
  }>,
  defaultNode: NodeName
): ConditionalEdgeFunction<TState> {
  return (state: TState) => {
    for (const { condition, node } of conditions) {
      if (condition(state)) {
        return node;
      }
    }
    return defaultNode;
  };
}

/**
 * Creates a router that routes to multiple nodes (parallel execution)
 */
export function createParallelRouter<TState>(
  getNodes: (state: TState) => NodeName[]
): ConditionalEdgeFunction<TState> {
  return (state: TState) => {
    const nodes = getNodes(state);
    if (nodes.length === 0) {
      throw new Error('Parallel router must return at least one node');
    }
    return nodes;
  };
}

/**
 * Creates a router based on state field value
 */
export function createFieldRouter<TState, K extends keyof TState>(
  field: K,
  routes: Map<TState[K], NodeName>,
  defaultNode?: NodeName
): ConditionalEdgeFunction<TState> {
  return createValueRouter((state: TState) => state[field], routes, defaultNode);
}

/**
 * Creates a router that ends the graph when a condition is met
 */
export function createEndRouter<TState>(
  shouldEnd: (state: TState) => boolean,
  continueNode: NodeName,
  endSymbol: typeof END
): ConditionalEdgeFunction<TState> {
  return (state: TState) => {
    return shouldEnd(state) ? endSymbol : continueNode;
  };
}

/**
 * Combines multiple routers with AND logic (all must agree on the same node)
 */
export function combineRoutersAnd<TState>(
  routers: Array<ConditionalEdgeFunction<TState>>
): ConditionalEdgeFunction<TState> {
  return (state: TState) => {
    if (routers.length === 0) {
      throw new Error('Must provide at least one router');
    }

    const firstResult = routers[0](state);
    const firstNode = Array.isArray(firstResult) ? firstResult[0] : firstResult;

    for (let i = 1; i < routers.length; i++) {
      const result = routers[i](state);
      const node = Array.isArray(result) ? result[0] : result;

      if (node !== firstNode) {
        throw new Error(`Router disagreement: expected ${String(firstNode)}, got ${String(node)}`);
      }
    }

    return firstNode;
  };
}

/**
 * Combines multiple routers with OR logic (returns first non-null result)
 */
export function combineRoutersOr<TState>(
  routers: Array<ConditionalEdgeFunction<TState>>,
  defaultNode: NodeName
): ConditionalEdgeFunction<TState> {
  return (state: TState) => {
    for (const router of routers) {
      try {
        const result = router(state);
        if (result !== null && result !== undefined) {
          return result;
        }
      } catch {
        continue;
      }
    }
    return defaultNode;
  };
}

/**
 * Route mapping for common routing patterns
 */
export interface RouteMap<T> {
  [key: string]: T;
}

/**
 * Creates a simple string-based router from a route map
 */
export function createRouteMapRouter<TState>(
  getKey: (state: TState) => string,
  routeMap: RouteMap<NodeName>,
  defaultNode?: NodeName
): ConditionalEdgeFunction<TState> {
  return (state: TState) => {
    const key = getKey(state);
    const node = routeMap[key];

    if (node !== undefined) {
      return node;
    }

    if (defaultNode !== undefined) {
      return defaultNode;
    }

    throw new Error(`No route found for key: ${key}`);
  };
}
