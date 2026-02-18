// @ts-nocheck
import { memo, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@protolabs/ui/atoms';
import { ScrollArea } from '@protolabs/ui/atoms';
import { Badge } from '@protolabs/ui/atoms';
import {
  GitPullRequest,
  AlertCircle,
  CheckCircle2,
  Clock,
  MessageSquare,
  XCircle,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Feature } from '@/store/app-store';
import { useAuthorityEvents } from '@/hooks/use-authority-events';

interface FeatureDetailProps {
  feature: Feature;
}

/**
 * Get severity color classes for badges
 */
function getSeverityBadgeClass(severity: 'info' | 'success' | 'warning' | 'error') {
  switch (severity) {
    case 'success':
      return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'warning':
      return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    case 'error':
      return 'bg-red-500/20 text-red-400 border-red-500/30';
    default:
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
  }
}

/**
 * Get icon for PR event type
 */
function getPREventIcon(message: string) {
  if (message.includes('approved')) return CheckCircle2;
  if (message.includes('changes requested') || message.includes('feedback')) return MessageSquare;
  if (message.includes('failed') || message.includes('blocked')) return XCircle;
  if (message.includes('remediation') || message.includes('thread')) return RefreshCw;
  if (message.includes('CI')) return AlertTriangle;
  return GitPullRequest;
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
 * PR Feedback Panel Component
 * Shows thread decisions, severity badges, remediation cycles, and escalation status
 */
const PRFeedbackPanel = memo(function PRFeedbackPanel({ feature }: { feature: Feature }) {
  const { events } = useAuthorityEvents(100);

  // Filter events related to this feature
  const featureEvents = useMemo(() => {
    return events.filter(
      (event) =>
        event.featureId === feature.id ||
        event.type.startsWith('pr:') ||
        event.type.startsWith('escalation:')
    );
  }, [events, feature.id]);

  // Get PR-specific events
  const prEvents = useMemo(() => {
    return featureEvents.filter((event) => event.type.startsWith('pr:'));
  }, [featureEvents]);

  // Calculate statistics
  const stats = useMemo(() => {
    const total = prEvents.length;
    const approved = prEvents.filter((e) => e.type === 'pr:approved').length;
    const changesRequested = prEvents.filter(
      (e) => e.type === 'pr:changes-requested' || e.type === 'pr:feedback-received'
    ).length;
    const remediationCycles = prEvents.filter((e) => e.type === 'pr:remediation-started').length;
    const threadsResolved = prEvents.filter((e) => e.type === 'pr:threads-resolved').length;

    return { total, approved, changesRequested, remediationCycles, threadsResolved };
  }, [prEvents]);

  // Get escalation status
  const escalationEvents = useMemo(() => {
    return featureEvents.filter((event) => event.type.startsWith('escalation:'));
  }, [featureEvents]);

  const hasEscalations = escalationEvents.length > 0;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <GitPullRequest className="w-4 h-4" />
            PR Feedback & Escalation
          </CardTitle>
          {hasEscalations && (
            <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">
              {escalationEvents.length} Escalation{escalationEvents.length !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Stats Row */}
        <div className="grid grid-cols-5 gap-2 mb-4">
          <div className="flex flex-col items-center p-2 bg-muted/30 rounded-md">
            <span className="text-xs text-muted-foreground">Total</span>
            <span className="text-lg font-semibold">{stats.total}</span>
          </div>
          <div className="flex flex-col items-center p-2 bg-green-500/10 rounded-md">
            <span className="text-xs text-green-400">Approved</span>
            <span className="text-lg font-semibold text-green-400">{stats.approved}</span>
          </div>
          <div className="flex flex-col items-center p-2 bg-yellow-500/10 rounded-md">
            <span className="text-xs text-yellow-400">Changes</span>
            <span className="text-lg font-semibold text-yellow-400">{stats.changesRequested}</span>
          </div>
          <div className="flex flex-col items-center p-2 bg-blue-500/10 rounded-md">
            <span className="text-xs text-blue-400">Cycles</span>
            <span className="text-lg font-semibold text-blue-400">{stats.remediationCycles}</span>
          </div>
          <div className="flex flex-col items-center p-2 bg-purple-500/10 rounded-md">
            <span className="text-xs text-purple-400">Resolved</span>
            <span className="text-lg font-semibold text-purple-400">{stats.threadsResolved}</span>
          </div>
        </div>

        {/* Event Feed */}
        <ScrollArea className="h-[300px] pr-4">
          {featureEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
              <Clock className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm">No PR feedback or escalations yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {featureEvents.map((event) => {
                const Icon = getPREventIcon(event.message);
                const isEscalation = event.type.startsWith('escalation:');

                return (
                  <div
                    key={event.id}
                    className={cn(
                      'flex items-start gap-2 p-2 rounded-md border text-xs',
                      isEscalation
                        ? 'border-orange-500/30 bg-orange-500/10'
                        : getSeverityBadgeClass(event.severity || 'info').replace('bg-', 'border-')
                    )}
                  >
                    <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium flex-1">{event.message}</p>
                        <Badge
                          className={cn(
                            'text-[10px] px-1.5 py-0.5 shrink-0',
                            getSeverityBadgeClass(event.severity || 'info')
                          )}
                        >
                          {event.severity || 'info'}
                        </Badge>
                      </div>
                      <p className="text-xs opacity-50 mt-1">
                        {formatRelativeTime(event.timestamp)}
                      </p>
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
 * Feature Detail View Component
 * Extended with PR feedback panel showing thread decisions, severity badges,
 * remediation cycles, and escalation status
 */
export const FeatureDetail = memo(function FeatureDetail({ feature }: FeatureDetailProps) {
  return (
    <div className="space-y-4 p-4">
      {/* Feature Info Card */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg">{feature.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div>
              <span className="text-sm font-medium text-muted-foreground">Status: </span>
              <Badge>{feature.status}</Badge>
            </div>
            {feature.description && (
              <div>
                <span className="text-sm font-medium text-muted-foreground">Description: </span>
                <p className="text-sm mt-1">{feature.description}</p>
              </div>
            )}
            {feature.assignee && (
              <div>
                <span className="text-sm font-medium text-muted-foreground">Assignee: </span>
                <span className="text-sm">{feature.assignee}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* PR Feedback Panel */}
      <PRFeedbackPanel feature={feature} />
    </div>
  );
});
