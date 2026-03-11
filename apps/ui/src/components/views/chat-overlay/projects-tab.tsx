/**
 * ProjectsTab — Project-scoped PM chat within the Ava overlay.
 *
 * Shows a project selector to toggle between PM agents for all active projects
 * (researching through complete). Each project gets its own persistent chat
 * history using the same session management as Ask Ava.
 *
 * Uses ChatMessageList + ChatInput for rich message rendering (markdown, tool
 * cards, code blocks, reasoning parts).
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { FolderOpen, History, SquarePen, ChevronDown } from 'lucide-react';
import type { UIMessage } from 'ai';
import { ChatMessageList, ChatInput, PromptInputProvider } from '@protolabsai/ui/ai';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@protolabsai/ui/atoms';
import { Button } from '@protolabsai/ui/atoms';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import { useAvaChannelStore } from '@/store/ava-channel-store';
import { useQuery } from '@tanstack/react-query';
import { getHttpApiClient } from '@/lib/http-api-client';
import { usePmChatSession } from '@/hooks/use-pm-chat-session';
import { ConversationList } from './conversation-list';
// Side-effect import: registers tool result cards
import '@/components/views/chat-overlay/inline-form-card';

// ── Active project statuses (researching through complete) ──────────────────

const ACTIVE_STATUSES = new Set([
  'researching',
  'drafting',
  'reviewing',
  'approved',
  'scaffolded',
  'active',
  'ongoing',
  'completed',
]);

interface ProjectSummary {
  slug: string;
  title: string;
  status: string;
}

// ── Project chat content ────────────────────────────────────────────────────

function ProjectChat({
  projectPath,
  projectSlug,
  projectTitle,
}: {
  projectPath: string;
  projectSlug: string;
  projectTitle: string;
}) {
  const {
    messages,
    sendMessage,
    stop,
    isStreaming,
    error,
    sessions,
    activeSessionId,
    handleNewChat,
    handleSwitchSession,
    handleDeleteSession,
  } = usePmChatSession({ projectPath, projectSlug });

  const [historyOpen, setHistoryOpen] = useState(false);

  const handleSubmit = useCallback(
    (text: string) => {
      if (!text.trim() || isStreaming) return;
      sendMessage({ text });
    },
    [isStreaming, sendMessage]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b border-border/40 px-2 py-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => setHistoryOpen((v) => !v)}
          title="Chat history"
          aria-label="Toggle chat history"
        >
          <History className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={handleNewChat}
          title="New chat"
          aria-label="New chat"
        >
          <SquarePen className="size-3.5" />
        </Button>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {sessions.length} session{sessions.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Error banner */}
      {error && (
        <div className="shrink-0 px-3 py-2 text-xs text-destructive bg-destructive/10 border-b border-destructive/20">
          {error.message || 'An error occurred'}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Conversation history panel */}
        {historyOpen && (
          <ConversationList
            sessions={sessions}
            currentSessionId={activeSessionId}
            onSelect={(id) => {
              handleSwitchSession(id);
              setHistoryOpen(false);
            }}
            onNew={() => {
              handleNewChat();
              setHistoryOpen(false);
            }}
            onDelete={handleDeleteSession}
            onClose={() => setHistoryOpen(false)}
            className="animate-in slide-in-from-left duration-200"
          />
        )}

        {/* Chat area */}
        <div className={cn('flex min-w-0 flex-1 flex-col', historyOpen && 'hidden sm:flex')}>
          <ChatMessageList
            messages={messages as UIMessage[]}
            emptyMessage={`Ask anything about ${projectTitle}...`}
            isStreaming={isStreaming}
          />

          <PromptInputProvider>
            <ChatInput
              onSubmit={handleSubmit}
              onStop={stop}
              isStreaming={isStreaming}
              placeholder={`Message about ${projectTitle}...`}
              actions={
                <span className="text-xs text-muted-foreground">
                  {isStreaming ? 'Streaming...' : 'Enter to send'}
                </span>
              }
            />
          </PromptInputProvider>
        </div>
      </div>
    </div>
  );
}

