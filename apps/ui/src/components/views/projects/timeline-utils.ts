/**
 * Timeline event configuration utilities.
 * Pure logic — no React, no browser APIs.
 */

export type TimelineEventType =
  | 'feature:done'
  | 'milestone:completed'
  | 'ceremony:fired'
  | 'escalation'
  | 'pr:merged';

export interface TimelineEvent {
  id: string;
  type: TimelineEventType | string;
  title: string;
  description?: string;
  occurredAt: string;
  metadata?: Record<string, unknown>;
}

export interface EventDisplayConfig {
  /** Icon name from lucide-react */
  iconName: string;
  label: string;
  color: string;
}

export const EVENT_DISPLAY_CONFIG: Record<TimelineEventType, EventDisplayConfig> = {
  'feature:done': {
    iconName: 'CheckCircle',
    label: 'Feature Done',
    color: 'text-green-500',
  },
  'milestone:completed': {
    iconName: 'Flag',
    label: 'Milestone Completed',
    color: 'text-blue-500',
  },
  'ceremony:fired': {
    iconName: 'PartyPopper',
    label: 'Ceremony Fired',
    color: 'text-purple-500',
  },
  escalation: {
    iconName: 'AlertTriangle',
    label: 'Escalation',
    color: 'text-amber-500',
  },
  'pr:merged': {
    iconName: 'GitMerge',
    label: 'PR Merged',
    color: 'text-indigo-500',
  },
};

export const DEFAULT_EVENT_DISPLAY_CONFIG: EventDisplayConfig = {
  iconName: 'Activity',
  label: 'Activity',
  color: 'text-muted-foreground',
};

export function getEventDisplayConfig(type: string): EventDisplayConfig {
  return EVENT_DISPLAY_CONFIG[type as TimelineEventType] ?? DEFAULT_EVENT_DISPLAY_CONFIG;
}
