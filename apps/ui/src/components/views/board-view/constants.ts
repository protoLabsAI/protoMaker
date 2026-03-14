import type { Feature } from '@/store/types';

export type ColumnId = Feature['status'];

/**
 * Empty state configuration for each column type
 */
export interface EmptyStateConfig {
  title: string;
  description: string;
  icon: 'lightbulb' | 'play' | 'clock' | 'check' | 'sparkles';
  shortcutKey?: string; // Keyboard shortcut label (e.g., 'N', 'A')
  shortcutHint?: string; // Human-readable shortcut hint
  primaryAction?: {
    label: string;
    actionType: 'ai-suggest' | 'none';
  };
}

/**
 * Default empty state configurations per column type
 */
export const EMPTY_STATE_CONFIGS: Record<string, EmptyStateConfig> = {
  backlog: {
    title: 'Ready for Ideas',
    description:
      'Add your first feature idea to get started using the button below, or let AI help generate ideas.',
    icon: 'lightbulb',
    shortcutHint: 'Press',
    primaryAction: {
      label: 'Use AI Suggestions',
      actionType: 'none',
    },
  },
  in_progress: {
    title: 'Nothing in Progress',
    description: 'Drag a feature from the backlog here or click implement to start working on it.',
    icon: 'play',
  },
  review: {
    title: 'No PRs Under Review',
    description: 'Features with open PRs will appear here for review and approval.',
    icon: 'clock',
  },
  blocked: {
    title: 'No Blocked Features',
    description: 'Features that are temporarily blocked will appear here.',
    icon: 'clock',
  },
  done: {
    title: 'No Completed Features',
    description: 'Features with merged PRs will appear here.',
    icon: 'check',
  },
  // Legacy column (deprecated, but kept for backwards compatibility)
  waiting_approval: {
    title: 'No Items Awaiting Approval',
    description: 'Features will appear here after implementation is complete and need your review.',
    icon: 'clock',
  },
};

/**
 * Get empty state config for a column
 */
export function getEmptyStateConfig(columnId: string): EmptyStateConfig {
  return EMPTY_STATE_CONFIGS[columnId] || EMPTY_STATE_CONFIGS.default;
}

export interface Column {
  id: string;
  title: string;
  colorClass: string;
}

// Canonical 5-status columns
export const COLUMNS: Column[] = [
  { id: 'backlog', title: 'Backlog', colorClass: 'bg-[var(--status-backlog)]' },
  {
    id: 'in_progress',
    title: 'In Progress',
    colorClass: 'bg-[var(--status-in-progress)]',
  },
  {
    id: 'review',
    title: 'Review',
    colorClass: 'bg-[var(--status-review)]',
  },
  {
    id: 'blocked',
    title: 'Blocked',
    colorClass: 'bg-[var(--status-blocked)]',
  },
  {
    id: 'done',
    title: 'Done',
    colorClass: 'bg-[var(--status-done)]',
  },
];
