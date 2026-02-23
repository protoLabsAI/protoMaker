/**
 * Actionable Items Inbox - Unified inbox popover for all user attention items.
 *
 * Renders HITL forms, approvals, notifications, escalations, and gates
 * as a single prioritized list with snooze/dismiss/act capabilities.
 */

import { useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
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
} from 'lucide-react';
import { useActionableItemsStore } from '@/store/actionable-items-store';
import { useHITLFormStore } from '@/store/hitl-form-store';
import { useLoadActionableItems, useActionableItemEvents } from '@/hooks/use-actionable-items';
import { getHttpApiClient } from '@/lib/http-api-client';
import { Button } from '@protolabs/ui/atoms';
import { Popover, PopoverContent, PopoverTrigger } from '@protolabs/ui/atoms';
import type {
  ActionableItem,
  ActionableItemActionType,
  ActionableItemPriority,
} from '@automaker/types';
import { getEffectivePriority } from '@automaker/types';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

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

function getPriorityIndicator(priority: ActionableItemPriority) {
  switch (priority) {
    case 'urgent':
      return <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />;
    case 'high':
      return <span className="h-2 w-2 rounded-full bg-orange-500" />;
    case 'medium':
      return <span className="h-2 w-2 rounded-full bg-yellow-500" />;
    default:
      return null;
  }
}

interface ActionableItemsInboxProps {
  projectPath: string | null;
}

export function ActionableItemsInbox({ projectPath }: ActionableItemsInboxProps) {
  const { items, unreadCount, isPopoverOpen, setPopoverOpen, markAsRead, dismissItem } =
    useActionableItemsStore();
  const navigate = useNavigate();

  useLoadActionableItems(projectPath);
  useActionableItemEvents(projectPath);

  const handleMarkAsRead = useCallback(
    async (itemId: string) => {
      if (!projectPath) return;
      markAsRead(itemId);
      const api = getHttpApiClient();
      await api.actionableItems.markRead(projectPath, itemId);
    },
    [projectPath, markAsRead]
  );

  const handleDismiss = useCallback(
    async (itemId: string) => {
      if (!projectPath) return;
      dismissItem(itemId);
      const api = getHttpApiClient();
      await api.actionableItems.dismiss(projectPath, itemId);
    },
    [projectPath, dismissItem]
  );

  const openForm = useHITLFormStore((s) => s.openForm);

  const handleItemClick = useCallback(
    async (item: ActionableItem) => {
      handleMarkAsRead(item.id);

      if (item.actionType === 'hitl_form' && item.actionPayload?.formId) {
        try {
          const api = getHttpApiClient();
          const res = await api.hitlForms.get(item.actionPayload.formId as string);
          if (res.success && res.form) {
            openForm(res.form);
            setPopoverOpen(false);
          } else {
            toast.error('Form not found or expired');
          }
        } catch {
          toast.error('Failed to load form');
        }
      }
      // Future: approval → navigate to feature, escalation → navigate to escalation view
    },
    [handleMarkAsRead, openForm, setPopoverOpen]
  );

  // Show pending items sorted by effective priority
  const pendingItems = items
    .filter((i) => i.status === 'pending' || i.status === 'snoozed')
    .sort((a, b) => {
      const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
      const aPri = priorityOrder[getEffectivePriority(a)] ?? 3;
      const bPri = priorityOrder[getEffectivePriority(b)] ?? 3;
      if (aPri !== bPri) return aPri - bPri;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const recentItems = pendingItems.slice(0, 5);

  if (!projectPath) return null;

  return (
    <Popover open={isPopoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'relative flex items-center justify-center w-8 h-8 rounded-md',
            'hover:bg-accent transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2'
          )}
          title="Inbox"
        >
          <Inbox className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start" side="right">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h4 className="font-medium text-sm">Inbox</h4>
          {pendingItems.length > 0 && (
            <span className="text-xs text-muted-foreground">{pendingItems.length} pending</span>
          )}
        </div>

        {recentItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 px-4">
            <Inbox className="h-8 w-8 text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">All clear</p>
          </div>
        ) : (
          <div className="max-h-[400px] overflow-y-auto">
            {recentItems.map((item) => {
              const effectivePriority = getEffectivePriority(item);
              const isSnoozed = item.status === 'snoozed';

              return (
                <div
                  key={item.id}
                  className={cn(
                    'flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-accent/50 border-b last:border-b-0',
                    !item.read && 'bg-primary/5',
                    effectivePriority === 'urgent' && 'border-l-2 border-l-red-500',
                    effectivePriority === 'high' && 'border-l-2 border-l-orange-500'
                  )}
                  onClick={() => handleItemClick(item)}
                >
                  <div className="flex-shrink-0 mt-0.5">{getActionIcon(item.actionType)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium truncate">{item.title}</p>
                      {!item.read && (
                        <span className="h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
                      )}
                      {getPriorityIndicator(effectivePriority)}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                      {item.message}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-[10px] text-muted-foreground">
                        {formatRelativeTime(new Date(item.createdAt))}
                      </p>
                      {isSnoozed && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                          <Clock className="h-2.5 w-2.5" />
                          snoozed
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground/70">
                        {item.actionType}
                      </span>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDismiss(item.id);
                      }}
                      title="Dismiss"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {pendingItems.length > 5 && (
          <div className="border-t px-4 py-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={() => {
                setPopoverOpen(false);
                navigate({ to: '/inbox' });
              }}
            >
              View all {pendingItems.length} items
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
