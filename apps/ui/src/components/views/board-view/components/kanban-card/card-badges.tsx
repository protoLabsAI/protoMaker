import { memo, useEffect, useMemo, useState } from 'react';
import { Feature, useAppStore } from '@/store/app-store';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@protolabsai/ui/atoms';
import {
  AlertCircle,
  AlertTriangle,
  Lock,
  Hand,
  Sparkles,
  Calendar,
  DollarSign,
  Lightbulb,
  Search,
  FileEdit,
  CheckCircle2,
  Play,
  Ban,
  TestTube,
  Clock,
  Loader2,
  FileText,
  XCircle,
  Server,
} from 'lucide-react';
import { getBlockingDependencies } from '@protolabsai/dependency-resolver';
import { useShallow } from 'zustand/react/shallow';
import { EpicBadge } from './epic-badge';
import { formatCostUsd } from '@/lib/format';
import type { WorkItemState } from '@protolabsai/types';

/** Uniform badge style for all card badges */
const uniformBadgeClass =
  'inline-flex items-center justify-center w-6 h-6 rounded-md border-[1.5px]';

/**
 * Get badge style and label for workItemState
 */
function getWorkItemStateBadge(state: WorkItemState): {
  icon: typeof Lightbulb;
  label: string;
  className: string;
} {
  switch (state) {
    case 'idea':
      return {
        icon: Lightbulb,
        label: 'Idea',
        className: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
      };
    case 'pending_pm_review':
      return {
        icon: Clock,
        label: 'Pending PM Review',
        className: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
      };
    case 'pm_review':
      return {
        icon: Search,
        label: 'PM Review',
        className: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
      };
    case 'pm_processing':
      return {
        icon: Loader2,
        label: 'PM Processing',
        className: 'bg-blue-500/15 text-blue-400 border-blue-500/30 animate-spin',
      };
    case 'prd_ready':
      return {
        icon: FileText,
        label: 'PRD Ready',
        className:
          'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 cursor-pointer hover:bg-emerald-500/25',
      };
    case 'pm_changes_requested':
      return {
        icon: FileEdit,
        label: 'PM Changes Requested',
        className: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
      };
    case 'rejected':
      return {
        icon: XCircle,
        label: 'Rejected',
        className: 'bg-red-500/15 text-red-400 border-red-500/30',
      };
    case 'approved':
      return {
        icon: CheckCircle2,
        label: 'Approved',
        className: 'bg-green-500/15 text-green-400 border-green-500/30',
      };
    case 'research':
      return {
        icon: Search,
        label: 'Research',
        className: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
      };
    case 'planned':
      return {
        icon: FileEdit,
        label: 'Planned',
        className: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
      };
    case 'ready':
      return {
        icon: CheckCircle2,
        label: 'Ready',
        className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      };
    case 'in_progress':
      return {
        icon: Play,
        label: 'In Progress',
        className: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
      };
    case 'blocked':
      return {
        icon: Ban,
        label: 'Blocked',
        className: 'bg-red-500/15 text-red-400 border-red-500/30',
      };
    case 'testing':
      return {
        icon: TestTube,
        label: 'Testing',
        className: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
      };
    case 'done':
      return {
        icon: CheckCircle2,
        label: 'Done',
        className: 'bg-green-500/15 text-green-400 border-green-500/30',
      };
  }
}

/**
 * Returns true when a blocked feature's statusChangeReason indicates it needs
 * human intervention (will not be auto-requeued by auto-mode).
 */
function isHumanInterventionRequired(reason: string): boolean {
  return (
    reason.includes('git commit') ||
    reason.includes('git workflow failed') ||
    reason.includes('plan validation failed')
  );
}

interface CardBadgesProps {
  feature: Feature;
  onPRDClick?: () => void;
}

/**
 * CardBadges - Shows error and epic badges below the card header
 * Note: Blocked/Lock badges are now shown in PriorityBadges for visual consistency
 */
