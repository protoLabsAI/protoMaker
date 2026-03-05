import { useState, useEffect } from 'react';
import { useAppStore } from '@/store/app-store';
import { useChatStore } from '@/store/chat-store';
import { useIsMobile } from '@/hooks/use-media-query';
import { useProjectHealth } from '@/hooks/use-project-health';
import { useSystemHealth } from '@/hooks/queries/use-metrics';
import { isElectron, getOverlayAPI } from '@/lib/electron';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@protolabsai/ui/atoms';
import {
  Bot,
  ListTodo,
  Activity,
  GitPullRequest,
  CheckCircle2,
  Terminal,
  MessageCircle,
  HeartPulse,
} from 'lucide-react';

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

interface StatItemProps {
  icon: React.ComponentType<{ className?: string }>;
  value: number;
  highlight?: boolean;
  highlightColor?: string;
  tooltip: React.ReactNode;
}

function StatItem({
  icon: Icon,
  value,
  highlight,
  highlightColor = 'text-blue-500',
  tooltip,
}: StatItemProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button className="flex items-center gap-1 cursor-default bg-transparent border-none p-0 focus:outline-none">
          <Icon className="h-3.5 w-3.5" />
          <span className={highlight && value > 0 ? `${highlightColor} font-medium` : ''}>
            {value}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs max-w-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

export function BottomPanel() {
  const isMobile = useIsMobile();
  const bottomPanelOpen = useAppStore((s) => s.bottomPanelOpen);
  const toggleBottomPanel = useAppStore((s) => s.toggleBottomPanel);
  const projectPath = useAppStore((s) => s.currentProject?.path);
  const avaChat = useAppStore((s) => s.featureFlags.avaChat);
  const chatModalOpen = useChatStore((s) => s.chatModalOpen);
  const setChatModalOpen = useChatStore((s) => s.setChatModalOpen);
  const {
    boardCounts,
    runningAgentsCount: agentCount,
    autoModeStatus,
  } = useProjectHealth(projectPath);
  const { data: systemHealth } = useSystemHealth(projectPath);

  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1_000);
    return () => clearInterval(id);
  }, []);

  if (isMobile) return null;

  const { backlog, inProgress, review, done } = boardCounts;

  // Derive system health status
  const memPercent = systemHealth?.memory?.usedPercent ?? 0;
  const cpuPercent = systemHealth?.cpu?.loadPercent ?? 0;
  const heapPercent = systemHealth?.heap?.percentage ?? 0;
  const uptime = systemHealth?.uptime ?? 0;

  const peakPercent = Math.max(memPercent, cpuPercent, heapPercent);

  let systemStatus: 'ok' | 'warn' | 'error' = 'ok';
  if (peakPercent > 90) systemStatus = 'error';
  else if (peakPercent > 75) systemStatus = 'warn';

  const systemStatusColor = {
    ok: 'text-emerald-500',
    warn: 'text-yellow-500',
    error: 'text-red-500',
  }[systemStatus];

  return (
    <TooltipProvider delayDuration={300}>
      <div className="h-8 border-t border-border bg-card/80 backdrop-blur flex items-center px-3 gap-4 select-none shrink-0">
        {/* Stats */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <StatItem
            icon={Bot}
            value={agentCount}
            highlight
            tooltip={
              <div className="space-y-1">
                <p className="font-medium">Agents: {agentCount} running</p>
                <p>
                  Auto-mode:{' '}
                  <span
                    className={cn(
                      autoModeStatus === 'running'
                        ? 'text-emerald-400'
                        : autoModeStatus === 'idle'
                          ? 'text-yellow-400'
                          : 'text-muted-foreground'
                    )}
                  >
                    {autoModeStatus}
                  </span>
                </p>
              </div>
            }
          />
          <StatItem
            icon={ListTodo}
            value={backlog}
            tooltip={
              <p>
                <span className="font-medium">{backlog}</span> features in backlog
              </p>
            }
          />
          <StatItem
            icon={Activity}
            value={inProgress}
            highlight
            highlightColor="text-green-500"
            tooltip={
              <p>
                <span className="font-medium">{inProgress}</span> features in progress
              </p>
            }
          />
          <StatItem
            icon={GitPullRequest}
            value={review}
            highlight
            highlightColor="text-purple-500"
            tooltip={
              <p>
                <span className="font-medium">{review}</span> features in review (PR open)
              </p>
            }
          />
          <StatItem
            icon={CheckCircle2}
            value={done}
            tooltip={
              <p>
                <span className="font-medium">{done}</span> features completed
              </p>
            }
          />

          {/* System health indicator */}
          <div className="h-4 w-px bg-border" />
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={cn(
                  'flex items-center gap-1 cursor-default bg-transparent border-none p-0 focus:outline-none',
                  systemStatusColor
                )}
              >
                <HeartPulse className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {systemHealth ? (
                <div className="space-y-1.5 min-w-[180px]">
                  <p className="font-medium border-b border-border pb-1">System Health</p>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Memory</span>
                    <span
                      className={
                        memPercent > 90 ? 'text-red-400' : memPercent > 75 ? 'text-yellow-400' : ''
                      }
                    >
                      {memPercent.toFixed(0)}%{' '}
                      <span className="text-muted-foreground/70">
                        ({formatBytes(systemHealth.memory.systemUsed)})
                      </span>
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">CPU</span>
                    <span
                      className={
                        cpuPercent > 90 ? 'text-red-400' : cpuPercent > 75 ? 'text-yellow-400' : ''
                      }
                    >
                      {cpuPercent.toFixed(0)}%{' '}
                      <span className="text-muted-foreground/70">
                        ({systemHealth.cpu.cores} cores)
                      </span>
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Heap</span>
                    <span
                      className={
                        heapPercent > 90
                          ? 'text-red-400'
                          : heapPercent > 75
                            ? 'text-yellow-400'
                            : ''
                      }
                    >
                      {formatBytes(systemHealth.heap.used)} / {formatBytes(systemHealth.heap.total)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Uptime</span>
                    <span>{formatUptime(uptime)}</span>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">Loading system health...</p>
              )}
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Clock */}
        <span className="relative group text-xs tabular-nums text-muted-foreground cursor-default">
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
        <button
          onClick={toggleBottomPanel}
          className="p-1 rounded-md hover:bg-muted/50 transition-colors"
          title="Toggle Terminal"
        >
          <Terminal
            className={`h-3.5 w-3.5 ${bottomPanelOpen ? 'text-foreground' : 'text-muted-foreground'}`}
          />
        </button>
      </div>
    </TooltipProvider>
  );
}
