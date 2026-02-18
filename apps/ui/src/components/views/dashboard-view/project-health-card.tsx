/**
 * ProjectHealthCard Component
 *
 * Displays a compact overview of project health including:
 * - Board state (backlog/in-progress/review/done counts)
 * - Running agents count
 * - Auto-mode status
 *
 * Updates via polling (30s) and WebSocket events
 */

import { Card, CardContent } from '@protolabs/ui/atoms';
import { useProjectHealth } from '@/hooks/use-project-health';
import { useAppStore } from '@/store/app-store';
import { Activity, CheckCircle2, Clock, ListTodo, PlayCircle, StopCircle } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';

interface StatusBadgeProps {
  status: 'running' | 'stopped' | 'idle';
}

function StatusBadge({ status }: StatusBadgeProps) {
  const config = {
    running: {
      label: 'Running',
      icon: PlayCircle,
      className: 'bg-status-success-bg text-status-success',
    },
    idle: {
      label: 'Idle',
      icon: Clock,
      className: 'bg-status-warning-bg text-status-warning',
    },
    stopped: {
      label: 'Stopped',
      icon: StopCircle,
      className: 'bg-muted text-muted-foreground',
    },
  };

  const { label, icon: Icon, className } = config[status];

  return (
    <div
      className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ${className}`}
    >
      <Icon className="h-3 w-3" />
      {label}
    </div>
  );
}

interface MetricProps {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
}

function Metric({ label, value, icon: Icon }: MetricProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="rounded-md bg-primary/10 p-1.5">
        <Icon className="h-3.5 w-3.5 text-primary" />
      </div>
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-sm font-semibold">{value}</span>
      </div>
    </div>
  );
}

export function ProjectHealthCard() {
  const { currentProject } = useAppStore(
    useShallow((state) => ({
      currentProject: state.currentProject,
    }))
  );

  const { boardCounts, runningAgentsCount, autoModeStatus, isLoading } = useProjectHealth(
    currentProject?.path
  );

  // Loading skeleton
  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center justify-between gap-4">
            <div className="h-12 w-full animate-pulse rounded bg-muted" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center justify-between gap-6">
          {/* Board Counts */}
          <div className="flex items-center gap-4">
            <Metric label="Backlog" value={boardCounts.backlog} icon={ListTodo} />
            <div className="h-6 w-px bg-border" />
            <Metric label="In Progress" value={boardCounts.inProgress} icon={Activity} />
            <div className="h-6 w-px bg-border" />
            <Metric label="Review" value={boardCounts.review} icon={Clock} />
            <div className="h-6 w-px bg-border" />
            <Metric label="Done" value={boardCounts.done} icon={CheckCircle2} />
          </div>

          {/* Right side: Running Agents & Auto-mode Status */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="rounded-md bg-primary/10 p-1.5">
                <Activity className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">Agents</span>
                <span className="text-sm font-semibold">{runningAgentsCount}</span>
              </div>
            </div>

            <div className="h-6 w-px bg-border" />

            <StatusBadge status={autoModeStatus} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
