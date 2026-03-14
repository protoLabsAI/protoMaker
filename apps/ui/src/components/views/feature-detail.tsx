// @ts-nocheck -- Feature index signature causes property access type errors
import { memo, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@protolabsai/ui/atoms';
import { ScrollArea } from '@protolabsai/ui/atoms';
import { Badge } from '@protolabsai/ui/atoms';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@protolabsai/ui/atoms';
import {
  GitPullRequest,
  CheckCircle2,
  Clock,
  MessageSquare,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Server,
  Bot,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { Feature } from '@/store/types';
import { useAuthorityEvents } from '@/hooks/use-authority-events';
import { useAgents } from '@/hooks/use-agents';
import { useUpdateFeature } from '@/hooks/mutations';
import { useAppStore } from '@/store/app-store';
import { BUILT_IN_AGENT_ROLES } from '@protolabsai/types';

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
 * Role Selector — dropdown to assign an agent role to a feature.
 * "Auto" clears the assignedRole and lets match rules decide.
 */
const RoleSelector = memo(function RoleSelector({ feature }: { feature: Feature }) {
  const projectPath = useAppStore((s) => s.currentProject?.path);
  const { data: agents = [] } = useAgents(projectPath);
  const updateFeature = useUpdateFeature(projectPath ?? '');

  // Build options: Auto + built-in roles + project-specific agents
  const projectAgents = agents.filter(
    (a) => (a as unknown as Record<string, unknown>)._builtIn !== true
  );

  const handleChange = (value: string) => {
    if (!projectPath) return;
    const assignedRole = value === '__auto__' ? undefined : value;
    updateFeature.mutate(
      { ...feature, assignedRole },
      {
        onSuccess: () =>
          toast.success(
            assignedRole ? `Role set to ${assignedRole}` : 'Role cleared — auto-assign enabled'
          ),
        onError: (err: Error) => toast.error('Failed to update role', { description: err.message }),
      }
    );
  };

  const currentValue = (feature.assignedRole as string | undefined) ?? '__auto__';

  return (
    <div>
      <span className="text-sm font-medium text-muted-foreground flex items-center gap-1 mb-1">
        <Bot className="w-3.5 h-3.5" />
        Agent Role:{' '}
      </span>
      <Select value={currentValue} onValueChange={handleChange} disabled={!projectPath}>
        <SelectTrigger className="w-full text-sm h-8">
          <SelectValue placeholder="Auto (match rules)" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__auto__">
            <span className="text-muted-foreground italic">Auto (match rules)</span>
          </SelectItem>

          {/* Built-in roles */}
          {BUILT_IN_AGENT_ROLES.map((role) => (
            <SelectItem key={role} value={role}>
              {role}
            </SelectItem>
          ))}

          {/* Project-defined agents */}
          {projectAgents.length > 0 && (
            <>
              <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-t border-border/30 mt-1">
                Project Agents
              </div>
              {projectAgents.map((agent) => (
                <SelectItem key={agent.name} value={agent.name}>
                  {agent.name}
                </SelectItem>
              ))}
            </>
          )}
        </SelectContent>
      </Select>
    </div>
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
            {feature.assignedInstance && (
              <div>
                <span className="text-sm font-medium text-muted-foreground">
                  Assigned Instance:{' '}
                </span>
                <span className="inline-flex items-center gap-1 text-sm text-violet-400">
                  <Server className="w-3.5 h-3.5" />
                  {feature.assignedInstance}
                </span>
              </div>
            )}

            {/* Agent Role selector */}
            <RoleSelector feature={feature} />
          </div>
        </CardContent>
      </Card>

      {/* PR Feedback Panel */}
      <PRFeedbackPanel feature={feature} />
    </div>
  );
});
