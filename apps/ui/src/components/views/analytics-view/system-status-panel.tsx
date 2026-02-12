import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, Bot, GitPullRequest, ListTodo, Bell } from 'lucide-react';

interface SystemStatusPanelProps {
  autoModeRunning: boolean;
  runningAgentsCount: number;
  backlogSize: number;
  reviewCount: number;
  unreadNotifications: number;
  isLoading: boolean;
}

function StatusRow({
  icon: Icon,
  label,
  value,
  statusColor,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  statusColor?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <span className={`text-sm font-semibold tabular-nums ${statusColor ?? ''}`}>{value}</span>
    </div>
  );
}

export function SystemStatusPanel({
  autoModeRunning,
  runningAgentsCount,
  backlogSize,
  reviewCount,
  unreadNotifications,
  isLoading,
}: SystemStatusPanelProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Activity className="h-4 w-4" />
          System Status
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-5 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            <StatusRow
              icon={Activity}
              label="Auto-mode"
              value={autoModeRunning ? 'Running' : 'Stopped'}
              statusColor={autoModeRunning ? 'text-green-500' : 'text-muted-foreground'}
            />
            <StatusRow
              icon={Bot}
              label="Running agents"
              value={runningAgentsCount}
              statusColor={runningAgentsCount > 0 ? 'text-blue-500' : undefined}
            />
            <StatusRow icon={ListTodo} label="Queued features" value={backlogSize} />
            <StatusRow icon={GitPullRequest} label="In review" value={reviewCount} />
            <StatusRow
              icon={Bell}
              label="Notifications"
              value={unreadNotifications > 0 ? `${unreadNotifications} unread` : 'None'}
              statusColor={unreadNotifications > 0 ? 'text-amber-500' : undefined}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