export const CardBadges = memo(function CardBadges({ feature, onPRDClick }: CardBadgesProps) {
  const hasEpic = !!feature.epicId;
  const hasError = !!feature.error;
  const hasDueDate = !!feature.dueDate;
  const hasWorkItemState = !!feature.workItemState;
  // costUsd is typed as unknown on the Feature interface; narrow with typeof guard
  const costUsd = typeof feature.costUsd === 'number' ? feature.costUsd : undefined;
  const hasCost = costUsd != null && costUsd > 0;
  const isNeedsAction =
    feature.status === 'blocked' && isHumanInterventionRequired(feature.statusChangeReason ?? '');
  const hasAssignedInstance = !!feature.assignedInstance;

  if (
    !hasError &&
    !hasEpic &&
    !hasDueDate &&
    !hasCost &&
    !hasWorkItemState &&
    !isNeedsAction &&
    !hasAssignedInstance
  ) {
    return null;
  }

  // Check if due date is past
  const isDueDatePast = hasDueDate && feature.dueDate! < new Date().toISOString().slice(0, 10);

  // Get workItemState badge config
  const workItemStateBadge = hasWorkItemState
    ? getWorkItemStateBadge(feature.workItemState!)
    : null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 pt-1.5 min-h-[24px]">
      {/* Epic badge - shows parent epic for child features */}
      {hasEpic && <EpicBadge feature={feature} />}

      {/* Instance badge - shows which instance owns this feature (cross-instance dashboard) */}
      {hasAssignedInstance && (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="inline-flex items-center gap-1 px-1.5 h-5 rounded text-[10px] font-medium bg-violet-500/15 text-violet-400 border border-violet-500/30"
                data-testid={`instance-badge-${feature.id}`}
              >
                <Server className="w-2.5 h-2.5" />
                {feature.assignedInstance}
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              <p>Assigned to instance: {feature.assignedInstance}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Work Item State badge - authority system lifecycle */}
      {hasWorkItemState && workItemStateBadge && (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  'inline-flex items-center gap-1 px-1.5 h-5 rounded text-[10px] font-medium border',
                  workItemStateBadge.className
                )}
                data-testid={`work-item-state-badge-${feature.id}`}
                onClick={
                  feature.workItemState === 'prd_ready' && onPRDClick
                    ? (e) => {
                        e.stopPropagation();
                        onPRDClick();
                      }
                    : undefined
                }
              >
                <workItemStateBadge.icon className="w-3 h-3" />
                {workItemStateBadge.label}
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              <p>
                Authority System: {workItemStateBadge.label}
                {feature.workItemState === 'prd_ready' && ' (click to review)'}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Due date badge */}
      {hasDueDate && (
        <div
          className={cn(
            'inline-flex items-center gap-1 px-1.5 h-5 rounded text-[10px] font-medium border',
            isDueDatePast
              ? 'bg-red-500/15 text-red-400 border-red-500/30'
              : 'bg-muted/60 text-muted-foreground border-border'
          )}
        >
          <Calendar className="w-3 h-3" />
          {(() => {
            const [y, m, d] = feature.dueDate!.split('-').map(Number);
            if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) {
              return feature.dueDate;
            }
            return new Date(y, m - 1, d).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            });
          })()}
        </div>
      )}

      {/* Cost badge */}
      {hasCost && (
        <div className="inline-flex items-center gap-1 px-1.5 h-5 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          <DollarSign className="w-3 h-3" />
          {formatCostUsd(costUsd!)}
        </div>
      )}

      {/* Error badge */}
      {hasError && (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  uniformBadgeClass,
                  'bg-[var(--status-error-bg)] border-[var(--status-error)]/40 text-[var(--status-error)]'
                )}
                data-testid={`error-badge-${feature.id}`}
              >
                <AlertCircle className="w-3.5 h-3.5" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs max-w-[250px]">
              <p>{feature.error}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Needs Action badge — blocked features that won't auto-recover */}
      {isNeedsAction && (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="inline-flex items-center gap-1 px-1.5 h-5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30"
                data-testid={`needs-action-badge-${feature.id}`}
              >
                <AlertTriangle className="w-3 h-3" />
                Needs Action
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs max-w-[280px]">
              <p className="font-medium mb-0.5">Requires human intervention</p>
              <p className="text-muted-foreground">{feature.statusChangeReason}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
});

interface PriorityBadgesProps {
  feature: Feature;
}

