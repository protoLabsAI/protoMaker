import { memo, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { COLUMNS } from '../../constants';
import type { FeatureStatusWithPipeline } from '@protolabsai/types';

/**
 * Status display configuration
 */
interface StatusDisplay {
  label: string;
  colorClass: string;
  bgClass: string;
  borderClass: string;
}

/**
 * Base status display configurations using CSS variables
 */
const BASE_STATUS_DISPLAY: Record<string, StatusDisplay> = {
  backlog: {
    label: 'Backlog',
    colorClass: 'text-[var(--status-backlog)]',
    bgClass: 'bg-[var(--status-backlog)]/15',
    borderClass: 'border-[var(--status-backlog)]/30',
  },
  in_progress: {
    label: 'In Progress',
    colorClass: 'text-[var(--status-in-progress)]',
    bgClass: 'bg-[var(--status-in-progress)]/15',
    borderClass: 'border-[var(--status-in-progress)]/30',
  },
  waiting_approval: {
    label: 'Waiting Approval',
    colorClass: 'text-[var(--status-waiting)]',
    bgClass: 'bg-[var(--status-waiting)]/15',
    borderClass: 'border-[var(--status-waiting)]/30',
  },
  verified: {
    label: 'Verified',
    colorClass: 'text-[var(--status-success)]',
    bgClass: 'bg-[var(--status-success)]/15',
    borderClass: 'border-[var(--status-success)]/30',
  },
};

/**
 * Get the display configuration for a status
 */
function getStatusDisplay(status: FeatureStatusWithPipeline): StatusDisplay {
  // Check base status
  const baseDisplay = BASE_STATUS_DISPLAY[status];
  if (baseDisplay) {
    return baseDisplay;
  }

  // Try to find from COLUMNS constant
  const column = COLUMNS.find((c) => c.id === status);
  if (column) {
    return {
      label: column.title,
      colorClass: 'text-muted-foreground',
      bgClass: 'bg-muted/50',
      borderClass: 'border-border/50',
    };
  }

  // Fallback for unknown status
  return {
    label: status.replace(/_/g, ' '),
    colorClass: 'text-muted-foreground',
    bgClass: 'bg-muted/50',
    borderClass: 'border-border/50',
  };
}

export interface StatusBadgeProps {
  /** The status to display */
  status: FeatureStatusWithPipeline;
  /** Size variant for the badge */
  size?: 'sm' | 'default' | 'lg';
  /** Additional className for custom styling */
  className?: string;
}

/**
 * StatusBadge displays a feature status as a colored chip/badge for use in the list view table.
 *
 * Features:
 * - Displays status with appropriate color based on status type
 * - Supports base statuses (backlog, in_progress, waiting_approval, verified)
 * - Size variants (sm, default, lg)
 * - Uses CSS variables for consistent theming
 *
 * @example
 * ```tsx
 * // Basic usage
 * <StatusBadge status="backlog" />
 *
 * // Small size
 * <StatusBadge status="verified" size="sm" />
 * ```
 */
export const StatusBadge = memo(function StatusBadge({
  status,
  size = 'default',
  className,
}: StatusBadgeProps) {
  const display = useMemo(() => getStatusDisplay(status), [status]);

  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-[10px]',
    default: 'px-2 py-0.5 text-xs',
    lg: 'px-2.5 py-1 text-sm',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-medium whitespace-nowrap',
        'transition-colors duration-200',
        sizeClasses[size],
        display.colorClass,
        display.bgClass,
        display.borderClass,
        className
      )}
      data-testid={`status-badge-${status}`}
    >
      {display.label}
    </span>
  );
});

/**
 * Helper function to get the status label without rendering the badge
 * Useful for sorting or filtering operations
 */
export function getStatusLabel(status: FeatureStatusWithPipeline): string {
  return getStatusDisplay(status).label;
}

/**
 * Helper function to get the status order for sorting
 * Returns a numeric value representing the status position in the workflow
 */
export function getStatusOrder(status: FeatureStatusWithPipeline): number {
  const baseOrder: Record<string, number> = {
    backlog: 0,
    in_progress: 1,
    waiting_approval: 2,
    verified: 3,
  };

  return baseOrder[status] ?? 0;
}
