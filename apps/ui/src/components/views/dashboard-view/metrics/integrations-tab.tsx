/**
 * IntegrationsTab - Shows integration status, activity feed, and running agents
 *
 * Displays:
 * - Integration cards for Discord, Linear, and GitHub with connection status and stats
 * - Activity ticker showing cross-platform activity feed
 * - Agent session status card showing running agents with model and current task
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useIntegrationStatus, useActivityFeed } from '@/hooks/queries/use-metrics';
import { useRunningAgents } from '@/hooks/queries/use-running-agents';
import {
  MessageSquare,
  CheckCircle2,
  XCircle,
  Hash,
  GitPullRequest,
  GitMerge,
  CheckCheck,
  Bot,
  Clock,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface IntegrationsTabProps {
  projectPath: string | undefined;
}

/**
 * IntegrationCard - Shows connection status and stats for a single integration
 */
interface IntegrationCardProps {
  title: string;
  icon: React.ElementType;
  status: 'connected' | 'offline';
  stats: { label: string; value: string | number }[];
  iconColor: string;
}

function IntegrationCard({ title, icon: Icon, status, stats, iconColor }: IntegrationCardProps) {
  const isConnected = status === 'connected';

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn('rounded-lg p-2', iconColor)}>
              <Icon className="h-4 w-4" />
            </div>
            <CardTitle className="text-base">{title}</CardTitle>
          </div>
          <div className="flex items-center gap-1.5">
            {isConnected ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                  Connected
                </span>
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground font-medium">Offline</span>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 gap-3">
          {stats.map((stat, i) => (
            <div key={i} className="space-y-1">
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="text-lg font-semibold">{stat.value}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * ActivityTicker - Shows recent activity from all platforms
 */
interface ActivityTickerProps {
  projectPath: string | undefined;
}

function ActivityTicker({ projectPath }: ActivityTickerProps) {
  const { data } = useActivityFeed(projectPath, 20);
  const events = data?.events || [];

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-blue-500" />
          <CardTitle className="text-base">Activity Feed</CardTitle>
          <span className="text-xs text-muted-foreground">
            {events.length} recent {events.length === 1 ? 'event' : 'events'}
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Activity className="h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">No recent activity</p>
          </div>
        ) : (
          <ScrollArea className="h-[200px]">
            <div className="space-y-2">
              {events.map((event: any, i: number) => (
                <div
                  key={i}
                  className="flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground leading-tight">
                      {event.description || event.message || 'Activity event'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatTimestamp(event.timestamp)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * AgentSessionCard - Shows running agents with model and current task
 */
function AgentSessionCard() {
  const { data, isLoading } = useRunningAgents();
  const agents = data?.agents || [];

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-lg p-2 bg-purple-500/10 text-purple-500">
              <Bot className="h-4 w-4" />
            </div>
            <CardTitle className="text-base">Agent Sessions</CardTitle>
          </div>
          <span className="text-xs text-muted-foreground font-medium">
            {agents.length} {agents.length === 1 ? 'agent' : 'agents'} running
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-4 bg-muted rounded w-3/4 mb-2" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Bot className="h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">No agents running</p>
          </div>
        ) : (
          <ScrollArea className="h-[200px]">
            <div className="space-y-3">
              {agents.map((agent: any) => (
                <div
                  key={agent.id}
                  className="p-3 rounded-lg border border-border/50 bg-muted/20 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bot className="h-3.5 w-3.5 text-purple-500" />
                      <span className="text-sm font-medium text-foreground">
                        {agent.featureId || agent.sessionId}
                      </span>
                    </div>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10
                                   text-purple-600 dark:text-purple-400 font-medium"
                    >
                      {agent.model || 'sonnet'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {agent.currentTask || agent.status || 'Running...'}
                  </p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>{formatDuration(agent.duration || 0)}</span>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Format a timestamp for display
 */
function formatTimestamp(timestamp: string | Date): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
  return `${Math.floor(diffMins / 1440)}d ago`;
}

/**
 * Format duration in milliseconds to human-readable string
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * IntegrationsTab - Main component
 */
export function IntegrationsTab({ projectPath }: IntegrationsTabProps) {
  const { data: integrationStatus, isLoading: isLoadingIntegrations } =
    useIntegrationStatus(projectPath);

  // Extract Discord stats (mock data - will be replaced by real stats from backend)
  const discordConnected =
    integrationStatus?.discord?.connected && integrationStatus?.discord?.botOnline;
  const discordStats = [
    { label: 'Messages', value: discordConnected ? '1.2k' : '0' },
    { label: 'Channels', value: discordConnected ? '8' : '0' },
  ];

  // Extract Linear stats (mock data - will be replaced by real stats from backend)
  const linearConnected =
    integrationStatus?.linear?.connected && integrationStatus?.linear?.oauthValid;
  const linearStats = [
    { label: 'Open Issues', value: linearConnected ? '12' : '0' },
    { label: 'In Progress', value: linearConnected ? '4' : '0' },
  ];

  // Extract GitHub stats (mock data - will be replaced by real stats from backend)
  const githubConnected = integrationStatus?.github?.authenticated;
  const githubStats = [
    { label: 'Open PRs', value: githubConnected ? '3' : '0' },
    { label: 'Merged', value: githubConnected ? '45' : '0' },
  ];

  if (isLoadingIntegrations) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="bg-card/50 backdrop-blur-sm border-border/50">
              <CardContent className="pt-6">
                <div className="space-y-3 animate-pulse">
                  <div className="h-5 bg-muted rounded w-1/2" />
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-4 bg-muted rounded w-2/3" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Integration Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <IntegrationCard
          title="Discord"
          icon={MessageSquare}
          status={discordConnected ? 'connected' : 'offline'}
          stats={discordStats}
          iconColor="bg-indigo-500/10 text-indigo-500"
        />
        <IntegrationCard
          title="Linear"
          icon={Hash}
          status={linearConnected ? 'connected' : 'offline'}
          stats={linearStats}
          iconColor="bg-blue-500/10 text-blue-500"
        />
        <IntegrationCard
          title="GitHub"
          icon={GitPullRequest}
          status={githubConnected ? 'connected' : 'offline'}
          stats={githubStats}
          iconColor="bg-orange-500/10 text-orange-500"
        />
      </div>

      {/* Activity Feed and Agent Sessions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ActivityTicker projectPath={projectPath} />
        <AgentSessionCard />
      </div>
    </div>
  );
}
