/**
 * use-flow-execution.ts — Real-time flow execution state with WebSocket updates
 *
 * Combines:
 * 1. HTTP fetch for initial execution state
 * 2. WebSocket subscription for real-time node highlighting via feature:progress events
 *
 * Tracks:
 * - currentNode: The currently active node in the graph
 * - completedNodes: Array of node IDs that have finished execution
 */

import { useState, useEffect, useCallback } from 'react';
import { getHttpApiClient } from '@/lib/http-api-client';
import { createLogger } from '@automaker/utils';
import type { EventType } from '@automaker/types';

const logger = createLogger('useFlowExecution');

/**
 * Flow execution state
 */
export interface FlowExecutionState {
  currentNode: string | null;
  completedNodes: string[];
  error?: string;
}

/**
 * Feature progress event from WebSocket
 */
interface FeatureProgressEvent {
  type: 'feature:progress';
  featureId: string;
  status?: string;
  currentNode?: string;
  completedNodes?: string[];
  [key: string]: unknown;
}

/**
 * Hook for tracking real-time flow execution state
 *
 * @param featureId - The feature ID to track execution for
 * @param enabled - Whether to subscribe to real-time updates
 * @returns Current execution state with real-time updates
 */
export function useFlowExecution(featureId?: string, enabled = true) {
  const [executionState, setExecutionState] = useState<FlowExecutionState>({
    currentNode: null,
    completedNodes: [],
  });

  // Handle WebSocket feature:progress events
  const handleProgressEvent = useCallback(
    (event: FeatureProgressEvent) => {
      // Only process events for our feature
      if (event.featureId !== featureId) {
        return;
      }

      logger.debug('Flow execution progress:', {
        featureId: event.featureId,
        currentNode: event.currentNode,
        completedNodes: event.completedNodes,
      });

      setExecutionState((prev) => ({
        currentNode: event.currentNode ?? prev.currentNode,
        completedNodes: event.completedNodes ?? prev.completedNodes,
        error: undefined,
      }));
    },
    [featureId]
  );

  // Subscribe to WebSocket events
  useEffect(() => {
    if (!enabled || !featureId) {
      return;
    }

    // Subscribe to feature:progress events
    const apiClient = getHttpApiClient();
    const unsubscribe = apiClient.subscribeToEvents((type: EventType, payload: any) => {
      if (type === 'feature:progress') {
        handleProgressEvent(payload as FeatureProgressEvent);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [featureId, enabled, handleProgressEvent]);

  // Fetch initial execution state (if needed in the future)
  useEffect(() => {
    if (!enabled || !featureId) {
      return;
    }

    // For now, we start with empty state and rely on WebSocket updates
    // In the future, this could fetch initial state via HTTP:
    // const fetchInitialState = async () => {
    //   try {
    //     const response = await apiClient.features.getExecutionState(featureId);
    //     if (response.success) {
    //       setExecutionState({
    //         currentNode: response.currentNode,
    //         completedNodes: response.completedNodes || [],
    //       });
    //     }
    //   } catch (error) {
    //     logger.error('Failed to fetch initial execution state:', error);
    //   }
    // };
    // fetchInitialState();
  }, [featureId, enabled]);

  const reset = useCallback(() => {
    setExecutionState({
      currentNode: null,
      completedNodes: [],
    });
  }, []);

  return {
    ...executionState,
    reset,
  };
}
