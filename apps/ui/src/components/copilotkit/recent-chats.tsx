/**
 * Recent Chats Popover for CopilotKit Sidebar
 *
 * Lists recent conversation threads. Click to restore a thread,
 * or start a new chat.
 */

import { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Plus, Trash2, Clock } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@radix-ui/react-popover';
import { useAppStore } from '@/store/app-store';
import { getServerUrlSync } from '@/lib/http-api-client';

interface ThreadMetadata {
  id: string;
  title: string;
  agentName?: string;
  projectPath?: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

interface RecentChatsProps {
  onSelectThread?: (threadId: string) => void;
  onNewChat?: () => void;
}

export function RecentChats({ onSelectThread, onNewChat }: RecentChatsProps) {
  const [threads, setThreads] = useState<ThreadMetadata[]>([]);
  const [open, setOpen] = useState(false);
  const currentProject = useAppStore((s) => s.currentProject);

  const fetchThreads = useCallback(async () => {
    try {
      const serverUrl = getServerUrlSync();
      const params = currentProject?.path
        ? `?projectPath=${encodeURIComponent(currentProject.path)}`
        : '';
      const response = await fetch(`${serverUrl}/api/copilotkit/threads${params}`, {
        credentials: 'include',
      });
      if (response.ok) {
        const result = await response.json();
        if (result?.threads) {
          setThreads(result.threads);
        }
      }
    } catch {
      // Threads are optional — silently fail
    }
  }, [currentProject?.path]);

  useEffect(() => {
    if (open) {
      fetchThreads();
    }
  }, [open, fetchThreads]);

  const handleDelete = async (threadId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const serverUrl = getServerUrlSync();
      await fetch(`${serverUrl}/api/copilotkit/threads/${threadId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      setThreads((prev) => prev.filter((t) => t.id !== threadId));
    } catch {
      // Silently fail
    }
  };

  const formatTime = (iso: string) => {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="p-1.5 rounded-md hover:bg-muted transition-colors" title="Recent chats">
          <Clock className="w-4 h-4 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-2 bg-popover border border-border rounded-lg shadow-lg z-50"
        side="bottom"
        align="end"
        sideOffset={8}
      >
        <div className="flex items-center justify-between px-2 py-1.5 mb-1">
          <span className="text-sm font-medium text-foreground">Recent Chats</span>
          <button
            onClick={() => {
              onNewChat?.();
              setOpen(false);
            }}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <Plus className="w-3 h-3" />
            New
          </button>
        </div>

        <div className="max-h-64 overflow-y-auto">
          {threads.length === 0 ? (
            <div className="px-2 py-4 text-center text-sm text-muted-foreground">
              No recent chats
            </div>
          ) : (
            threads.map((thread) => (
              <button
                key={thread.id}
                onClick={() => {
                  onSelectThread?.(thread.id);
                  setOpen(false);
                }}
                className="w-full flex items-start gap-2 px-2 py-2 rounded-md hover:bg-muted transition-colors text-left group"
              >
                <MessageSquare className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">{thread.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatTime(thread.updatedAt)}
                    {thread.messageCount > 0 && ` · ${thread.messageCount} messages`}
                  </div>
                </div>
                <button
                  onClick={(e) => handleDelete(thread.id, e)}
                  className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 transition-all"
                  title="Delete thread"
                >
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </button>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
