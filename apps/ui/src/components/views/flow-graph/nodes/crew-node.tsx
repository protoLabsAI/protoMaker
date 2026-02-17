/**
 * Crew Node — Frank, PR Maintainer, Board Janitor, System Health
 *
 * Shows crew member status with a dot indicator and last check time.
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Server, GitPullRequest, LayoutGrid, HeartPulse, Loader2 } from 'lucide-react';
import type { CrewNodeData } from '../types';
import { cn } from '@/lib/utils';

const CREW_ICONS: Record<string, typeof Server> = {
  'crew-frank': Server,
  'crew-pr-maintainer': GitPullRequest,
  'crew-board-janitor': LayoutGrid,
  'crew-system-health': HeartPulse,
};

function getStatusColor(enabled: boolean, lastSeverity: string | null) {
  if (!enabled) return 'zinc';
  if (!lastSeverity || lastSeverity === 'ok') return 'emerald';
  if (lastSeverity === 'warning') return 'amber';
  return 'red';
}

function formatLastCheck(time: string | null): string {
  if (!time) return 'Never';
  const diff = Date.now() - new Date(time).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ago`;
}

function CrewNodeComponent({ data, id }: NodeProps & { data: CrewNodeData }) {
  const Icon = CREW_ICONS[id] || Server;
  const statusColor = getStatusColor(data.enabled, data.lastSeverity);

  return (
    <div
      className={cn(
        'w-[200px] h-[100px] rounded-xl border backdrop-blur-md bg-card/90',
        statusColor === 'emerald' && 'border-emerald-500/30',
        statusColor === 'amber' && 'border-amber-500/30',
        statusColor === 'red' && 'border-red-500/30',
        statusColor === 'zinc' && 'border-border/50'
      )}
    >
      <div className="p-3.5">
        <div className="flex items-center gap-2.5 mb-2">
          <div
            className={cn(
              'flex items-center justify-center w-7 h-7 rounded-lg',
              statusColor === 'emerald' && 'bg-emerald-500/15 text-emerald-400',
              statusColor === 'amber' && 'bg-amber-500/15 text-amber-400',
              statusColor === 'red' && 'bg-red-500/15 text-red-400',
              statusColor === 'zinc' && 'bg-zinc-500/15 text-zinc-400'
            )}
          >
            {data.isRunning ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Icon className="w-3.5 h-3.5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-xs font-semibold truncate">{data.label}</h4>
            <p className="text-[10px] text-muted-foreground">Crew</p>
          </div>
          {/* Status dot */}
          <span className="relative flex h-2 w-2 shrink-0">
            {data.isRunning && (
              <span
                className={cn(
                  'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75',
                  statusColor === 'emerald' && 'bg-emerald-400',
                  statusColor === 'amber' && 'bg-amber-400',
                  statusColor === 'red' && 'bg-red-400',
                  statusColor === 'zinc' && 'bg-zinc-400'
                )}
              />
            )}
            <span
              className={cn(
                'relative inline-flex h-2 w-2 rounded-full',
                statusColor === 'emerald' && 'bg-emerald-400',
                statusColor === 'amber' && 'bg-amber-400',
                statusColor === 'red' && 'bg-red-400',
                statusColor === 'zinc' && 'bg-zinc-400'
              )}
            />
          </span>
        </div>

        {/* Last check */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{data.enabled ? 'Enabled' : 'Disabled'}</span>
          <span className="tabular-nums">{formatLastCheck(data.lastCheckTime)}</span>
        </div>
      </div>

      <Handle
        type="target"
        position={Position.Top}
        className="!bg-border !w-1.5 !h-1.5 !border-0"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-border !w-1.5 !h-1.5 !border-0"
      />
    </div>
  );
}

export const CrewNode = memo(CrewNodeComponent);
