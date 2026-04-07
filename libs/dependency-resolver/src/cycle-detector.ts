/**
 * Cross-Repo Cycle Detector
 *
 * Detects circular dependency cycles in a cross-repository dependency graph
 * using depth-first search (DFS). Used by the get_cross_repo_dependencies
 * MCP tool and by get_cross_repo_dependencies to surface circular_risk flags.
 *
 * Stores audit trail in .automaker/circular-deps.json.
 */

/** An edge in the cross-repo dependency graph */
export interface CrossRepoDependencyEdge {
  /** App path of the dependent (the one that needs the dependency) */
  fromAppPath: string;
  /** Feature ID in fromAppPath that has the dependency */
  fromFeatureId: string;
  /** App path of the dependency provider */
  toAppPath: string;
  /** Feature ID in toAppPath that must be done first */
  toFeatureId: string;
  /** Status of the dependency */
  status: 'pending' | 'satisfied' | 'broken';
}

/** Node in the cross-repo dependency graph */
export interface CrossRepoDependencyNode {
  /** Unique identifier for this node (typically appPath) */
  id: string;
  /** Display label */
  label: string;
  /** Number of features in this app with externalDependencies */
  featureCount: number;
}

/** Result from cycle detection */
export interface CycleDetectionResult {
  /** Whether any cycles were found */
  hasCycles: boolean;
  /** List of detected cycles, each as an ordered list of node IDs forming the cycle */
  cycles: string[][];
}

/** Full cross-repo dependency graph */
export interface CrossRepoDependencyGraph {
  nodes: CrossRepoDependencyNode[];
  edges: CrossRepoDependencyEdge[];
  /** The longest chain of pending dependencies (critical path) */
  critical_path: string[];
  /** Cycle detection results */
  circular_risk: CycleDetectionResult;
}

/**
 * Detect circular dependencies in a cross-repo graph using DFS.
 *
 * Algorithm: standard DFS with three-color marking (WHITE/GRAY/BLACK).
 * - WHITE (0): not visited
 * - GRAY (1): in current DFS path (back-edge = cycle)
 * - BLACK (2): fully processed
 *
 * @param edges - All edges in the graph
 * @returns CycleDetectionResult with cycle paths
 */
export function detectCrossRepoCycles(edges: CrossRepoDependencyEdge[]): CycleDetectionResult {
  // Build adjacency list keyed by node ID (appPath)
  const adjacency = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!adjacency.has(edge.fromAppPath)) {
      adjacency.set(edge.fromAppPath, new Set());
    }
    adjacency.get(edge.fromAppPath)!.add(edge.toAppPath);
  }

  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = new Map<string, number>();
  const parent = new Map<string, string | null>();
  const cycles: string[][] = [];

  // Initialize all nodes as WHITE
  for (const node of adjacency.keys()) {
    color.set(node, WHITE);
  }
  for (const edge of edges) {
    if (!color.has(edge.toAppPath)) {
      color.set(edge.toAppPath, WHITE);
    }
  }

  function dfsVisit(node: string, path: string[]): void {
    color.set(node, GRAY);
    path.push(node);

    const neighbors = adjacency.get(node) ?? new Set<string>();
    for (const neighbor of neighbors) {
      if (color.get(neighbor) === GRAY) {
        // Back edge found — extract the cycle
        const cycleStart = path.indexOf(neighbor);
        const cycle = path.slice(cycleStart);
        cycle.push(neighbor); // close the cycle
        cycles.push(cycle);
      } else if (color.get(neighbor) !== BLACK) {
        parent.set(neighbor, node);
        dfsVisit(neighbor, path);
      }
    }

    path.pop();
    color.set(node, BLACK);
  }

  for (const node of color.keys()) {
    if (color.get(node) === WHITE) {
      dfsVisit(node, []);
    }
  }

  return { hasCycles: cycles.length > 0, cycles };
}

