/**
 * Hook to subscribe to WebSocket event stream and maintain a feed of recent events
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getHttpApiClient } from '@/lib/http-api-client';
import { createLogger } from '@automaker/utils/logger';
import type { EventType } from '@automaker/types';

const logger = createLogger('EventFeed');

// Event types to surface in the feed
const FEED_EVENT_TYPES: EventType[] = [
  'feature:started',
  'feature:completed',
  'feature:error',
  'feature:retry',
  'auto-mode:started',
  'auto-mode:stopped',
  'auto-mode:idle',
  'feature:pr-merged',
  'feature:committed',
  'health:issue-detected',
  'health:issue-remediated',
  'milestone:completed',
  'project:completed',
];

export interface FeedEvent {
  id: string;
  type: EventType;
  timestamp: string;
  description: string;
  color: 'green' | 'red' | 'blue' | 'yellow';
  icon: string;
}

interface UseEventFeedOptions {
  projectPath: string | null;
  maxEvents?: number;
}

interface UseEventFeedResult {
  events: FeedEvent[];
  isConnected: boolean;
  error: string | null;
}

/**
 * Generate a human-readable description for an event
 */
function getEventDescription(type: EventType, payload: any): string {
  switch (type) {
    case 'feature:started':
      return payload?.featureTitle ? `Feature started: ${payload.featureTitle}` : 'Feature started';
    case 'feature:completed':
      return payload?.featureTitle
        ? `Feature completed: ${payload.featureTitle}`
        : 'Feature completed';
    case 'feature:error':
      return payload?.featureTitle
        ? `Feature error: ${payload.featureTitle}`
        : 'Feature error occurred';
    case 'feature:retry':
      return payload?.featureTitle
        ? `Feature retrying: ${payload.featureTitle}`
        : 'Feature retry initiated';
    case 'auto-mode:started':
      return 'Auto mode started';
    case 'auto-mode:stopped':
      return 'Auto mode stopped';
    case 'auto-mode:idle':
      return 'Auto mode idle';
    case 'feature:pr-merged':
      return payload?.featureTitle ? `PR merged: ${payload.featureTitle}` : 'Pull request merged';
    case 'feature:committed':
      return payload?.featureTitle
        ? `Changes committed: ${payload.featureTitle}`
        : 'Changes committed';
    case 'health:issue-detected':
      return payload?.message || 'Health issue detected';
    case 'health:issue-remediated':
      return payload?.message || 'Health issue remediated';
    case 'milestone:completed':
      return payload?.milestone || 'Milestone completed';
    case 'project:completed':
      return payload?.project || 'Project completed';
    default:
      return type.replace(/:/g, ' ').replace(/-/g, ' ');
  }
}

/**
 * Get the color for an event type
 */
function getEventColor(type: EventType): 'green' | 'red' | 'blue' | 'yellow' {
  if (type.includes('error')) return 'red';
  if (type.includes('completed') || type.includes('merged') || type.includes('remediated'))
    return 'green';
  if (type.includes('started') || type.includes('retry') || type.includes('detected'))
    return 'blue';
  if (type.includes('idle') || type.includes('stopped')) return 'yellow';
  return 'blue';
}

/**
 * Get an icon name for an event type
 */
function getEventIcon(type: EventType): string {
  if (type.includes('error')) return 'AlertCircle';
  if (type.includes('completed') || type.includes('merged')) return 'CheckCircle';
  if (type.includes('started')) return 'Play';
  if (type.includes('stopped')) return 'Square';
  if (type.includes('retry')) return 'RefreshCw';
  if (type.includes('committed')) return 'GitCommit';
  if (type.includes('pr-merged')) return 'GitMerge';
  if (type.includes('issue-detected')) return 'AlertTriangle';
  if (type.includes('issue-remediated')) return 'CheckCircle2';
  if (type.includes('milestone') || type.includes('project')) return 'Flag';
  if (type.includes('idle')) return 'Pause';
  return 'Circle';
}

/**
 * Hook to subscribe to WebSocket event stream and maintain a feed of recent events
 */
export function useEventFeed({
  projectPath,
  maxEvents = 25,
}: UseEventFeedOptions): UseEventFeedResult {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventIdCounter = useRef(0);

  const addEvent = useCallback(
    (type: EventType, payload: any) => {
      // Only process events we care about
      if (!FEED_EVENT_TYPES.includes(type)) {
        return;
      }

      // Filter by project path if payload has projectPath
      if (payload?.projectPath && projectPath && payload.projectPath !== projectPath) {
        return;
      }

      const feedEvent: FeedEvent = {
        id: `event-${Date.now()}-${eventIdCounter.current++}`,
        type,
        timestamp: new Date().toISOString(),
        description: getEventDescription(type, payload),
        color: getEventColor(type),
        icon: getEventIcon(type),
      };

      setEvents((prev) => {
        const updated = [feedEvent, ...prev];
        return updated.slice(0, maxEvents);
      });
    },
    [projectPath, maxEvents]
  );

  useEffect(() => {
    if (!projectPath) {
      setEvents([]);
      setIsConnected(false);
      setError(null);
      return;
    }

    const api = getHttpApiClient();
    logger.info('Subscribing to event stream for project:', projectPath);

    try {
      // Subscribe to all events via WebSocket
      const unsubscribe = api.subscribeToEvents((type: EventType, payload: unknown) => {
        addEvent(type, payload);
      });

      setIsConnected(true);
      setError(null);

      return () => {
        logger.info('Unsubscribing from event stream');
        unsubscribe();
      };
    } catch (err) {
      logger.error('Failed to subscribe to event stream:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect to event stream');
      setIsConnected(false);
    }
  }, [projectPath, addEvent]);

  return {
    events,
    isConnected,
    error,
  };
}
