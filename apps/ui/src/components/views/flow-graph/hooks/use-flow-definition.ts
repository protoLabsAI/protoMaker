/**
 * use-flow-definition.ts — React Query hook to fetch LangGraph topology definitions
 *
 * Fetches graph definition from POST /api/engine/flows with optional graphId filter.
 * 5-minute stale time (graphs rarely change).
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { getHttpApiClient } from '@/lib/http-api-client';

/**
 * LangGraph node definition
 */
export interface GraphNode {
  id: string;
  label: string;
  type?: string;
}

/**
 * LangGraph edge definition
 */
export interface GraphEdge {
  source: string;
  target: string;
  label?: string;
}

/**
 * Complete graph topology definition
 */
export interface GraphDefinition {
  graphId: string;
  name: string;
  description?: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * API response shape for /api/engine/flows
 */
interface FlowsResponse {
  success: boolean;
  graphs?: GraphDefinition[];
  error?: string;
}

/**
 * Fetch a specific graph definition by graphId
 *
 * @param graphId - The graph ID to fetch (e.g., "coordinator-flow", "content-creation")
 * @returns Query result with graph definition
 */
export function useFlowDefinition(graphId?: string) {
  return useQuery({
    queryKey: queryKeys.engine.flows(graphId),
    queryFn: async (): Promise<GraphDefinition | null> => {
      if (!graphId) {
        return null;
      }

      const apiClient = getHttpApiClient();
      const response = (await apiClient.engine.flows(graphId)) as FlowsResponse;

      if (!response.success || !response.graphs || response.graphs.length === 0) {
        return null;
      }

      // Return the first matching graph
      return response.graphs[0];
    },
    enabled: !!graphId,
    staleTime: 5 * 60 * 1000, // 5 minutes — graphs rarely change
    gcTime: 10 * 60 * 1000, // 10 minutes garbage collection
  });
}
