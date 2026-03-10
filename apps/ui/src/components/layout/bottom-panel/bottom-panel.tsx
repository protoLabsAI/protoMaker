import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '@/store/app-store';
import { useChatStore } from '@/store/chat-store';
import { useIsMobile } from '@/hooks/use-media-query';
import { useProjectHealth } from '@/hooks/use-project-health';
import { useSystemHealth } from '@/hooks/queries/use-metrics';
import { isElectron, getOverlayAPI } from '@/lib/electron';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@protolabsai/ui/atoms';
import { Popover, PopoverContent, PopoverTrigger } from '@protolabsai/ui/atoms';
import {
  Bot,
  ListTodo,
  Activity,
  GitPullRequest,
  CheckCircle2,
  Terminal,
  MessageCircle,
  HeartPulse,
  Wifi,
} from 'lucide-react';
import { getServerUrlSync } from '@/lib/http-api-client';

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

function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
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
  const chatModalOpen = useChatStore((s) => s.chatModalOpen);
  const setChatModalOpen = useChatStore((s) => s.setChatModalOpen);
  const {
    boardCounts,
    runningAgentsCount: agentCount,
    autoModeStatus,
  } = useProjectHealth(projectPath);
  const { data: systemHealth } = useSystemHealth(projectPath);

  // Server connection state
  const serverUrlOverride = useAppStore((s) => s.serverUrlOverride);
  const instanceName = useAppStore((s) => s.instanceName);
  const instanceRole = useAppStore((s) => s.instanceRole);
  const peers = useAppStore((s) => s.peers);
  const fetchSelfInstanceId = useAppStore((s) => s.fetchSelfInstanceId);
  const fetchPeers = useAppStore((s) => s.fetchPeers);

  const [tickerPopoverOpen, setTickerPopoverOpen] = useState(false);
  const tickerHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasFetchedRef = useRef(false);

  // Fetch instance info and peers on mount (once)
  useEffect(() => {
    if (!hasFetchedRef.current) {
      hasFetchedRef.current = true;
      fetchSelfInstanceId().catch(() => {});
      fetchPeers().catch(() => {});
    }
  }, [fetchSelfInstanceId, fetchPeers]);

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

  // Derive display label: instanceName > hostname of current URL > 'Server'
  const currentServerUrl = serverUrlOverride ?? getServerUrlSync();
  const displayLabel =
    instanceName ?? (currentServerUrl ? getHostname(currentServerUrl) : 'Server');

  // Peer stats
  const onlinePeers = peers.filter((p) => p.identity.status !== 'offline');
  const totalPeers = peers.length;

  const handleTickerMouseEnter = () => {
    if (tickerHoverTimerRef.current) clearTimeout(tickerHoverTimerRef.current);
    tickerHoverTimerRef.current = setTimeout(() => setTickerPopoverOpen(true), 300);
  };

  const handleTickerMouseLeave = () => {
    if (tickerHoverTimerRef.current) clearTimeout(tickerHoverTimerRef.current);
    setTickerPopoverOpen(false);
  };

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

          {/* Server / instance ticker — hover popover */}
          <div className="h-4 w-px bg-border" />
          <Popover open={tickerPopoverOpen} onOpenChange={setTickerPopoverOpen}>
            <PopoverTrigger asChild>
              <button
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors bg-transparent border-none p-0 focus:outline-none cursor-default"
                aria-label="Instance connection info"
                onMouseEnter={handleTickerMouseEnter}
                onMouseLeave={handleTickerMouseLeave}
              >
                <Wifi className="h-3.5 w-3.5 text-emerald-500" />
                <span className="max-w-[120px] truncate">{displayLabel}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="start"
              sideOffset={6}
              className="w-64 p-3 text-xs"
              onMouseEnter={() => {
                if (tickerHoverTimerRef.current) clearTimeout(tickerHoverTimerRef.current);
                setTickerPopoverOpen(true);
              }}
              onMouseLeave={handleTickerMouseLeave}
            >
              {/* Header: connection status */}
              <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-border">
                <span className="font-medium text-foreground">Connection</span>
                <span className="flex items-center gap-1 text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />
                  connected
                </span>
              </div>

              {/* Instance name & role */}
              <div className="flex items-center justify-between mb-1">
                <span className="text-muted-foreground">Instance</span>
                <span className="font-medium truncate max-w-[130px]">{displayLabel}</span>
              </div>
              {instanceRole && (
                <div className="flex items-center justify-between mb-1">
                  <span className="text-muted-foreground">Role</span>
                  <span className="capitalize text-blue-400">{instanceRole}</span>
                </div>
              )}

              {/* Peer count */}
              <div className="flex items-center justify-between mt-1 mb-2">
                <span className="text-muted-foreground">Peers</span>
                <span>
                  <span className="text-emerald-400 font-medium">{onlinePeers.length}</span>
                  <span className="text-muted-foreground"> / {totalPeers} total</span>
                </span>
              </div>

              {/* Compact peer list */}
              {peers.length > 0 && (
                <div className="space-y-1.5 border-t border-border pt-2">
                  <p className="text-[10px] text-muted-foreground/70 mb-1">Peers</p>
                  {peers.map((peer) => {
                    const { identity } = peer;
                    const isOnline = identity.status !== 'offline';
                    const agentUsage =
                      identity.capacity.maxAgents > 0
                        ? identity.capacity.runningAgents / identity.capacity.maxAgents
                        : 0;
                    return (
                      <div key={identity.instanceId} className="flex items-center gap-2">
                        <span
                          className={cn(
                            'h-1.5 w-1.5 rounded-full shrink-0',
                            isOnline ? 'bg-emerald-500' : 'bg-muted-foreground/40'
                          )}
                        />
                        <span className="truncate flex-1 max-w-[100px]">
                          {identity.name ?? identity.instanceId}
                        </span>
                        {identity.role && (
                          <span className="text-[10px] text-muted-foreground/60 shrink-0">
                            {identity.role}
                          </span>
                        )}
                        {/* Capacity bar: running agents / max agents */}
                        <div className="w-14 h-1 rounded-full bg-muted overflow-hidden shrink-0">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all',
                              agentUsage > 0.85
                                ? 'bg-red-500'
                                : agentUsage > 0.6
                                  ? 'bg-yellow-500'
                                  : 'bg-emerald-500'
                            )}
                            style={{ width: `${Math.min(agentUsage * 100, 100)}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground/70 shrink-0 tabular-nums">
                          {identity.capacity.runningAgents}/{identity.capacity.maxAgents}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Clock */}
        <span className="relative group text-xs tabular-nums text-muted-foreground cursor-default">
          {time.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          })}
          <span className="absolute bottom-full right-0 mb-2 px-2.5 py-1.5 rounded-lg bg-popover text-popover-foreground text-xs font-medium border border-border shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-150 whitespace-nowrap pointer-events-none tabular-nums">
            <span className="font-semibold">
              {time.toLocaleDateString([], {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
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
