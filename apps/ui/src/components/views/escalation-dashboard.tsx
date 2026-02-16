// @ts-nocheck
import { memo, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  CheckCircle2,
  XCircle,
  Clock,
  Activity,
  TrendingUp,
  AlertOctagon,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthorityEvents } from '@/hooks/use-authority-events';

/**
 * Escalation severity type (from EscalationSeverity enum)
 */
type EscalationSeverity = 'emergency' | 'critical' | 'high' | 'medium' | 'low';

/**
 * Channel status type
 */
type ChannelStatus = 'active' | 'inactive' | 'error';

/**
 * Get severity icon
 */
function getSeverityIcon(severity: string) {
  switch (severity) {
    case 'emergency':
      return AlertOctagon;
    case 'critical':
      return AlertCircle;
    case 'high':
      return AlertTriangle;
    case 'medium':
      return Bell;
    case 'low':
      return Info;
    default:
      return Bell;
  }
}

/**
 * Get severity color classes
 */
function getSeverityClasses(severity: string) {
  switch (severity) {
    case 'emergency':
      return 'text-status-error border-status-error/30 bg-status-error-bg';
    case 'critical':
      return 'text-status-error border-status-error/30 bg-status-error-bg';
    case 'high':
      return 'text-status-warning border-status-warning/30 bg-status-warning-bg';
    case 'medium':
      return 'text-status-warning border-status-warning/30 bg-status-warning-bg';
    case 'low':
      return 'text-status-info border-status-info/30 bg-status-info-bg';
    default:
      return 'text-muted-foreground border-muted-foreground/30 bg-muted';
  }
}

/**
 * Format relative time (e.g., "2m ago")
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return `${seconds}s ago`;
}

/**
 * Extract severity from event message
 */
function extractSeverity(message: string): EscalationSeverity {
  if (message.includes('emergency')) return 'emergency';
  if (message.includes('critical')) return 'critical';
  if (message.includes('high')) return 'high';
  if (message.includes('medium')) return 'medium';
  if (message.includes('low')) return 'low';
  return 'medium';
}

/**
 * Extract channel from event message
 */
function extractChannel(message: string): string {
  const channels = ['discord', 'linear', 'github', 'beads', 'ui'];
  for (const channel of channels) {
    if (message.toLowerCase().includes(channel)) {
      return channel;
    }
  }
  return 'unknown';
}

/**
 * Real-time Escalation Feed Component
 */
