/**
 * Pipeline Tracker Hook
 *
 * Subscribes to WebSocket events and maps them to pipeline stages.
 * Tracks work items with featureId correlation and auto-expires completed items.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getHttpApiClient } from '@/lib/http-api-client';
import { createLogger } from '@automaker/utils/logger';
import type { EventType } from '@automaker/types';
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

  // Merge - PR approved and merging
  'pr:approved': 'merge',
  'github:pr:approved': 'merge',

  // Test - CI checks running
  'github:pr:checks-updated': 'test',
  'pr:ci-failure': 'test',

  // Verify - Ralph verification
  'ralph:verification_started': 'verify',
  'ralph:verification_completed': 'verify',
  'ralph:verified': 'verify',
  'feature:verified': 'verify',

  // Done - completed
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
}

export function usePipelineTracker(): UsePipelineTrackerResult {
  const [workItems, setWorkItems] = useState<Map<string, TrackedWorkItem>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const expiryTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Track work items based on incoming events
  const handleEvent = useCallback((type: EventType, payload: any) => {
    const stageId = EVENT_STAGE_MAP[type];
    if (!stageId) return;

    // Extract featureId from payload
    const featureId = payload?.featureId;
    if (!featureId) return;

    const itemId = featureId;
    const title = payload?.featureTitle || payload?.title || featureId;

    logger.debug('Tracking work item:', { itemId, title, stageId, type });

    setWorkItems((prev) => {
      const next = new Map(prev);

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
    'merge',
    'test',
    'verify',
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
  };
}
