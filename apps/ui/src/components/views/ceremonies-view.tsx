/**
 * Ceremonies View — Full-page ceremony audit log with delivery status tracking.
 *
 * Shows ceremony events (standups, retros, kickoffs, etc.) with their Discord
 * delivery status. Subscribes to live ceremony:fired WebSocket events.
 */

import { useMemo, useState } from 'react';
import { useAppStore } from '@/store/app-store';
import { useCeremonyStore } from '@/store/ceremony-store';
import { useLoadCeremonyEntries, useCeremonyEventStream } from '@/hooks/use-ceremony-events';
import { Spinner } from '@protolabs-ai/ui/atoms';
import {
  PartyPopper,
  Megaphone,
  Flag,
  Rocket,
  FileText,
  Trophy,
  CheckCircle,
  XCircle,
  Clock,
  SkipForward,
  Filter,
} from 'lucide-react';
import type { CeremonyAuditEntry, CeremonyAuditType } from '@protolabs-ai/types';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

type TypeFilter = 'all' | CeremonyAuditType;
type StatusFilter = 'all' | 'pending' | 'delivered' | 'failed' | 'skipped';

// ============================================================================
// Constants
// ============================================================================

const TYPE_TABS: { value: TypeFilter; label: string; icon: React.ReactNode }[] = [
  { value: 'all', label: 'All', icon: <PartyPopper className="h-3.5 w-3.5" /> },
  { value: 'epic_kickoff', label: 'Kickoffs', icon: <Rocket className="h-3.5 w-3.5" /> },
  { value: 'standup', label: 'Standups', icon: <Megaphone className="h-3.5 w-3.5" /> },
  { value: 'milestone_retro', label: 'Retros', icon: <Flag className="h-3.5 w-3.5" /> },
  { value: 'epic_delivery', label: 'Deliveries', icon: <Trophy className="h-3.5 w-3.5" /> },
  { value: 'content_brief', label: 'Briefs', icon: <FileText className="h-3.5 w-3.5" /> },
  { value: 'project_retro', label: 'Project', icon: <PartyPopper className="h-3.5 w-3.5" /> },
];

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'pending', label: 'Pending' },
  { value: 'failed', label: 'Failed' },
  { value: 'skipped', label: 'Skipped' },
];

// ============================================================================
// Helpers
// ============================================================================

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

function getCeremonyIcon(type: CeremonyAuditType) {
  switch (type) {
    case 'epic_kickoff':
      return <Rocket className="h-4 w-4 text-blue-500" />;
    case 'standup':
      return <Megaphone className="h-4 w-4 text-green-500" />;
    case 'milestone_retro':
      return <Flag className="h-4 w-4 text-purple-500" />;
    case 'epic_delivery':
      return <Trophy className="h-4 w-4 text-yellow-500" />;
    case 'content_brief':
      return <FileText className="h-4 w-4 text-orange-500" />;
    case 'project_retro':
      return <PartyPopper className="h-4 w-4 text-pink-500" />;
    default:
      return <PartyPopper className="h-4 w-4 text-muted-foreground" />;
  }
}

function getCeremonyLabel(type: CeremonyAuditType): string {
  switch (type) {
    case 'epic_kickoff':
      return 'Epic Kickoff';
    case 'standup':
      return 'Standup';
    case 'milestone_retro':
      return 'Milestone Retro';
    case 'epic_delivery':
      return 'Epic Delivery';
    case 'content_brief':
      return 'Content Brief';
    case 'project_retro':
      return 'Project Retro';
    default:
      return type;
  }
}

function getDeliveryBadge(status: CeremonyAuditEntry['deliveryStatus']) {
  switch (status) {
    case 'delivered':
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-green-500/20 bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-500">
          <CheckCircle className="h-3 w-3" />
          Delivered
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-red-500/20 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-500">
          <XCircle className="h-3 w-3" />
          Failed
        </span>
      );
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/20 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-500">
          <Clock className="h-3 w-3" />
          Pending
        </span>
      );
    case 'skipped':
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          <SkipForward className="h-3 w-3" />
          Skipped
        </span>
      );
  }
}

// ============================================================================
// Component
// ============================================================================

export function CeremoniesView() {
  const { currentProject } = useAppStore();
  const projectPath = currentProject?.path ?? null;
  const { entries, isLoading, unreadCount, markAllRead } = useCeremonyStore();

  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Load historical entries + subscribe to live events
  useLoadCeremonyEntries(projectPath);
  useCeremonyEventStream(projectPath);

  const filteredEntries = useMemo(() => {
    let filtered = entries;

    if (typeFilter !== 'all') {
      filtered = filtered.filter((e) => e.ceremonyType === typeFilter);
    }
    if (statusFilter !== 'all') {
      filtered = filtered.filter((e) => e.deliveryStatus === statusFilter);
    }

    // Already sorted newest-first from API
    return filtered;
  }, [entries, typeFilter, statusFilter]);

  // Counts per type for badges
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: entries.length };
    for (const entry of entries) {
      counts[entry.ceremonyType] = (counts[entry.ceremonyType] ?? 0) + 1;
    }
    return counts;
  }, [entries]);

  if (!projectPath) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <PartyPopper className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <p className="text-muted-foreground">Select a project to view ceremonies</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <PartyPopper className="h-5 w-5" />
          <h1 className="text-lg font-semibold">Ceremonies</h1>
          {unreadCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Mark all read
          </button>
        )}
      </div>

      {/* Type filter tabs */}
      <div className="flex items-center gap-1 px-6 py-2 border-b overflow-x-auto">
        {TYPE_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setTypeFilter(tab.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap',
              typeFilter === tab.value
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            {tab.icon}
            {tab.label}
            {(typeCounts[tab.value] ?? 0) > 0 && (
              <span
                className={cn(
                  'ml-0.5 rounded-full px-1.5 py-0 text-[10px]',
                  typeFilter === tab.value
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {typeCounts[tab.value]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Status filter */}
      <div className="flex items-center gap-1 px-6 py-2 border-b">
        <Filter className="h-3.5 w-3.5 text-muted-foreground mr-1" />
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={cn(
              'rounded-md px-2 py-1 text-xs font-medium transition-colors',
              statusFilter === tab.value
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Entries list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner className="h-6 w-6" />
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <PartyPopper className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              {entries.length === 0
                ? 'No ceremonies have fired yet'
                : 'No ceremonies match your filters'}
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {filteredEntries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-4 px-6 py-4 hover:bg-accent/50 transition-colors"
              >
                <div className="flex-shrink-0 mt-1">{getCeremonyIcon(entry.ceremonyType)}</div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-medium truncate">{entry.payload.title}</p>
                    {getDeliveryBadge(entry.deliveryStatus)}
                  </div>
                  {entry.payload.summary && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {entry.payload.summary}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-[11px] text-muted-foreground">
                      {formatRelativeTime(new Date(entry.timestamp))}
                    </span>
                    <span className="text-[11px] text-muted-foreground/60">
                      {getCeremonyLabel(entry.ceremonyType)}
                    </span>
                    {entry.milestoneSlug && (
                      <span className="text-[11px] text-muted-foreground/60">
                        {entry.milestoneSlug}
                      </span>
                    )}
                    {entry.errorMessage && (
                      <span className="text-[11px] text-red-500 truncate max-w-[200px]">
                        {entry.errorMessage}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
