/**
 * Timeline event configuration utilities.
 * Pure logic — no React, no browser APIs.
 */

export type TimelineEventType =
  | 'feature:done'
  | 'feature:started'
  | 'feature:status-changed'
  | 'milestone:completed'
  | 'ceremony:fired'
  | 'escalation'
  | 'pr:merged'
  | 'standup'
  | 'retro'
  | 'decision'
  | 'project:initiated'
  | 'project:prd-approved'
  | 'project:scaffolded'
  | 'project:launched'
  | 'project:completed';

/**
 * Structured timeline entry types for the ceremony engine paper trail.
 * Maps ceremony audit types to display-oriented categories.
 */
export type TimelineEntryCategory =
  | 'standup'
  | 'retro'
  | 'decision'
  | 'escalation'
  | 'milestone'
  | 'feature'
  | 'project';

export interface TimelineEvent {
  id: string;
  type: TimelineEventType | string;
  title: string;
  description?: string;
  occurredAt: string;
  /** Who authored / triggered this entry */
  author?: string;
  /** URL to an associated artifact (e.g. ceremony report markdown) */
  artifactUrl?: string;
  /** Human-readable ceremony type label, e.g. "Standup", "Milestone Retro" */
  ceremonyLabel?: string;
  metadata?: Record<string, unknown>;
}

export interface EventDisplayConfig {
  /** Icon name from lucide-react */
  iconName: string;
  label: string;
  /** Tailwind text color class for the icon */
  color: string;
  /** Tailwind border color class for the card left-border accent */
  borderColor: string;
  /** Tailwind background color class for the card */
  bgColor: string;
  /** Tailwind badge background + text classes */
  badgeClass: string;
  /** Which filter category this event belongs to */
  category: TimelineEntryCategory | null;
}

export const EVENT_DISPLAY_CONFIG: Record<TimelineEventType, EventDisplayConfig> = {
  'feature:done': {
    iconName: 'CheckCircle',
    label: 'Feature Done',
    color: 'text-green-500',
    borderColor: 'border-green-500',
    bgColor: 'bg-green-500/5',
    badgeClass: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    category: 'feature',
  },
  'feature:started': {
    iconName: 'Activity',
    label: 'Feature Started',
    color: 'text-blue-500',
    borderColor: 'border-blue-500',
    bgColor: 'bg-blue-500/5',
    badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    category: 'feature',
  },
  'feature:status-changed': {
    iconName: 'Activity',
    label: 'Status Change',
    color: 'text-slate-500',
    borderColor: 'border-slate-500',
    bgColor: 'bg-slate-500/5',
    badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300',
    category: 'feature',
  },
  'milestone:completed': {
    iconName: 'Trophy',
    label: 'Milestone',
    color: 'text-purple-500',
    borderColor: 'border-purple-500',
    bgColor: 'bg-purple-500/5',
    badgeClass: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    category: 'milestone',
  },
  'ceremony:fired': {
    iconName: 'PartyPopper',
    label: 'Ceremony',
    color: 'text-purple-500',
    borderColor: 'border-purple-500',
    bgColor: 'bg-purple-500/5',
    badgeClass: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    category: 'milestone',
  },
  escalation: {
    iconName: 'AlertTriangle',
    label: 'Escalation',
    color: 'text-red-500',
    borderColor: 'border-red-500',
    bgColor: 'bg-red-500/5',
    badgeClass: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    category: 'escalation',
  },
  'pr:merged': {
    iconName: 'GitMerge',
    label: 'PR Merged',
    color: 'text-indigo-500',
    borderColor: 'border-indigo-500',
    bgColor: 'bg-indigo-500/5',
    badgeClass: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
    category: 'feature',
  },
  standup: {
    iconName: 'Users',
    label: 'Standup',
    color: 'text-green-500',
    borderColor: 'border-green-500',
    bgColor: 'bg-green-500/5',
    badgeClass: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    category: 'standup',
  },
  retro: {
    iconName: 'RefreshCw',
    label: 'Retro',
    color: 'text-blue-500',
    borderColor: 'border-blue-500',
    bgColor: 'bg-blue-500/5',
    badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    category: 'retro',
  },
  decision: {
    iconName: 'Lightbulb',
    label: 'Decision',
    color: 'text-amber-500',
    borderColor: 'border-amber-500',
    bgColor: 'bg-amber-500/5',
    badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    category: 'decision',
  },
  'project:initiated': {
    iconName: 'Lightbulb',
    label: 'Project Created',
    color: 'text-cyan-500',
    borderColor: 'border-cyan-500',
    bgColor: 'bg-cyan-500/5',
    badgeClass: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
    category: 'project',
  },
  'project:prd-approved': {
    iconName: 'CheckCircle',
    label: 'PRD Approved',
    color: 'text-emerald-500',
    borderColor: 'border-emerald-500',
    bgColor: 'bg-emerald-500/5',
    badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    category: 'project',
  },
  'project:scaffolded': {
    iconName: 'Flag',
    label: 'Scaffolded',
    color: 'text-violet-500',
    borderColor: 'border-violet-500',
    bgColor: 'bg-violet-500/5',
    badgeClass: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
    category: 'project',
  },
  'project:launched': {
    iconName: 'Flag',
    label: 'Launched',
    color: 'text-green-600',
    borderColor: 'border-green-600',
    bgColor: 'bg-green-600/5',
    badgeClass: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    category: 'project',
  },
  'project:completed': {
    iconName: 'Trophy',
    label: 'Completed',
    color: 'text-yellow-500',
    borderColor: 'border-yellow-500',
    bgColor: 'bg-yellow-500/5',
    badgeClass: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
    category: 'project',
  },
};

export const DEFAULT_EVENT_DISPLAY_CONFIG: EventDisplayConfig = {
  iconName: 'Activity',
  label: 'Activity',
  color: 'text-muted-foreground',
  borderColor: 'border-border',
  bgColor: 'bg-muted/30',
  badgeClass: 'bg-muted text-muted-foreground',
  category: null,
};

export function getEventDisplayConfig(type: string): EventDisplayConfig {
  return EVENT_DISPLAY_CONFIG[type as TimelineEventType] ?? DEFAULT_EVENT_DISPLAY_CONFIG;
}

/**
 * Maps CeremonyAuditType values (from the server) to timeline entry types.
 */
export const CEREMONY_TYPE_MAP: Record<string, TimelineEventType> = {
  standup: 'standup',
  milestone_retro: 'retro',
  project_retro: 'retro',
  epic_delivery: 'milestone:completed',
  epic_kickoff: 'decision',
  content_brief: 'decision',
  post_project_docs: 'retro',
};

/** All filterable categories shown in the filter UI */
export const FILTER_CATEGORIES: Array<{ value: TimelineEntryCategory | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'project', label: 'Project' },
  { value: 'feature', label: 'Features' },
  { value: 'milestone', label: 'Milestones' },
  { value: 'standup', label: 'Standups' },
  { value: 'retro', label: 'Retros' },
  { value: 'decision', label: 'Decisions' },
  { value: 'escalation', label: 'Escalations' },
];