// ── Main tab component ──────────────────────────────────────────────────────

export function ProjectsTab() {
  const projectPath = useAppStore((s) => s.currentProject?.path) ?? '';

  // Fetch project slugs
  const { data: listData } = useQuery({
    queryKey: ['projects-list', projectPath],
    queryFn: async () => {
      const api = getHttpApiClient();
      return api.lifecycle.listProjects(projectPath);
    },
    enabled: !!projectPath,
    staleTime: 30_000,
  });

  // Fetch details for each project
  const { data: projects } = useQuery({
    queryKey: ['projects-details-for-chat', projectPath, listData?.projects],
    queryFn: async () => {
      if (!listData?.projects) return [];
      const api = getHttpApiClient();
      const results = await Promise.all(
        listData.projects.map(async (slug) => {
          try {
            const res = await api.lifecycle.getProject(projectPath, slug);
            if (res.success && res.project) {
              return {
                slug: res.project.slug,
                title: res.project.title,
                status: res.project.status ?? 'active',
              } as ProjectSummary;
            }
          } catch {
            // Skip failed fetches
          }
          return null;
        })
      );
      return results.filter((p): p is ProjectSummary => p !== null);
    },
    enabled: !!listData?.projects?.length,
    staleTime: 30_000,
  });

  // Filter to active projects only
  const activeProjects = useMemo(
    () => (projects ?? []).filter((p) => ACTIVE_STATUSES.has(p.status)),
    [projects]
  );

  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const pendingProjectSlug = useAvaChannelStore((s) => s.pendingProjectSlug);
  const setPendingProjectSlug = useAvaChannelStore((s) => s.setPendingProjectSlug);

  // Consume pending project slug from external navigation (e.g. project header PM button)
  useEffect(() => {
    if (pendingProjectSlug && activeProjects.length > 0) {
      const match = activeProjects.find((p) => p.slug === pendingProjectSlug);
      if (match) {
        setSelectedSlug(match.slug);
      }
      setPendingProjectSlug(null);
    }
  }, [pendingProjectSlug, activeProjects, setPendingProjectSlug]);

  // Auto-select first project when list loads (skip if a pending slug is waiting)
  useEffect(() => {
    if (!selectedSlug && !pendingProjectSlug && activeProjects.length > 0) {
      setSelectedSlug(activeProjects[0].slug);
    }
  }, [activeProjects, selectedSlug, pendingProjectSlug]);

  const selectedProject = activeProjects.find((p) => p.slug === selectedSlug);

  // ── No project path ────────────────────────────────────────────────────────
  if (!projectPath) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="text-xs text-muted-foreground">Open a project to chat with the PM.</p>
      </div>
    );
  }

  // ── No active projects ─────────────────────────────────────────────────────
  if (activeProjects.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="size-8 rounded-full bg-muted flex items-center justify-center">
          <FolderOpen className="size-4 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">No active projects</p>
          <p className="text-xs text-muted-foreground max-w-[240px]">
            Create a project to start chatting with the project manager.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Project selector */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border/40">
        <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
        <Select value={selectedSlug ?? ''} onValueChange={setSelectedSlug}>
          <SelectTrigger className="h-7 flex-1 text-xs">
            <SelectValue placeholder="Select a project..." />
          </SelectTrigger>
          <SelectContent>
            {activeProjects.map((p) => (
              <SelectItem key={p.slug} value={p.slug} className="text-xs">
                <span className="flex items-center gap-2">
                  <span className="truncate">{p.title}</span>
                  <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">
                    {p.status}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Chat content — keyed by slug so state resets on project switch */}
      {selectedProject && projectPath && (
        <ProjectChat
          key={selectedProject.slug}
          projectPath={projectPath}
          projectSlug={selectedProject.slug}
          projectTitle={selectedProject.title}
        />
      )}
    </div>
  );
}
