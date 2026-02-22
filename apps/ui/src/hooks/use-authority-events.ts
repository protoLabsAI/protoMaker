/**
 * Hook to subscribe to authority system WebSocket events
 */

import { useEffect, useState, useCallback } from 'react';
import { getHttpApiClient } from '@/lib/http-api-client';
import type { EventType } from '@automaker/types';

export interface AuthorityEvent {
  id: string;
  type: EventType;
  timestamp: number;
  message: string;
  agent?: string;
  featureId?: string;
  severity?: 'info' | 'success' | 'warning' | 'error';
}

/**
 * Extract human-readable message from authority event
 */
function formatAuthorityMessage(type: EventType, payload: any): string {
  switch (type) {
    case 'authority:pm-review-started':
      return `PM Agent reviewing PRD: ${payload.title || 'Untitled'}`;
    case 'authority:pm-review-approved':
      return `PM Agent approved PRD: ${payload.title || 'Untitled'}`;
    case 'authority:pm-review-changes-requested':
      return `PM Agent requested changes: ${payload.title || 'Untitled'}`;
    case 'authority:pm-research-started':
      return `PM Agent starting research phase`;
    case 'authority:pm-research-completed':
      return `PM Agent completed research`;
    case 'authority:pm-prd-ready':
      return `PM Agent finalized PRD`;
    case 'authority:pm-epic-created':
      return `PM Agent created epic: ${payload.title || 'Untitled'}`;
    case 'cos:prd-submitted':
      return `Chief of Staff submitted PRD: ${payload.title || 'Untitled'}`;
    case 'pr:feedback-received':
      return `EM Agent received PR feedback on #${payload.prNumber || '?'}`;
    case 'pr:changes-requested':
      return `Changes requested on PR #${payload.prNumber || '?'}`;
    case 'pr:approved':
      return `PR #${payload.prNumber || '?'} approved`;
    case 'pr:feedback-queued':
      return `PR feedback queued for #${payload.prNumber || '?'}`;
    case 'pr:remediation-started':
      return `PR remediation started for #${payload.prNumber || '?'} (${payload.threadCount || 0} threads)`;
    case 'pr:remediation-completed':
      return `PR remediation completed for #${payload.prNumber || '?'}`;
    case 'pr:remediation-failed':
      return `PR remediation failed for #${payload.prNumber || '?'}`;
    case 'pr:thread-evaluated':
      return `PR thread ${payload.canResolve ? 'resolved' : 'pending'} on #${payload.prNumber || '?'}`;
    case 'pr:threads-resolved':
      return `All ${payload.resolvedCount || 0} threads resolved on PR #${payload.prNumber || '?'}`;
    case 'pr:merge-blocked-critical-threads':
      return `PR #${payload.prNumber || '?'} merge blocked by critical threads`;
    case 'pr:ci-failure':
      return `CI failed on PR #${payload.prNumber || '?'}`;
    case 'pr:agent-restart-failed':
      return `Agent restart failed for PR #${payload.prNumber || '?'}`;
    case 'feature:reassigned-for-fixes':
      return `Feature reassigned for PR fixes`;
    case 'escalation:signal-received':
      return `Escalation ${payload.severity || 'unknown'} from ${payload.source || 'unknown'}`;
    case 'escalation:signal-routed':
      return `Escalation routed to ${payload.channel || 'unknown'}`;
    case 'escalation:signal-sent':
      return `Escalation sent via ${payload.channel || 'unknown'}`;
    case 'escalation:signal-failed':
      return `Escalation failed: ${payload.error || 'unknown'}`;
    case 'escalation:signal-deduplicated':
      return `Escalation deduplicated: ${payload.deduplicationKey || 'unknown'}`;
    case 'escalation:ui-notification':
      return `UI notification: ${payload.message || 'unknown'}`;
    case 'authority:proposal-submitted':
      return `Agent submitted proposal: ${payload.action || 'Unknown'}`;
    case 'authority:approved':
      return `Proposal approved`;
    case 'authority:rejected':
      return `Proposal rejected`;
    default:
      return payload.message || `Authority event: ${type}`;
  }
}

/**
 * Determine severity from event type
 */
function getEventSeverity(type: EventType): AuthorityEvent['severity'] {
  if (
    type.includes('error') ||
    type.includes('rejected') ||
    type.includes('failed') ||
    type.includes('blocked')
  )
    return 'error';
  if (
    type.includes('changes-requested') ||
    type.includes('feedback') ||
    type.includes('queued') ||
    type.includes('pending')
  )
    return 'warning';
  if (type.includes('approved') || type.includes('completed') || type.includes('resolved'))
    return 'success';
  return 'info';
}

/**
 * Hook to subscribe to authority events and maintain event list
 */
export function useAuthorityEvents(maxEvents: number = 50) {
  const [events, setEvents] = useState<AuthorityEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  const addEvent = useCallback(
    (type: EventType, payload: any) => {
      const event: AuthorityEvent = {
        id: `${type}-${Date.now()}-${Math.random()}`,
        type,
        timestamp: Date.now(),
        message: formatAuthorityMessage(type, payload),
        agent: payload.agent,
        featureId: payload.featureId,
        severity: getEventSeverity(type),
      };

      setEvents((prev) => {
        const updated = [event, ...prev];
        return updated.slice(0, maxEvents); // Keep only most recent
      });
    },
    [maxEvents]
  );

  useEffect(() => {
    const api = getHttpApiClient();
    setIsConnected(true);

    // Subscribe to all authority-related events, PR events, and escalation events
    const authorityEventTypes: EventType[] = [
      'authority:proposal-submitted',
      'authority:approved',
      'authority:rejected',
      'authority:awaiting-approval',
      'authority:agent-registered',
      'authority:trust-updated',
      'authority:idea-injected',
      'authority:pm-review-started',
      'authority:pm-review-approved',
      'authority:pm-review-changes-requested',
      'authority:cto-approved-idea',
      'authority:pm-research-started',
      'authority:pm-research-completed',
      'authority:pm-prd-ready',
      'authority:pm-epic-created',
      'cos:prd-submitted',
      // All PR events (12 total)
      'pr:feedback-received',
      'pr:changes-requested',
      'pr:approved',
      'pr:feedback-queued',
      'pr:remediation-started',
      'pr:remediation-completed',
      'pr:remediation-failed',
      'pr:thread-evaluated',
      'pr:threads-resolved',
      'pr:merge-blocked-critical-threads',
      'pr:ci-failure',
      'pr:agent-restart-failed',
      'feature:reassigned-for-fixes',
      // Escalation events
      'escalation:signal-received',
      'escalation:signal-routed',
      'escalation:signal-sent',
      'escalation:signal-failed',
      'escalation:signal-deduplicated',
      'escalation:ui-notification',
    ];

    // Subscribe to each event type
    const unsubscribers = authorityEventTypes.map((eventType) => {
      return (api as any).subscribeToEvent(eventType, (payload: any) => {
        addEvent(eventType, payload);
      });
    });

    // Cleanup all subscriptions on unmount
    return () => {
      setIsConnected(false);
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [addEvent]);

  return { events, isConnected };
}
