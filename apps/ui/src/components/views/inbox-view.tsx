/**
 * Inbox View - Full page view for unified actionable items.
 *
 * Displays HITL forms, approvals, notifications, escalations, pipeline gates,
 * and ceremony audit log with category filtering, status tabs, snooze, and bulk actions.
 */

import { useCallback, useMemo, useState } from 'react';
import { useAppStore } from '@/store/app-store';
import { useActionableItemsStore } from '@/store/actionable-items-store';
import { useHITLFormStore } from '@/store/hitl-form-store';
import { useCeremonyStore } from '@/store/ceremony-store';
import { useLoadActionableItems, useActionableItemEvents } from '@/hooks/use-actionable-items';
import { useLoadCeremonyEntries, useCeremonyEventStream } from '@/hooks/use-ceremony-events';
import { getHttpApiClient } from '@/lib/http-api-client';
import { Button } from '@protolabs-ai/ui/atoms';
import { Spinner } from '@protolabs-ai/ui/atoms';
import {
  Inbox,
  FileText,
  ShieldCheck,
  AlertTriangle,
  Bell,
  Clock,
  Trash2,
  CheckCircle,
  CircleDot,
  BellOff,
  Filter,
  X,
  PartyPopper,
  CalendarCheck,
  BarChart2,
  Trophy,
  CheckCircle2,
  XCircle,
  HelpCircle,
} from 'lucide-react';
import type {
  ActionableItem,
  ActionableItemActionType,
  ActionableItemPriority,
  CeremonyAuditEntry,
} from '@protolabs-ai/types';
import type { Feature } from '@/store/types';
import { getEffectivePriority } from '@protolabs-ai/types';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type CategoryFilter =
  | 'all'
  | 'hitl_form'
  | 'approval'
  | 'notification'
  | 'escalation'
  | 'gate'
  | 'review'
  | 'ceremony';
type StatusFilter = 'pending' | 'snoozed' | 'acted' | 'dismissed' | 'all';

const CATEGORY_TABS: { value: CategoryFilter; label: string; icon: React.ReactNode }[] = [
  { value: 'all', label: 'All', icon: <Inbox className="h-3.5 w-3.5" /> },
  { value: 'hitl_form', label: 'Forms', icon: <FileText className="h-3.5 w-3.5" /> },
  { value: 'approval', label: 'Approvals', icon: <ShieldCheck className="h-3.5 w-3.5" /> },
  { value: 'notification', label: 'Notifications', icon: <Bell className="h-3.5 w-3.5" /> },
  { value: 'escalation', label: 'Escalations', icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  { value: 'gate', label: 'Gates', icon: <CircleDot className="h-3.5 w-3.5" /> },
  { value: 'ceremony', label: 'Ceremonies', icon: <PartyPopper className="h-3.5 w-3.5" /> },
];

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'snoozed', label: 'Snoozed' },
  { value: 'acted', label: 'Acted' },
  { value: 'dismissed', label: 'Dismissed' },
  { value: 'all', label: 'All' },
];

const SNOOZE_OPTIONS = [
  { label: '1 hour', ms: 60 * 60 * 1000 },
  { label: '4 hours', ms: 4 * 60 * 60 * 1000 },
  { label: 'Tomorrow', ms: 24 * 60 * 60 * 1000 },
];

const CEREMONY_META: Record<
  string,
  { label: string; icon: React.ReactNode; color: string; bg: string }
> = {
  standup: {
    label: 'Standup',
    icon: <CalendarCheck className="h-4 w-4" />,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
  },
  retro: {
    label: 'Milestone Retro',
    icon: <BarChart2 className="h-4 w-4" />,
    color: 'text-purple-500',
    bg: 'bg-purple-500/10',
  },
  'project-retro': {
    label: 'Project Retro',
    icon: <Trophy className="h-4 w-4" />,
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
  },
};

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

function getActionIcon(type: ActionableItemActionType) {
  switch (type) {
    case 'hitl_form':
      return <FileText className="h-4 w-4 text-blue-500" />;
    case 'approval':
      return <ShieldCheck className="h-4 w-4 text-yellow-500" />;
    case 'review':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'escalation':
      return <AlertTriangle className="h-4 w-4 text-red-500" />;
    case 'gate':
      return <CircleDot className="h-4 w-4 text-purple-500" />;
    case 'notification':
      return <Bell className="h-4 w-4 text-muted-foreground" />;
    default:
      return <Inbox className="h-4 w-4" />;
  }
}

function getPriorityBadge(priority: ActionableItemPriority) {
  const colors: Record<string, string> = {
    urgent: 'bg-red-500/10 text-red-500 border-red-500/20',
    high: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
    medium: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    low: 'bg-muted text-muted-foreground border-border',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium',
        colors[priority] ?? colors.low
      )}
    >
      {priority}
    </span>
  );
}

