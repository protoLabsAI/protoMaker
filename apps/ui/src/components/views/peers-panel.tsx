/**
 * PeersPanel — shows all connected instances with status and capacity metrics.
 *
 * Used in the unified board dashboard. Fetches peer data from /api/hivemind/peers
 * on mount and every 30 seconds. Reads instanceFilter from the app store to
 * control cross-instance feature visibility.
 */

import React, { useEffect, useCallback } from 'react';
import { useAppStore } from '@/store/app-store';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@protolabsai/ui/atoms';
import { RefreshCw, Cpu, Database, Users, Wifi, WifiOff, Activity } from 'lucide-react';
import type { HivemindPeer } from '@protolabsai/types';

const PEERS_POLL_INTERVAL_MS = 30_000;

// ─── Status badge ────────────────────────────────────────────────────────────

function getStatusColor(status: string | undefined): string {
  switch (status) {
    case 'online':
      return 'bg-green-500';
    case 'draining':
      return 'bg-yellow-500';
    default:
      return 'bg-zinc-500';
  }
}

// ─── Single peer row ─────────────────────────────────────────────────────────

function PeerRow({ peer, isSelf }: { peer: HivemindPeer; isSelf?: boolean }) {
  const { identity, lastSeen } = peer;
  const status = identity.status ?? 'offline';
  const capacity = identity.capacity;

  const agentLoad =
    capacity && capacity.maxAgents > 0
      ? Math.round((capacity.runningAgents / capacity.maxAgents) * 100)
      : 0;

  const lastSeenLabel = (() => {
    try {
      const diff = Date.now() - new Date(lastSeen).getTime();
      if (diff < 60_000) return 'just now';
      if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
      return `${Math.floor(diff / 3_600_000)}h ago`;
    } catch {
      return lastSeen;
    }
  })();

  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-md border bg-card/60 p-2.5',
        isSelf ? 'border-primary/40 bg-primary/5' : 'border-border/40'
      )}
      data-testid={`peer-row-${identity.instanceId}`}
    >
      {/* Status dot */}
      <div className="mt-1 flex-shrink-0">
        <span
          className={cn('inline-block h-2 w-2 rounded-full', getStatusColor(status))}
          aria-label={status}
        />
      </div>

      {/* Identity */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1 min-w-0">
            <span className="truncate text-xs font-medium text-foreground">
              {identity.instanceId}
            </span>
            {isSelf && (
              <span className="shrink-0 text-[9px] font-bold px-1 py-px rounded bg-primary/20 text-primary border border-primary/30">
                this
              </span>
            )}
          </div>
          <span className="shrink-0 text-[10px] text-muted-foreground">{lastSeenLabel}</span>
        </div>

        {/* Capacity metrics row */}
        {capacity && status !== 'offline' && (
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                    <Activity className="h-2.5 w-2.5" />
                    {capacity.runningAgents}/{capacity.maxAgents}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>
                    Running agents: {capacity.runningAgents} / {capacity.maxAgents} ({agentLoad}%
                    load)
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                    <Database className="h-2.5 w-2.5" />
                    {capacity.ramUsagePercent.toFixed(0)}%
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>RAM usage: {capacity.ramUsagePercent.toFixed(1)}%</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                    <Cpu className="h-2.5 w-2.5" />
                    {capacity.cpuPercent.toFixed(0)}%
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>CPU: {capacity.cpuPercent.toFixed(1)}%</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {typeof capacity.backlogCount === 'number' && capacity.backlogCount > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                <Users className="h-2.5 w-2.5" />
                {capacity.backlogCount} backlog
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── PeersPanel ──────────────────────────────────────────────────────────────

export interface PeersPanelProps {
  className?: string;
}

export function PeersPanel({ className }: PeersPanelProps) {
  const {
    peers,
    selfInstanceId,
    instanceFilter,
    setInstanceFilter,
    fetchPeers,
    fetchSelfInstanceId,
  } = useAppStore(
    useShallow((s) => ({
      peers: s.peers,
      selfInstanceId: s.selfInstanceId,
      instanceFilter: s.instanceFilter,
      setInstanceFilter: s.setInstanceFilter,
      fetchPeers: s.fetchPeers,
      fetchSelfInstanceId: s.fetchSelfInstanceId,
    }))
  );

  const refresh = useCallback(() => {
    fetchPeers();
  }, [fetchPeers]);

  // Fetch self identity once on mount
  useEffect(() => {
    fetchSelfInstanceId();
  }, [fetchSelfInstanceId]);

  // Poll peers on mount and every 30 seconds
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, PEERS_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const onlinePeers = peers.filter((p) => p.identity.status === 'online');
  const offlinePeers = peers.filter((p) => p.identity.status !== 'online');

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {onlinePeers.length > 0 ? (
            <Wifi className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span className="text-xs font-semibold text-foreground">
            Instances
            {peers.length > 0 && (
              <span className="ml-1 text-muted-foreground">({onlinePeers.length} online)</span>
            )}
          </span>
        </div>

        <button
          onClick={refresh}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground"
          aria-label="Refresh peers"
          title="Refresh"
        >
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>

      {/* Instance filter toggle */}
      <div className="flex rounded-md border border-border/40 p-0.5 text-xs">
        <button
          onClick={() => setInstanceFilter('all')}
          className={cn(
            'flex-1 rounded px-2 py-0.5 transition-colors',
            instanceFilter === 'all'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          All
        </button>
        <button
          onClick={() => setInstanceFilter('mine')}
          className={cn(
            'flex-1 rounded px-2 py-0.5 transition-colors',
            instanceFilter === 'mine'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Mine
        </button>
      </div>

      {/* Peer list */}
      {peers.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          No peers detected. Running in single-instance mode.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {onlinePeers.map((peer) => (
            <PeerRow
              key={peer.identity.instanceId}
              peer={peer}
              isSelf={peer.identity.instanceId === selfInstanceId}
            />
          ))}
          {offlinePeers.length > 0 && (
            <>
              {onlinePeers.length > 0 && <div className="my-0.5 border-t border-border/20" />}
              {offlinePeers.map((peer) => (
                <PeerRow
                  key={peer.identity.instanceId}
                  peer={peer}
                  isSelf={peer.identity.instanceId === selfInstanceId}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
