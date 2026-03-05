import { useState, useEffect } from 'react';
import { useAppStore, type Feature } from '@/store/app-store';
import { useChatStore } from '@/store/chat-store';
import { useIsMobile } from '@/hooks/use-media-query';
import { useRunningAgentsCount } from '@/hooks/queries/use-running-agents';
import { isElectron, getOverlayAPI } from '@/lib/electron';
import { Bot, ListTodo, Activity, GitPullRequest, Terminal, MessageCircle } from 'lucide-react';

export function BottomPanel() {
  const isMobile = useIsMobile();
  const bottomPanelOpen = useAppStore((s) => s.bottomPanelOpen);
  const toggleBottomPanel = useAppStore((s) => s.toggleBottomPanel);
  const features = useAppStore((s) => s.features);
  const avaChat = useAppStore((s) => s.featureFlags.avaChat);
  const chatModalOpen = useChatStore((s) => s.chatModalOpen);
  const setChatModalOpen = useChatStore((s) => s.setChatModalOpen);
  const { data: agentCount } = useRunningAgentsCount();

  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1_000);
    return () => clearInterval(id);
  }, []);

  if (isMobile) return null;

  const backlog = features.filter((f: Feature) => (f.status as string) === 'backlog').length;
  const inProgress = features.filter(
    (f: Feature) => (f.status as string) === 'in_progress' || (f.status as string) === 'running'
  ).length;
  const review = features.filter((f: Feature) => (f.status as string) === 'review').length;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={toggleBottomPanel}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleBottomPanel();
        }
      }}
      className="h-8 border-t border-border bg-card/80 backdrop-blur flex items-center px-3 gap-4 cursor-pointer hover:bg-muted/50 transition-colors select-none shrink-0"
    >
      {/* Stats */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Bot className="h-3.5 w-3.5" />
          <span className={agentCount > 0 ? 'text-blue-500 font-medium' : ''}>{agentCount}</span>
        </span>
        <span className="flex items-center gap-1">
          <ListTodo className="h-3.5 w-3.5" />
          <span>{backlog}</span>
        </span>
        <span className="flex items-center gap-1">
          <Activity className="h-3.5 w-3.5" />
          <span className={inProgress > 0 ? 'text-green-500 font-medium' : ''}>{inProgress}</span>
        </span>
        <span className="flex items-center gap-1">
          <GitPullRequest className="h-3.5 w-3.5" />
          <span>{review}</span>
        </span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Clock */}
      <span
        className="relative group text-xs tabular-nums text-muted-foreground cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
        <span className="absolute bottom-full right-0 mb-2 px-2.5 py-1.5 rounded-lg bg-popover text-popover-foreground text-xs font-medium border border-border shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-150 whitespace-nowrap pointer-events-none tabular-nums">
          <span className="font-semibold">
            {time.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
          <span className="mx-1 text-muted-foreground/50">|</span>
          {time.toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
          })}
        </span>
      </span>

      {/* Ava Chat toggle */}
      {avaChat && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (isElectron()) {
              getOverlayAPI()?.toggleOverlay?.();
            } else {
              setChatModalOpen(!chatModalOpen);
            }
          }}
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          title="Open Ava Chat"
        >
          <MessageCircle className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Terminal toggle */}
      <Terminal
        className={`h-3.5 w-3.5 ${bottomPanelOpen ? 'text-foreground' : 'text-muted-foreground'}`}
      />
    </div>
  );
}
