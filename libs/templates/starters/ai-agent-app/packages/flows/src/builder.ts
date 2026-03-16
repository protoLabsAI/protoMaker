import { StateGraph, END, START, MemorySaver } from '@langchain/langgraph';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import type { ConditionalEdgeFunction, NodeName } from './routers.js';

/**
 * Checkpointer interface for graph state persistence.
 * Compatible with LangGraph's BaseCheckpointSaver.
 */
export type Checkpointer = BaseCheckpointSaver;

/**
 * Base graph builder configuration
 */
export interface GraphBuilderConfig<
  // _TState is preserved for downstream type inference even though unused here
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _TState = unknown,
> {
  /**
   * State annotation for the graph (LangGraph Annotation.Root result)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stateAnnotation: ConstructorParameters<typeof StateGraph<any>>[0];

  /**
   * Whether to enable checkpointing (default: false)
   */
  enableCheckpointing?: boolean;

  /**
   * Custom checkpointer (if not provided, uses MemorySaver)
   */
  checkpointer?: Checkpointer;

  /**
   * Flow ID used as an OTel span attribute on each node span (default: 'unknown')
   */
  flowId?: string;
}

/**
 * Node function type - simplified to work with LangGraph's complex internal types
 */
export type NodeFunction<TState> = (state: TState) => Promise<Partial<TState>> | Partial<TState>;

/**
 * Builder for creating LangGraph state graphs with common patterns
 */
export class GraphBuilder<TState> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private graph: StateGraph<any>;
  private checkpointer?: Checkpointer;
  private flowId: string;

  constructor(config: GraphBuilderConfig<TState>) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.graph = new StateGraph(config.stateAnnotation as any) as any;
    this.flowId = config.flowId ?? 'unknown';

    if (config.enableCheckpointing) {
      this.checkpointer = config.checkpointer || new MemorySaver();
    }
  }

  /**
   * Adds a node to the graph, wrapping it with an OTel child span named flow-node:{name}.
   */
  addNode(name: string, fn: NodeFunction<TState>): this {
    const flowId = this.flowId;
    const wrappedFn = async (state: TState): Promise<Partial<TState>> => {
      const tracer = trace.getTracer('flows');
      const inputKeys = Object.keys(state as object);
      const span = tracer.startSpan(`flow-node:${name}`, {
        attributes: {
          flowId,
          nodeId: name,
          inputKeys: inputKeys.join(','),
        },
      });
      try {
        const result = await fn(state);
        const outputKeys = Object.keys((result ?? {}) as object);
        span.setAttribute('outputKeys', outputKeys.join(','));
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
        span.recordException(err as Error);
        throw err;
      } finally {
        span.end();
      }
    };
    this.graph.addNode(name, wrappedFn);
    return this;
  }

  /**
   * Adds multiple nodes at once
   */
  addNodes(nodes: Record<string, NodeFunction<TState>>): this {
    for (const [name, fn] of Object.entries(nodes)) {
      this.addNode(name, fn);
    }
    return this;
  }

  /**
   * Adds an edge from one node to another
   */
  addEdge(from: NodeName, to: NodeName): this {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.graph.addEdge(from as any, to as any);
    return this;
  }

  /**
   * Adds multiple edges at once
   */
  addEdges(edges: Array<[NodeName, NodeName]>): this {
    for (const [from, to] of edges) {
      this.addEdge(from, to);
    }
    return this;
  }

  /**
   * Adds a conditional edge with a routing function
   */
  addConditionalEdge(
    from: NodeName,
    condition: ConditionalEdgeFunction<TState>,
    pathMap?: Record<string, NodeName>
  ): this {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.graph.addConditionalEdges(from as any, condition as any, pathMap as any);
    return this;
  }

  /**
   * Sets the entry point of the graph
   */
  setEntryPoint(node: NodeName): this {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.graph.addEdge(START, node as any);
    return this;
  }

  /**
   * Sets the finish point of the graph
   */
  setFinishPoint(node: NodeName): this {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.graph.addEdge(node as any, END);
    return this;
  }

  /**
   * Compiles the graph
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  compile(): any {
    return this.graph.compile({
      checkpointer: this.checkpointer,
    });
  }

  /**
   * Gets the underlying StateGraph instance
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getGraph(): StateGraph<any> {
    return this.graph;
  }
}

/**
 * Creates a simple linear graph with sequential nodes
 */
export function createLinearGraph<TState>(
  config: GraphBuilderConfig<TState>,
  nodes: Array<{ name: string; fn: NodeFunction<TState> }>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  const builder = new GraphBuilder(config);

  // Add all nodes
  for (const node of nodes) {
    builder.addNode(node.name, node.fn);
  }

  // Connect nodes sequentially
  if (nodes.length > 0) {
    builder.setEntryPoint(nodes[0].name);

    for (let i = 0; i < nodes.length - 1; i++) {
      builder.addEdge(nodes[i].name, nodes[i + 1].name);
    }

    builder.setFinishPoint(nodes[nodes.length - 1].name);
  }

  return builder.compile();
}

/**
 * Creates a graph with a loop pattern (node -> condition -> node or END)
 */
export function createLoopGraph<TState>(
  config: GraphBuilderConfig<TState>,
  options: {
    nodeName: string;
    nodeFunction: NodeFunction<TState>;
    shouldContinue: (state: TState) => boolean;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  const builder = new GraphBuilder(config);

  builder.addNode(options.nodeName, options.nodeFunction);
  builder.setEntryPoint(options.nodeName);

  builder.addConditionalEdge(options.nodeName, (state: TState) => {
    return options.shouldContinue(state) ? options.nodeName : END;
  });

  return builder.compile();
}

/**
 * Creates a graph with a branching pattern (entry -> router -> branches -> exit)
 */
export function createBranchingGraph<TState>(
  config: GraphBuilderConfig<TState>,
  options: {
    entryNode: { name: string; fn: NodeFunction<TState> };
    branches: Array<{ name: string; fn: NodeFunction<TState> }>;
    router: ConditionalEdgeFunction<TState>;
    exitNode?: { name: string; fn: NodeFunction<TState> };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  const builder = new GraphBuilder(config);

  // Add entry node
  builder.addNode(options.entryNode.name, options.entryNode.fn);
  builder.setEntryPoint(options.entryNode.name);

  // Add branch nodes
  for (const branch of options.branches) {
    builder.addNode(branch.name, branch.fn);
  }

  // Add conditional routing from entry to branches
  builder.addConditionalEdge(options.entryNode.name, options.router);

  // Add exit node if provided
  if (options.exitNode) {
    builder.addNode(options.exitNode.name, options.exitNode.fn);

    // Connect all branches to exit
    for (const branch of options.branches) {
      builder.addEdge(branch.name, options.exitNode.name);
    }

    builder.setFinishPoint(options.exitNode.name);
  } else {
    // Connect all branches to END
    for (const branch of options.branches) {
      builder.setFinishPoint(branch.name);
    }
  }

  return builder.compile();
}

/**
 * Helper to create a tool execution node (common LangGraph pattern)
 */
export function createToolNode<TState>(
  name: string,
  _tools: unknown[]
): { name: string; fn: NodeFunction<TState> } {
  return {
    name,
    fn: async (_state: TState) => {
      // This is a placeholder - actual implementation would integrate with LangChain tools
      // For now, return empty state update
      return {} as Partial<TState>;
    },
  };
}

/**
 * Re-export END and START for convenience
 */
export { END, START };
