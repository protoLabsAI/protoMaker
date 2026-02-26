/**
 * Pipeline Tracker Hook
 *
 * Subscribes to WebSocket events and maps them to pipeline stages.
 * Tracks work items with featureId correlation and auto-expires completed items.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getHttpApiClient } from '@/lib/http-api-client';
import { createLogger } from '@protolabs-ai/utils/logger';
import { STALE_TIMES } from '@/lib/query-client';
import type { EventType } from '@protolabs-ai/types';
import type { PipelineStageId, TrackedWorkItem, PipelineStageStatus } from '../types';

const logger = createLogger('PipelineTracker');

// Map event types to pipeline stages
const EVENT_STAGE_MAP: Partial<Record<EventType, PipelineStageId>> = {
  // Signal received - entry point to backlog
  'signal:received': 'backlog',
  'feature:created': 'backlog',

  // In progress - active work
  'feature:started': 'in_progress',
  'feature:progress': 'in_progress',
  'feature:tool-use': 'in_progress',
  'agent:stream': 'in_progress',

  // Review - PR created
  'pr:review-submitted': 'review',
  'github:pr:review-submitted': 'review',
  'pr:feedback-received': 'review',
  'pr:changes-requested': 'review',

  // Review also covers merge approval and CI checks
  'pr:approved': 'review',
  'github:pr:approved': 'review',
  'github:pr:checks-updated': 'review',
  'pr:ci-failure': 'review',

  // Done - completed
  'feature:verified': 'done',
  'feature:completed': 'done',
  'feature:pr-merged': 'done',
  'project:completed': 'done',
  'project:reflection:complete': 'done',

  // Blocked - errors and blocks
  'feature:error': 'blocked',
  'feature:permanently-blocked': 'blocked',
  'pr:merge-blocked-critical-threads': 'blocked',
  'auto-mode:error': 'blocked',
} as const;

const EXPIRY_DURATION_MS = 30 * 60 * 1000; // 30 minutes

export interface StageAggregate {
  stageId: PipelineStageId;
  status: PipelineStageStatus;
  itemCount: number;
  workItems: TrackedWorkItem[];
}

export interface UsePipelineTrackerResult {
  stageAggregates: StageAggregate[];
  workItems: TrackedWorkItem[];
  isConnected: boolean;
  isLoading: boolean;
}

export interface UsePipelineTrackerProps {
  projectPath?: string;
}

export function usePipelineTracker(props?: UsePipelineTrackerProps): UsePipelineTrackerResult {
  const { projectPath } = props ?? {};
  const [workItems, setWorkItems] = useState<Map<string, TrackedWorkItem>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const expiryTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Clear work items when project changes
  useEffect(() => {
    setWorkItems(new Map());
    expiryTimers.current.forEach((timer) => clearTimeout(timer));
    expiryTimers.current.clear();
  }, [projectPath]);

  // Fetch initial pipeline state with React Query
  const { data: initialState, isLoading } = useQuery({
    queryKey: ['engine', 'pipeline-state', projectPath],
    queryFn: async () => {
      if (!projectPath) return null;
      const api = getHttpApiClient();
      return api.engine.pipelineState(projectPath);
    },
    enabled: !!projectPath,
    staleTime: STALE_TIMES.DEFAULT,
    refetchOnWindowFocus: false, // Only hydrate once, then rely on WebSocket
  });

  // Hydrate initial work items from HTTP response
  useEffect(() => {
    if (!initialState?.success || !initialState.countsByStatus) return;

    logger.debug('Hydrating initial pipeline state:', initialState);

    setWorkItems(() => {
      const next = new Map<string, TrackedWorkItem>();

      // If server returned feature lists, create individual work items
      if (initialState.featuresByStatus) {
        Object.entries(initialState.featuresByStatus).forEach(([status, features]) => {
          const stageId = status as PipelineStageId;
          for (const feature of features) {
            next.set(feature.id, {
              id: feature.id,
              title: feature.title,
              status: stageId,
              metadata: {
                branchName: feature.branchName,
                createdAt: feature.createdAt,
                complexity: feature.complexity,
                lastTraceId: feature.lastTraceId,
                costUsd: feature.costUsd,
                lastEventType: 'feature:created',
                lastEventTime: Date.now(),
                isInitial: true,
              },
            });
          }
        });
        return next;
      }

      // Fallback: synthetic aggregate items when featuresByStatus is absent
      Object.entries(initialState.countsByStatus!).forEach(([status, count]) => {
        if (count > 0) {
          const stageId = status as PipelineStageId;
          const itemId = `initial-${stageId}`;
          next.set(itemId, {
            id: itemId,
            title: `${count} item${count > 1 ? 's' : ''}`,
            status: stageId,
            metadata: {
              lastEventType: 'feature:created',
              lastEventTime: Date.now(),
              isInitial: true,
            },
          });
        }
      });

      return next;
    });
  }, [initialState]);

  // Track work items based on incoming events
  const handleEvent = useCallback((type: EventType, payload: unknown) => {
    const stageId = EVENT_STAGE_MAP[type];
    if (!stageId) return;

    // Extract featureId from payload
    const p = payload as Record<string, unknown> | null;
    const featureId = p?.featureId as string | undefined;
    if (!featureId) return;

    const itemId = featureId;
    const title = (p?.featureTitle as string) || (p?.title as string) || featureId;

    logger.debug('Tracking work item:', { itemId, title, stageId, type });

    setWorkItems((prev) => {
      const next = new Map(prev);

      // Remove initial synthetic items for this stage when first real event arrives
      for (const [key, item] of next.entries()) {
        if (item.metadata?.isInitial && item.status === stageId) {
          next.delete(key);
        }
      }

      // Update or create work item
      const existing = next.get(itemId);
      const item: TrackedWorkItem = {
        id: itemId,
        title,
        status: stageId,
        progress: payload?.progress,
        metadata: {
          lastEventType: type,
          lastEventTime: Date.now(),
          ...existing?.metadata,
          isInitial: false,
        },
      };

      next.set(itemId, item);

      // Clear existing expiry timer if any
      const existingTimer = expiryTimers.current.get(itemId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // Set expiry timer for 'done' items
      if (stageId === 'done') {
        const timer = setTimeout(() => {
          logger.debug('Expiring work item:', itemId);
          setWorkItems((current) => {
            const updated = new Map(current);
            updated.delete(itemId);
            return updated;
          });
          expiryTimers.current.delete(itemId);
        }, EXPIRY_DURATION_MS);

        expiryTimers.current.set(itemId, timer);
      }

      return next;
    });
  }, []);

  // Subscribe to WebSocket events
  useEffect(() => {
    const api = getHttpApiClient();

    // Connect to WebSocket
    setIsConnected(true);

    // Subscribe to all events
    const unsubscribe = api.subscribeToEvents((type, payload) => {
      handleEvent(type, payload);
    });

    return () => {
      unsubscribe();
      setIsConnected(false);

      // Clear all expiry timers
      expiryTimers.current.forEach((timer) => clearTimeout(timer));
      expiryTimers.current.clear();
    };
  }, [handleEvent]);

  // Compute stage aggregates
  const stageAggregates: StageAggregate[] = [
    'backlog',
    'in_progress',
    'review',
    'done',
    'blocked',
  ].map((stageId) => {
    const items = Array.from(workItems.values()).filter((item) => item.status === stageId);
    const itemCount = items.length;

    // Determine most-active status for the stage
    let status: PipelineStageStatus = 'idle';
    if (itemCount > 0) {
      // If any items in this stage, mark as active
      if (stageId === 'blocked') {
        status = 'blocked';
      } else if (
        items.some((item) => {
          const lastEvent = item.metadata?.lastEventType;
          return typeof lastEvent === 'string' && lastEvent.includes('error');
        })
      ) {
        status = 'error';
      } else {
        status = 'active';
      }
    }

    return {
      stageId: stageId as PipelineStageId,
      status,
      itemCount,
      workItems: items,
    };
  });

  return {
    stageAggregates,
    workItems: Array.from(workItems.values()),
    isConnected,
    isLoading,
  };
}
