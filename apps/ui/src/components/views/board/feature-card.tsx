/**
 * FeatureCard — lightweight wrapper around KanbanCard that adds a fleet badge
 * when a feature is being executed on a remote instance.
 *
 * The fleet badge is shown whenever `feature.assignedInstance` is set and does
 * not match the local `instanceId`.  It renders a small violet pill with a
 * Server icon to indicate that execution is happening remotely.
 */

import React, { memo } from 'react';
import { Server } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@protolabsai/ui/atoms';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Fleet badge
// ---------------------------------------------------------------------------

interface FleetBadgeProps {
  instanceId: string;
  className?: string;
}

/**
 * FleetBadge — shown on features that are being executed on a remote instance.
 *
 * Placed as an absolute-positioned overlay in the top-right corner of the card
 * so it does not displace any existing card content.
 */
export const FleetBadge = memo(function FleetBadge({ instanceId, className }: FleetBadgeProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'inline-flex items-center gap-1 px-1.5 h-5 rounded text-[10px] font-medium',
              'bg-violet-500/15 text-violet-400 border border-violet-500/30',
              className
            )}
            data-testid={`fleet-badge-${instanceId}`}
          >
            <Server className="w-2.5 h-2.5" />
            {instanceId}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          <p>Executing on remote instance: {instanceId}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

// ---------------------------------------------------------------------------
// FeatureCard
// ---------------------------------------------------------------------------

export interface FeatureCardFeature {
  id: string;
  /** Instance ID of the instance executing this feature (if cross-instance) */
  assignedInstance?: string;
  [key: string]: unknown;
}

export interface FeatureCardProps {
  /** The feature to render */
  feature: FeatureCardFeature;
  /** The local instance ID — used to determine whether the fleet badge should appear */
  localInstanceId?: string;
  /** Additional className applied to the wrapper */
  className?: string;
  /** Child content (typically a KanbanCard or similar) */
  children: React.ReactNode;
}

/**
 * FeatureCard wraps any card content and injects a fleet badge overlay when
 * the feature's `assignedInstance` differs from `localInstanceId`.
 *
 * Usage:
 * ```tsx
 * <FeatureCard feature={feature} localInstanceId={currentInstanceId}>
 *   <KanbanCard feature={feature} ... />
 * </FeatureCard>
 * ```
 */
export const FeatureCard = memo(function FeatureCard({
  feature,
  localInstanceId,
  className,
  children,
}: FeatureCardProps) {
  const isRemote = !!feature.assignedInstance && feature.assignedInstance !== localInstanceId;

  return (
    <div className={cn('relative', className)} data-testid={`feature-card-${feature.id}`}>
      {children}

      {/* Fleet badge — only shown for features running on a remote instance */}
      {isRemote && (
        <div className="absolute top-1.5 right-1.5 z-10 pointer-events-auto">
          <FleetBadge instanceId={feature.assignedInstance!} />
        </div>
      )}
    </div>
  );
});
