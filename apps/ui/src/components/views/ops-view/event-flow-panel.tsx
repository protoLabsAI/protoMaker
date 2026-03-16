/**
 * Event Flow Panel
 *
 * Displays recent webhook deliveries with status badges, expandable detail,
 * and manual retry capability for failed deliveries.
 */

import { useState, useCallback } from 'react';
import {
  Webhook,
  ChevronDown,
  ChevronRight,
  RotateCw,
  RefreshCw,
  Globe,
  MessageSquare,
  GitBranch,
  Zap,
} from 'lucide-react';
import { Badge } from '@protolabsai/ui/atoms';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useEventFlow } from './use-event-flow';
import type { DeliveryRecord, DeliveryStatus } from './use-event-flow';

// ============================================================================
// Constants
// ============================================================================

const STATUS_VARIANTS: Record<DeliveryStatus, 'success' | 'error' | 'warning'> = {
  completed: 'success',
  failed: 'error',
  received: 'warning',
};

const STATUS_LABELS: Record<DeliveryStatus, string> = {
  completed: 'Completed',
  failed: 'Failed',
  received: 'Processing',
};

const SOURCE_ICONS: Record<string, typeof Globe> = {
  github: GitBranch,
  discord: MessageSquare,
  webhook: Webhook,
  internal: Zap,
};

// ============================================================================
// Helpers
// ============================================================================

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  if (diffMs < 60_000) return `${Math.floor(diffMs / 1000)}s ago`;
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getSourceIcon(source: string) {
  return SOURCE_ICONS[source.toLowerCase()] ?? Globe;
}

// ============================================================================
// Sub-components
// ============================================================================

interface DeliveryRowProps {
  delivery: DeliveryRecord;
  isExpanded: boolean;
  onToggle: () => void;
  onRetry: (id: string) => Promise<void>;
  isMutating: boolean;
}

function DeliveryRow({ delivery, isExpanded, onToggle, onRetry, isMutating }: DeliveryRowProps) {
  const SourceIcon = getSourceIcon(delivery.source);
  const canRetry = delivery.status === 'failed';

  return (
    <div className={cn('border-b border-border/30 last:border-b-0', isExpanded && 'bg-accent/20')}>
      {/* Summary row */}
      <button
        onClick={onToggle}
        className="flex items-center gap-3 w-full px-3 py-2.5 text-left hover:bg-accent/30 transition-colors"
      >
        <div className="flex items-center gap-1.5 text-muted-foreground">
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          <SourceIcon className="h-3.5 w-3.5" />
        </div>

        <span className="text-xs font-medium truncate flex-1">{delivery.eventType}</span>

        {delivery.classification && (
          <Badge variant="muted" size="sm">
            {delivery.classification.category}
          </Badge>
        )}

        <Badge variant={STATUS_VARIANTS[delivery.status]} size="sm">
          {STATUS_LABELS[delivery.status]}
        </Badge>

        {delivery.durationMs !== undefined && (
          <span className="text-[10px] text-muted-foreground tabular-nums w-14 text-right">
            {delivery.durationMs}ms
          </span>
        )}

        <span className="text-[10px] text-muted-foreground w-16 text-right">
          {formatTimestamp(delivery.createdAt)}
        </span>
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="px-4 pb-3 pt-1 space-y-2 border-t border-border/20">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <DetailField label="Delivery ID" value={delivery.deliveryId} mono />
            <DetailField label="Source" value={delivery.source} />
            <DetailField label="Event Type" value={delivery.eventType} />
            <DetailField label="Status" value={delivery.status} />

            {delivery.classification && (
              <>
                <DetailField label="Category" value={delivery.classification.category} />
                <DetailField label="Intent" value={delivery.classification.intent} />
              </>
            )}

            {delivery.routedTo && <DetailField label="Routed To" value={delivery.routedTo} />}
            {delivery.featureId && <DetailField label="Feature" value={delivery.featureId} mono />}
            {delivery.error && <DetailField label="Error" value={delivery.error} error />}

            <DetailField label="Created" value={new Date(delivery.createdAt).toLocaleString()} />
            {delivery.completedAt && (
              <DetailField
                label="Completed"
                value={new Date(delivery.completedAt).toLocaleString()}
              />
            )}
          </div>

          {canRetry && (
            <div className="pt-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRetry(delivery.deliveryId);
                }}
                disabled={isMutating}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                  'border border-border bg-background hover:bg-accent',
                  'disabled:opacity-50 disabled:pointer-events-none'
                )}
              >
                <RotateCw className="h-3 w-3" />
                Retry Delivery
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface DetailFieldProps {
  label: string;
  value: string;
  mono?: boolean;
  error?: boolean;
}

function DetailField({ label, value, mono, error }: DetailFieldProps) {
  return (
    <div className="min-w-0">
      <span className="text-muted-foreground">{label}: </span>
      <span
        className={cn(
          'text-foreground',
          mono && 'font-mono text-[11px]',
          error && 'text-destructive'
        )}
      >
        {value}
      </span>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function EventFlowPanel() {
  const { deliveries, isLoading, isMutating, error, refetch, retryDelivery } = useEventFlow();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleToggle = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const handleRetry = useCallback(
    async (id: string) => {
      try {
        await retryDelivery(id);
        toast.success('Delivery retried');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to retry delivery');
      }
    },
    [retryDelivery]
  );

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Webhook className="h-10 w-10 text-destructive/30 mb-3" />
        <p className="text-sm text-destructive">{error}</p>
        <button
          onClick={refetch}
          className="mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (isLoading && deliveries.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (deliveries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Webhook className="h-10 w-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">No deliveries recorded</p>
      </div>
    );
  }

  const completedCount = deliveries.filter((d) => d.status === 'completed').length;
  const failedCount = deliveries.filter((d) => d.status === 'failed').length;

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {deliveries.length} deliver{deliveries.length !== 1 ? 'ies' : 'y'}
          </span>
          {completedCount > 0 && (
            <Badge variant="success" size="sm">
              {completedCount} completed
            </Badge>
          )}
          {failedCount > 0 && (
            <Badge variant="error" size="sm">
              {failedCount} failed
            </Badge>
          )}
        </div>
        <button
          onClick={refetch}
          disabled={isLoading}
          className={cn(
            'rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors',
            'disabled:opacity-50'
          )}
          aria-label="Refresh deliveries"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
        </button>
      </div>

      {/* Delivery list */}
      <div className="border border-border/50 rounded-md overflow-hidden">
        {deliveries.map((delivery) => (
          <DeliveryRow
            key={delivery.deliveryId}
            delivery={delivery}
            isExpanded={expandedId === delivery.deliveryId}
            onToggle={() => handleToggle(delivery.deliveryId)}
            onRetry={handleRetry}
            isMutating={isMutating}
          />
        ))}
      </div>
    </div>
  );
}