const EscalationFeed = memo(function EscalationFeed() {
  const { events, isConnected } = useAuthorityEvents(100);

  const escalationEvents = useMemo(() => {
    return events.filter((event) => event.type.startsWith('escalation:'));
  }, [events]);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Real-time Escalation Feed
          </CardTitle>
          <div
            className={cn(
              'h-2 w-2 rounded-full',
              isConnected ? 'bg-status-success animate-pulse' : 'bg-muted-foreground'
            )}
            title={isConnected ? 'Connected' : 'Disconnected'}
          />
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          {escalationEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
              <Clock className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm">No escalations yet</p>
              <p className="text-xs mt-1 opacity-70">Escalation signals will appear here</p>
            </div>
          ) : (
            <div className="space-y-2">
              {escalationEvents.map((event) => {
                const severity = extractSeverity(event.message);
                const SeverityIcon = getSeverityIcon(severity);

                return (
                  <div
                    key={event.id}
                    className={cn(
                      'flex items-start gap-2 p-3 rounded-md border text-xs',
                      getSeverityClasses(severity)
                    )}
                  >
                    <SeverityIcon className="w-4 h-4 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="font-medium flex-1">{event.message}</p>
                        <Badge
                          className={cn('text-[10px] px-1.5 py-0.5', getSeverityClasses(severity))}
                        >
                          {severity}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs opacity-70">
                        <span>{formatRelativeTime(event.timestamp)}</span>
                        {event.type === 'escalation:signal-routed' && (
                          <span className="flex items-center gap-1">
                            <span>→</span>
                            <span>{extractChannel(event.message)}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
});

/**
 * Severity Distribution Component
 */
const SeverityDistribution = memo(function SeverityDistribution() {
  const { events } = useAuthorityEvents(100);

  const severityCounts = useMemo(() => {
    const escalationEvents = events.filter((event) => event.type.startsWith('escalation:'));
    const counts: Record<EscalationSeverity, number> = {
      emergency: 0,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    escalationEvents.forEach((event) => {
      const severity = extractSeverity(event.message);
      counts[severity] = (counts[severity] || 0) + 1;
    });

    return counts;
  }, [events]);

  const total = Object.values(severityCounts).reduce((sum, count) => sum + count, 0);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <TrendingUp className="w-4 h-4" />
          Severity Distribution
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {(['emergency', 'critical', 'high', 'medium', 'low'] as EscalationSeverity[]).map(
            (severity) => {
              const count = severityCounts[severity];
              const percentage = total > 0 ? (count / total) * 100 : 0;
              const SeverityIcon = getSeverityIcon(severity);

              return (
                <div key={severity} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <SeverityIcon className="w-3.5 h-3.5" />
                      <span className="capitalize font-medium">{severity}</span>
                    </div>
                    <span className="text-muted-foreground">
                      {count} ({percentage.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
                    <div
                      className={cn('h-full transition-all', getSeverityClasses(severity))}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            }
          )}
          {total === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No escalations yet</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
});

/**
 * Channel Status Component
 */
const ChannelStatus = memo(function ChannelStatus() {
  const { events } = useAuthorityEvents(100);

  const channelStats = useMemo(() => {
    const escalationEvents = events.filter((event) => event.type.startsWith('escalation:'));
    const stats: Record<string, { sent: number; failed: number; status: ChannelStatus }> = {};

    escalationEvents.forEach((event) => {
      const channel = extractChannel(event.message);
      if (!stats[channel]) {
        stats[channel] = { sent: 0, failed: 0, status: 'active' };
      }

      if (event.type === 'escalation:signal-sent') {
        stats[channel].sent++;
        stats[channel].status = 'active';
      } else if (event.type === 'escalation:signal-failed') {
        stats[channel].failed++;
        stats[channel].status = 'error';
      }
    });

    return stats;
  }, [events]);

  const channels = Object.entries(channelStats);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">Channel Status</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {channels.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              No channel activity yet
            </p>
          ) : (
            channels.map(([channel, stats]) => (
              <div
                key={channel}
                className="flex items-center justify-between p-2 bg-muted/30 rounded-md"
              >
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      'h-2 w-2 rounded-full',
                      stats.status === 'active' && 'bg-status-success',
                      stats.status === 'error' && 'bg-status-error',
                      stats.status === 'inactive' && 'bg-muted-foreground'
                    )}
                  />
                  <span className="text-sm font-medium capitalize">{channel}</span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-status-success">{stats.sent} sent</span>
                  {stats.failed > 0 && (
                    <span className="text-status-error">{stats.failed} failed</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
});

/**
 * Acknowledged/Pending Counts Component
 */
const AcknowledgedPendingCounts = memo(function AcknowledgedPendingCounts() {
  const { events } = useAuthorityEvents(100);
  const [filter, setFilter] = useState<'all' | 'pending' | 'acknowledged'>('all');

  const counts = useMemo(() => {
    const escalationEvents = events.filter((event) => event.type.startsWith('escalation:'));

    const pending = escalationEvents.filter(
      (event) =>
        event.type === 'escalation:signal-received' || event.type === 'escalation:signal-routed'
    ).length;

    const acknowledged = escalationEvents.filter(
      (event) => event.type === 'escalation:signal-sent'
    ).length;

    return { pending, acknowledged, total: escalationEvents.length };
  }, [events]);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">Escalation Tracking</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-2 mb-4">
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('all')}
            className="flex flex-col items-center py-3 h-auto"
          >
            <span className="text-lg font-bold">{counts.total}</span>
            <span className="text-xs">Total</span>
          </Button>
          <Button
            variant={filter === 'pending' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('pending')}
            className="flex flex-col items-center py-3 h-auto"
          >
            <span className="text-lg font-bold text-status-warning">{counts.pending}</span>
            <span className="text-xs">Pending</span>
          </Button>
          <Button
            variant={filter === 'acknowledged' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('acknowledged')}
            className="flex flex-col items-center py-3 h-auto"
          >
            <span className="text-lg font-bold text-status-success">{counts.acknowledged}</span>
            <span className="text-xs">Acknowledged</span>
          </Button>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Progress</span>
            <span>
              {counts.total > 0 ? Math.round((counts.acknowledged / counts.total) * 100) : 0}%
            </span>
          </div>
          <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-status-success transition-all"
              style={{
                width: `${counts.total > 0 ? (counts.acknowledged / counts.total) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

/**
 * Escalation Dashboard Component
 * Shows real-time escalation feed, severity distribution, channel status,
 * and acknowledged/pending counts
 */
export const EscalationDashboard = memo(function EscalationDashboard() {
  return (
    <div className="space-y-4 p-4">
      {/* Top Row: Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SeverityDistribution />
        <ChannelStatus />
        <AcknowledgedPendingCounts />
      </div>

      {/* Bottom Row: Feed */}
      <EscalationFeed />
    </div>
  );
});