export const PriorityBadges = memo(function PriorityBadges({ feature }: PriorityBadgesProps) {
  const { enableDependencyBlocking, features } = useAppStore(
    useShallow((state) => ({
      enableDependencyBlocking: state.enableDependencyBlocking,
      features: state.features,
    }))
  );
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  // Calculate blocking dependencies (if feature is in backlog and has incomplete dependencies)
  const blockingDependencies = useMemo(() => {
    if (!enableDependencyBlocking || feature.status !== 'backlog') {
      return [];
    }
    return getBlockingDependencies(feature, features);
  }, [enableDependencyBlocking, feature, features]);

  const isJustFinished = useMemo(() => {
    if (!feature.justFinishedAt || feature.status !== 'waiting_approval' || feature.error) {
      return false;
    }
    const finishedTime = new Date(feature.justFinishedAt).getTime();
    const twoMinutes = 2 * 60 * 1000;
    return currentTime - finishedTime < twoMinutes;
  }, [feature.justFinishedAt, feature.status, feature.error, currentTime]);

  useEffect(() => {
    if (!feature.justFinishedAt || feature.status !== 'waiting_approval') {
      return;
    }

    const finishedTime = new Date(feature.justFinishedAt).getTime();
    const twoMinutes = 2 * 60 * 1000;
    const timeRemaining = twoMinutes - (currentTime - finishedTime);

    if (timeRemaining <= 0) {
      return;
    }

    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [feature.justFinishedAt, feature.status, currentTime]);

  const isBlocked =
    blockingDependencies.length > 0 && !feature.error && feature.status === 'backlog';
  const showManualVerification =
    feature.skipTests && !feature.error && feature.status === 'backlog';

  const showBadges = feature.priority || showManualVerification || isBlocked || isJustFinished;

  if (!showBadges) {
    return null;
  }

  return (
    <div className="absolute top-2 left-2 flex items-center gap-1">
      {/* Priority badge */}
      {feature.priority && (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  uniformBadgeClass,
                  feature.priority === 1 &&
                    'bg-[var(--status-error-bg)] border-[var(--status-error)]/40 text-[var(--status-error)]',
                  feature.priority === 2 &&
                    'bg-[var(--status-warning-bg)] border-[var(--status-warning)]/40 text-[var(--status-warning)]',
                  feature.priority === 3 &&
                    'bg-[var(--status-info-bg)] border-[var(--status-info)]/40 text-[var(--status-info)]'
                )}
                data-testid={`priority-badge-${feature.id}`}
              >
                <span className="font-bold text-xs">
                  {feature.priority === 1 ? 'H' : feature.priority === 2 ? 'M' : 'L'}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              <p>
                {feature.priority === 1
                  ? 'High Priority'
                  : feature.priority === 2
                    ? 'Medium Priority'
                    : 'Low Priority'}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Manual verification badge */}
      {showManualVerification && (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  uniformBadgeClass,
                  'bg-[var(--status-warning-bg)] border-[var(--status-warning)]/40 text-[var(--status-warning)]'
                )}
                data-testid={`skip-tests-badge-${feature.id}`}
              >
                <Hand className="w-3.5 h-3.5" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              <p>Manual verification required</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Blocked badge */}
      {isBlocked && (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  uniformBadgeClass,
                  'bg-orange-500/20 border-orange-500/50 text-orange-500'
                )}
                data-testid={`blocked-badge-${feature.id}`}
              >
                <Lock className="w-3.5 h-3.5" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs max-w-[250px]">
              <p className="font-medium mb-1">
                Blocked by {blockingDependencies.length} incomplete{' '}
                {blockingDependencies.length === 1 ? 'dependency' : 'dependencies'}
              </p>
              <p className="text-muted-foreground">
                {blockingDependencies
                  .map((depId) => {
                    const dep = features.find((f) => f.id === depId);
                    return dep?.description || depId;
                  })
                  .join(', ')}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Just Finished badge */}
      {isJustFinished && (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  uniformBadgeClass,
                  'bg-[var(--status-success-bg)] border-[var(--status-success)]/40 text-[var(--status-success)] animate-pulse'
                )}
                data-testid={`just-finished-badge-${feature.id}`}
              >
                <Sparkles className="w-3.5 h-3.5" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              <p>Agent just finished working on this feature</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
});