function CeremonyDeliveryBadge({ status }: { status: CeremonyAuditEntry['deliveryStatus'] }) {
  const config = {
    pending: {
      icon: <HelpCircle className="h-3 w-3" />,
      label: 'Pending',
      cls: 'text-yellow-500 bg-yellow-500/10',
    },
    success: {
      icon: <CheckCircle2 className="h-3 w-3" />,
      label: 'Delivered',
      cls: 'text-green-500 bg-green-500/10',
    },
    failed: {
      icon: <XCircle className="h-3 w-3" />,
      label: 'Failed',
      cls: 'text-red-500 bg-red-500/10',
    },
  };
  const { icon, label, cls } = config[status] ?? config.pending;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
        cls
      )}
    >
      {icon}
      {label}
    </span>
  );
}

export function InboxView() {
  const { currentProject } = useAppStore();
  const projectPath = currentProject?.path ?? null;
  const { items, isLoading, dismissItem, markAsRead, markAllAsRead, dismissAll } =
    useActionableItemsStore();
  const openForm = useHITLFormStore((s) => s.openForm);
  const {
    entries: ceremonyEntries,
    isLoading: ceremoniesLoading,
    unreadCount: ceremonyUnreadCount,
    markAllRead: markCeremoniesRead,
  } = useCeremonyStore();

  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [snoozeMenuOpen, setSnoozeMenuOpen] = useState<string | null>(null);
  const [approvalItem, setApprovalItem] = useState<ActionableItem | null>(null);
  const [approvalFeature, setApprovalFeature] = useState<Feature | null>(null);
  const [approvalLoading, setApprovalLoading] = useState(false);

  useLoadActionableItems(projectPath);
  useActionableItemEvents(projectPath);
  useLoadCeremonyEntries(projectPath);
  useCeremonyEventStream(projectPath);

  const filteredItems = useMemo(() => {
    let filtered = items;

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((i) => i.status === statusFilter);
    }

    // Category filter
    if (categoryFilter !== 'all' && categoryFilter !== 'ceremony') {
      filtered = filtered.filter((i) => i.actionType === categoryFilter);
    }

    // Hide all actionable items when ceremony tab is active
    if (categoryFilter === 'ceremony') {
      return [];
    }

    // Sort by effective priority then by date
    return filtered.sort((a, b) => {
      const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
      const aPri = priorityOrder[getEffectivePriority(a)] ?? 3;
      const bPri = priorityOrder[getEffectivePriority(b)] ?? 3;
      if (aPri !== bPri) return aPri - bPri;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [items, categoryFilter, statusFilter]);

  // Ceremonies sorted newest-first
  const sortedCeremonies = useMemo(
    () =>
      [...ceremonyEntries].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      ),
    [ceremonyEntries]
  );

  const handleGateAction = useCallback(
    async (e: React.MouseEvent, item: ActionableItem, action: 'advance' | 'reject') => {
      e.stopPropagation();
      if (!projectPath) return;
      const featureId = item.actionPayload?.featureId as string | undefined;
      if (!featureId) return;
      try {
        const api = getHttpApiClient();
        await api.engine.pipelineGateResolve(projectPath, featureId, action);
        useActionableItemsStore.getState().dismissItem(item.id);
        await api.actionableItems.dismiss(projectPath, item.id);
        toast.success(
          action === 'advance'
            ? 'Gate advanced — pipeline continues'
            : 'Gate rejected — feature blocked'
        );
      } catch {
        toast.error('Failed to resolve gate');
      }
    },
    [projectPath]
  );

  const handleItemClick = useCallback(
    async (item: ActionableItem) => {
      if (!projectPath) return;

      markAsRead(item.id);
      const api = getHttpApiClient();
      await api.actionableItems.markRead(projectPath, item.id);

      if (item.actionType === 'approval' && item.actionPayload?.featureId) {
        try {
          setApprovalLoading(true);
          setApprovalItem(item);
          const featureId = item.actionPayload.featureId as string;
          const res = await api.features.get(projectPath, featureId);
          if (res.success && res.feature) {
            setApprovalFeature(res.feature);
          }
        } catch {
          toast.error('Failed to load feature');
          setApprovalItem(null);
        } finally {
          setApprovalLoading(false);
        }
        return;
      }

      if (item.actionType === 'hitl_form' && item.actionPayload?.formId) {
        try {
          const res = await api.hitlForms.get(item.actionPayload.formId as string);
          if (res.success && res.form) {
            openForm(res.form);
          } else {
            toast.error('Form not found or expired');
          }
        } catch {
          toast.error('Failed to load form');
        }
      }
    },
    [projectPath, markAsRead, openForm]
  );

  const handleDismiss = useCallback(
    async (e: React.MouseEvent, itemId: string) => {
      e.stopPropagation();
      if (!projectPath) return;
      dismissItem(itemId);
      const api = getHttpApiClient();
      await api.actionableItems.dismiss(projectPath, itemId);
    },
    [projectPath, dismissItem]
  );

  const handleSnooze = useCallback(
    async (e: React.MouseEvent, itemId: string, durationMs: number) => {
      e.stopPropagation();
      if (!projectPath) return;

      const snoozedUntil = new Date(Date.now() + durationMs).toISOString();
      useActionableItemsStore.getState().snoozeItem(itemId, snoozedUntil);

      const api = getHttpApiClient();
      await api.actionableItems.snooze(projectPath, itemId, snoozedUntil);
      setSnoozeMenuOpen(null);
      toast.success('Item snoozed');
    },
    [projectPath]
  );

  const handleMarkAllRead = useCallback(async () => {
    if (!projectPath) return;
    markAllAsRead();
    markCeremoniesRead();
    const api = getHttpApiClient();
    await api.actionableItems.markRead(projectPath);
  }, [projectPath, markAllAsRead, markCeremoniesRead]);

  const handleDismissAll = useCallback(async () => {
    if (!projectPath) return;
    dismissAll();
    const api = getHttpApiClient();
    await api.actionableItems.dismiss(projectPath);
  }, [projectPath, dismissAll]);

  // Pending counts per category for tab badges
  const pendingCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of items) {
      if (item.status !== 'pending') continue;
      counts[item.actionType] = (counts[item.actionType] ?? 0) + 1;
    }
    counts.all = items.filter((i) => i.status === 'pending').length;
    counts.ceremony = ceremonyUnreadCount;
    return counts;
  }, [items, ceremonyUnreadCount]);

  if (!projectPath) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Inbox className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <p className="text-muted-foreground">Select a project to view inbox</p>
      </div>
    );
  }

  const isCeremonyView = categoryFilter === 'ceremony';

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <Inbox className="h-5 w-5" />
          <h1 className="text-lg font-semibold">Inbox</h1>
          {pendingCounts.all > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
              {pendingCounts.all}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleMarkAllRead}>
            Mark all read
          </Button>
          {!isCeremonyView && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismissAll}
              className="text-destructive"
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Dismiss all
            </Button>
          )}
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex items-center gap-1 px-6 py-2 border-b overflow-x-auto">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setCategoryFilter(tab.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
              categoryFilter === tab.value
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            {tab.icon}
            {tab.label}
            {(pendingCounts[tab.value] ?? 0) > 0 && (
              <span
                className={cn(
                  'ml-0.5 rounded-full px-1.5 py-0 text-[10px]',
                  categoryFilter === tab.value
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {pendingCounts[tab.value]}
              </span>
            )}
          </button>
        ))}
      </div>

      {isCeremonyView ? (
        /* Ceremony view — no status tabs, different list */
        <div className="flex-1 overflow-y-auto">
          {ceremoniesLoading ? (
            <div className="flex items-center justify-center py-16">
              <Spinner className="h-6 w-6" />
            </div>
          ) : sortedCeremonies.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <PartyPopper className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No ceremonies yet</p>
            </div>
          ) : (
            <div className="divide-y">
              {sortedCeremonies.map((entry) => {
                const meta = CEREMONY_META[entry.ceremonyType] ?? CEREMONY_META['standup'];
                return (
                  <div key={entry.id} className="flex items-start gap-4 px-6 py-4">
                    {/* Icon */}
                    <div
                      className={cn(
                        'flex-shrink-0 mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg',
                        meta.bg,
                        meta.color
                      )}
                    >
                      {meta.icon}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-medium truncate">{entry.payload.title}</p>
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                            meta.color,
                            meta.bg
                          )}
                        >
                          {meta.label}
                        </span>
                      </div>
                      {entry.payload.summary && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mb-1.5">
                          {entry.payload.summary}
                        </p>
                      )}
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] text-muted-foreground">
                          {formatRelativeTime(new Date(entry.timestamp))}
                        </span>
                        {entry.milestoneSlug && (
                          <span className="text-[11px] text-muted-foreground/60">
                            {entry.milestoneSlug}
                          </span>
                        )}
                        <CeremonyDeliveryBadge status={entry.deliveryStatus} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Status tabs */}
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

          {/* Items list */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Spinner className="h-6 w-6" />
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <BellOff className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">No items match your filters</p>
              </div>
            ) : (
              <div className="divide-y">
                {filteredItems.map((item) => {
                  const effectivePriority = getEffectivePriority(item);
                  const isSnoozed = item.status === 'snoozed';

                  return (
                    <div
                      key={item.id}
                      className={cn(
                        'flex items-start gap-4 px-6 py-4 cursor-pointer hover:bg-accent/50 transition-colors',
                        !item.read && item.status === 'pending' && 'bg-primary/5',
                        effectivePriority === 'urgent' && 'border-l-2 border-l-red-500',
                        effectivePriority === 'high' && 'border-l-2 border-l-orange-500'
                      )}
                      onClick={() => handleItemClick(item)}
                    >
                      <div className="flex-shrink-0 mt-1">{getActionIcon(item.actionType)}</div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-sm font-medium truncate">{item.title}</p>
                          {!item.read && item.status === 'pending' && (
                            <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                          )}
                          {getPriorityBadge(effectivePriority)}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">{item.message}</p>
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className="text-[11px] text-muted-foreground">
                            {formatRelativeTime(new Date(item.createdAt))}
                          </span>
                          {isSnoozed && item.snoozedUntil && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              until {new Date(item.snoozedUntil).toLocaleString()}
                            </span>
                          )}
                          <span className="text-[11px] text-muted-foreground/60">
                            {item.actionType.replace('_', ' ')}
                          </span>
                          {item.category && (
                            <span className="text-[11px] text-muted-foreground/60">
                              {item.category}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 flex-shrink-0">
                        {/* Gate actions */}
                        {item.actionType === 'gate' && item.status === 'pending' && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs px-2 text-green-600 border-green-600/30 hover:bg-green-600/10"
                              onClick={(e) => handleGateAction(e, item, 'advance')}
                              title="Advance gate"
                            >
                              Advance
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs px-2 text-red-500 border-red-500/30 hover:bg-red-500/10"
                              onClick={(e) => handleGateAction(e, item, 'reject')}
                              title="Reject gate"
                            >
                              Reject
                            </Button>
                          </>
                        )}

                        {/* Snooze */}
                        {item.status === 'pending' && (
                          <div className="relative">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSnoozeMenuOpen(snoozeMenuOpen === item.id ? null : item.id);
                              }}
                              title="Snooze"
                            >
                              <Clock className="h-3.5 w-3.5" />
                            </Button>
                            {snoozeMenuOpen === item.id && (
                              <div className="absolute right-0 top-full mt-1 z-10 bg-popover border rounded-md shadow-md py-1 min-w-[120px]">
                                {SNOOZE_OPTIONS.map((opt) => (
                                  <button
                                    key={opt.label}
                                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors"
                                    onClick={(e) => handleSnooze(e, item.id, opt.ms)}
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Dismiss */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => handleDismiss(e, item.id)}
                          title="Dismiss"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* Approval Preview Dialog */}
      {approvalItem && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => {
            setApprovalItem(null);
            setApprovalFeature(null);
          }}
        >
          <div
            className="bg-background border rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-yellow-500" />
                <h2 className="font-semibold text-sm">Review &amp; Approve</h2>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => {
                  setApprovalItem(null);
                  setApprovalFeature(null);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Feature title */}
            {approvalFeature && (
              <div className="px-6 py-3 border-b shrink-0 bg-muted/30">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
                  Feature
                </p>
                <p className="text-sm font-medium">{approvalFeature.title}</p>
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {approvalLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Spinner className="h-5 w-5" />
                </div>
              ) : approvalFeature?.description ? (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <pre className="whitespace-pre-wrap text-xs leading-relaxed font-sans text-foreground">
                    {approvalFeature.description}
                  </pre>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  {approvalItem.message || 'No additional details available.'}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setApprovalItem(null);
                  setApprovalFeature(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-red-500 border-red-500/30 hover:bg-red-500/10"
                onClick={async () => {
                  if (!projectPath || !approvalItem) return;
                  dismissItem(approvalItem.id);
                  const api = getHttpApiClient();
                  await api.actionableItems.dismiss(projectPath, approvalItem.id);
                  toast.success('Dismissed');
                  setApprovalItem(null);
                  setApprovalFeature(null);
                }}
              >
                Dismiss
              </Button>
              <Button
                size="sm"
                className="bg-primary text-primary-foreground"
                onClick={async () => {
                  if (!projectPath || !approvalItem) return;
                  useActionableItemsStore.getState().dismissItem(approvalItem.id);
                  const api = getHttpApiClient();
                  await api.actionableItems.dismiss(projectPath, approvalItem.id);
                  toast.success('Approved — feature queued for execution');
                  setApprovalItem(null);
                  setApprovalFeature(null);
                }}
              >
                Approve
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