/**
 * Compute the critical path (longest dependency chain) in the graph.
 *
 * Returns an ordered list of node IDs from the start of the longest chain
 * to its end. Uses a simple dynamic-programming approach on a DAG.
 * If cycles are present, returns an empty array (critical path undefined for cyclic graphs).
 *
 * @param edges - All edges in the graph (must be a DAG)
 * @returns Ordered list of node IDs forming the critical path
 */
export function computeCriticalPath(edges: CrossRepoDependencyEdge[]): string[] {
  // Build adjacency list and in-degree count
  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  const allNodes = new Set<string>();

  for (const edge of edges) {
    allNodes.add(edge.fromAppPath);
    allNodes.add(edge.toAppPath);
    if (!adjacency.has(edge.fromAppPath)) adjacency.set(edge.fromAppPath, []);
    adjacency.get(edge.fromAppPath)!.push(edge.toAppPath);
    inDegree.set(edge.toAppPath, (inDegree.get(edge.toAppPath) ?? 0) + 1);
  }

  for (const node of allNodes) {
    if (!inDegree.has(node)) inDegree.set(node, 0);
  }

  // Topological sort (Kahn's)
  const queue: string[] = [];
  for (const [node, deg] of inDegree) {
    if (deg === 0) queue.push(node);
  }

  const topoOrder: string[] = [];
  const inDegreeCopy = new Map(inDegree);
  while (queue.length > 0) {
    const node = queue.shift()!;
    topoOrder.push(node);
    for (const neighbor of adjacency.get(node) ?? []) {
      const newDeg = (inDegreeCopy.get(neighbor) ?? 0) - 1;
      inDegreeCopy.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  if (topoOrder.length < allNodes.size) {
    // Cycle detected — critical path undefined
    return [];
  }

  // DP: longest path length and predecessor for each node
  const dp = new Map<string, number>();
  const pred = new Map<string, string | null>();
  for (const node of topoOrder) {
    dp.set(node, 0);
    pred.set(node, null);
  }

  for (const node of topoOrder) {
    const currentLen = dp.get(node) ?? 0;
    for (const neighbor of adjacency.get(node) ?? []) {
      const newLen = currentLen + 1;
      if (newLen > (dp.get(neighbor) ?? 0)) {
        dp.set(neighbor, newLen);
        pred.set(neighbor, node);
      }
    }
  }

  // Find end node of longest path
  let endNode = '';
  let maxLen = -1;
  for (const [node, len] of dp) {
    if (len > maxLen) {
      maxLen = len;
      endNode = node;
    }
  }

  if (maxLen < 0 || !endNode) return [];

  // Reconstruct path from end to start using predecessor map
  const path: string[] = [];
  let current: string | null = endNode;
  while (current !== null) {
    path.unshift(current);
    current = pred.get(current) ?? null;
  }

  return path;
}

/**
 * Build a complete cross-repo dependency graph from a list of edges.
 *
 * @param edges - All cross-repo dependency edges
 * @param nodeLabels - Optional map from appPath to display label
 * @param featureCounts - Optional map from appPath to feature count
 * @returns Complete dependency graph with cycle detection and critical path
 */
export function buildCrossRepoDependencyGraph(
  edges: CrossRepoDependencyEdge[],
  nodeLabels: Map<string, string> = new Map(),
  featureCounts: Map<string, number> = new Map()
): CrossRepoDependencyGraph {
  const nodeIds = new Set<string>();
  for (const edge of edges) {
    nodeIds.add(edge.fromAppPath);
    nodeIds.add(edge.toAppPath);
  }

  const nodes: CrossRepoDependencyNode[] = Array.from(nodeIds).map((id) => ({
    id,
    label: nodeLabels.get(id) ?? id,
    featureCount: featureCounts.get(id) ?? 0,
  }));

  const circular_risk = detectCrossRepoCycles(edges);
  const critical_path = circular_risk.hasCycles ? [] : computeCriticalPath(edges);

  return { nodes, edges, critical_path, circular_risk };
}
