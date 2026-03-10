import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '@/store/app-store';
import { useChatStore } from '@/store/chat-store';
import { useIsMobile } from '@/hooks/use-media-query';
import { useProjectHealth } from '@/hooks/use-project-health';
import { useSystemHealth } from '@/hooks/queries/use-metrics';
import { isElectron, getOverlayAPI } from '@/lib/electron';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@protolabsai/ui/atoms';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@protolabsai/ui/atoms';
import {
  Bot,
  ListTodo,
  Activity,
  GitPullRequest,
  CheckCircle2,
  Terminal,
  MessageCircle,
  HeartPulse,
  Server,
  Check,
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
  const recentServerUrls = useAppStore((s) => s.recentServerUrls);
  const recentConnections = useAppStore((s) => s.recentConnections);
  const setServerUrlOverride = useAppStore((s) => s.setServerUrlOverride);
  const instanceName = useAppStore((s) => s.instanceName);
  const peers = useAppStore((s) => s.peers);
  const fetchSelfInstanceId = useAppStore((s) => s.fetchSelfInstanceId);
  const fetchPeers = useAppStore((s) => s.fetchPeers);

  const [serverDropdownOpen, setServerDropdownOpen] = useState(false);
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

  // Online hivemind peers with a known URL (for quick-switch)
  const peerEntries = peers
    .filter((p) => p.identity.status !== 'offline' && p.identity.url)
    .map((p) => ({
      label: p.identity.name ?? p.identity.instanceId,
      url: p.identity.url!,
      role: p.identity.role ?? null,
    }));

  // Recent connections (deduplicated against peer entries)
  const peerUrls = new Set(peerEntries.map((p) => p.url));
  const recentEntries = [
    // Prefer typed recentConnections (new format), fall back to recentServerUrls (legacy)
    ...recentConnections.map((c) => ({
      url: c.url,
      label: getHostname(c.url),
    })),
    ...recentServerUrls
      .filter((url) => !recentConnections.some((c) => c.url === url))
      .map((url) => ({ url, label: getHostname(url) })),
  ].filter((entry) => !peerUrls.has(entry.url));

  const handleSwitchServer = (url: string) => {
    setServerUrlOverride(url);
    setServerDropdownOpen(false);
    // Refresh instance info after a brief delay to let the new URL take effect
    setTimeout(() => {
      fetchSelfInstanceId().catch(() => {});
      fetchPeers().catch(() => {});
    }, 500);
  };

  const handleResetToDefault = () => {
    setServerUrlOverride(null);
    setServerDropdownOpen(false);
    setTimeout(() => {
      fetchSelfInstanceId().catch(() => {});
    }, 500);
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

          {/* Server / instance badge */}
          <div className="h-4 w-px bg-border" />
          <DropdownMenu open={serverDropdownOpen} onOpenChange={setServerDropdownOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <button
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors bg-transparent border-none p-0 focus:outline-none cursor-pointer"
                    aria-label="Switch server connection"
                  >
                    <Server className="h-3.5 w-3.5" />
                    <span className="max-w-[120px] truncate">{displayLabel}</span>
                  </button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                <div className="space-y-1 min-w-[160px]">
                  <p className="font-medium border-b border-border pb-1">Server Connection</p>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">URL</span>
                    <span className="font-mono text-[10px] max-w-[140px] truncate">
                      {currentServerUrl}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <span className="text-emerald-400">connected</span>
                  </div>
                  <p className="text-muted-foreground/70 pt-0.5">Click to switch server</p>
                </div>
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent side="top" align="start" className="w-56 text-xs">
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                Switch Server
              </div>
              <DropdownMenuSeparator />

              {/* Current connection */}
              <DropdownMenuItem
                className="flex items-center gap-2 text-xs"
                onClick={() => {
                  if (serverUrlOverride) handleResetToDefault();
                }}
                disabled={!serverUrlOverride}
              >
                <Check
                  className={cn(
                    'h-3 w-3 shrink-0',
                    serverUrlOverride ? 'opacity-0' : 'text-emerald-500'
                  )}
                />
                <div className="flex flex-col min-w-0">
                  <span className="truncate font-medium">{displayLabel}</span>
                  <span className="text-muted-foreground/70 font-mono text-[10px] truncate">
                    {currentServerUrl}
                  </span>
                </div>
              </DropdownMenuItem>

              {/* Online hivemind peers */}
              {peerEntries.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-1 text-[10px] text-muted-foreground/70">Online peers</div>
                  {peerEntries.map((entry) => {
                    const isCurrent = entry.url === currentServerUrl;
                    return (
                      <DropdownMenuItem
                        key={entry.url}
                        className="flex items-center gap-2 text-xs"
                        onClick={() => !isCurrent && handleSwitchServer(entry.url)}
                        disabled={isCurrent}
                      >
                        <Check
                          className={cn(
                            'h-3 w-3 shrink-0',
                            isCurrent ? 'text-emerald-500' : 'opacity-0'
                          )}
                        />
                        <div className="flex flex-col min-w-0">
                          <span className="truncate font-medium">{entry.label}</span>
                          <span className="text-muted-foreground/70 font-mono text-[10px] truncate">
                            {entry.url}
                          </span>
                        </div>
                        {entry.role && (
                          <span className="ml-auto text-[10px] text-muted-foreground/60 shrink-0">
                            {entry.role}
                          </span>
                        )}
                      </DropdownMenuItem>
                    );
                  })}
                </>
              )}

              {/* Recent connections */}
              {recentEntries.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-1 text-[10px] text-muted-foreground/70">Recent</div>
                  {recentEntries.map((entry) => {
                    const isCurrent = entry.url === currentServerUrl;
                    return (
                      <DropdownMenuItem
                        key={entry.url}
                        className="flex items-center gap-2 text-xs"
                        onClick={() => !isCurrent && handleSwitchServer(entry.url)}
                        disabled={isCurrent}
                      >
                        <Check
                          className={cn(
                            'h-3 w-3 shrink-0',
                            isCurrent ? 'text-emerald-500' : 'opacity-0'
                          )}
                        />
                        <div className="flex flex-col min-w-0">
                          <span className="truncate">{entry.label}</span>
                          <span className="text-muted-foreground/70 font-mono text-[10px] truncate">
                            {entry.url}
                          </span>
                        </div>
                      </DropdownMenuItem>
                    );
                  })}
                </>
              )}

              {peerEntries.length === 0 && recentEntries.length === 0 && (
                <div className="px-2 py-2 text-xs text-muted-foreground/70 text-center">
                  No recent connections
                </div>
              )}

              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-xs text-muted-foreground"
                onClick={() => {
                  setServerDropdownOpen(false);
                  useAppStore.getState().setCurrentView('settings');
                }}
              >
                <Server className="h-3 w-3 mr-2" />
                Manage connections...
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
