// @ts-nocheck
import { memo } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { User, Brain, Workflow, BarChart3, Circle } from 'lucide-react';

interface AgentStatus {
  id: string;
  name: string;
  role: 'pm' | 'projm' | 'em' | 'status';
  status: 'active' | 'idle' | 'processing';
  currentTask?: string;
  trustLevel?: number;
}

/**
 * Get icon for agent role
 */
function getAgentIcon(role: AgentStatus['role']) {
  switch (role) {
    case 'pm':
      return User;
    case 'projm':
      return Workflow;
    case 'em':
      return Brain;
    case 'status':
      return BarChart3;
  }
}

/**
 * Get color classes for agent status
 */
function getStatusClasses(status: AgentStatus['status']) {
  switch (status) {
    case 'active':
      return 'text-status-success border-status-success/30 bg-status-success-bg';
    case 'processing':
      return 'text-status-info border-status-info/30 bg-status-info-bg';
    case 'idle':
      return 'text-muted-foreground border-muted-foreground/30 bg-muted';
  }
}

/**
 * Get status indicator dot color
 */
function getStatusDotColor(status: AgentStatus['status']) {
  switch (status) {
    case 'active':
      return 'bg-status-success';
    case 'processing':
      return 'bg-status-info animate-pulse';
    case 'idle':
      return 'bg-muted-foreground';
  }
}

/**
 * Get full agent name
 */
function getAgentName(role: AgentStatus['role']): string {
  switch (role) {
    case 'pm':
      return 'Project Manager';
    case 'projm':
      return 'Project Decomposer';
    case 'em':
      return 'Engineering Manager';
    case 'status':
      return 'Status Reporter';
  }
}

/**
 * Authority Agents Status List - Shows current state of authority agents
 *
 * Displays PM, ProjM, EM, and Status agents with indicators showing
 * whether they're active, idle, or processing work.
 */
export const AuthorityAgentsStatus = memo(function AuthorityAgentsStatus() {
  // TODO: Connect to actual agent status from backend
  // For now, show default status
  const agents: AgentStatus[] = [
    {
      id: 'pm-agent',
      name: 'PM Agent',
      role: 'pm',
      status: 'idle',
      trustLevel: 3,
    },
    {
      id: 'projm-agent',
      name: 'ProjM Agent',
      role: 'projm',
      status: 'idle',
      trustLevel: 3,
    },
    {
      id: 'em-agent',
      name: 'EM Agent',
      role: 'em',
      status: 'idle',
      trustLevel: 3,
    },
    {
      id: 'status-agent',
      name: 'Status Agent',
      role: 'status',
      status: 'idle',
      trustLevel: 3,
    },
  ];

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">Authority Agents</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pb-3">
        {agents.map((agent) => {
          const Icon = getAgentIcon(agent.role);
          return (
            <TooltipProvider key={agent.id} delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      'flex items-center gap-2 p-2 rounded-md border text-xs transition-colors',
                      getStatusClasses(agent.status),
                      'cursor-default hover:border-opacity-60'
                    )}
                  >
                    <div className="relative">
                      <Icon className="w-4 h-4" />
                      <Circle
                        className={cn(
                          'w-2 h-2 absolute -bottom-0.5 -right-0.5',
                          getStatusDotColor(agent.status)
                        )}
                        fill="currentColor"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{getAgentName(agent.role)}</p>
                      {agent.currentTask && (
                        <p className="text-xs opacity-70 truncate">{agent.currentTask}</p>
                      )}
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px] px-1.5 py-0 h-5 border',
                        getStatusClasses(agent.status)
                      )}
                    >
                      {agent.status}
                    </Badge>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="left" className="text-xs">
                  <div className="space-y-1">
                    <p className="font-semibold">{getAgentName(agent.role)}</p>
                    <p className="text-muted-foreground">
                      Status: {agent.status.charAt(0).toUpperCase() + agent.status.slice(1)}
                    </p>
                    <p className="text-muted-foreground">
                      Trust Level: {agent.trustLevel}/3 (
                      {agent.trustLevel === 3
                        ? 'Autonomous'
                        : agent.trustLevel === 2
                          ? 'Conditional'
                          : agent.trustLevel === 1
                            ? 'Assisted'
                            : 'Manual'}
                      )
                    </p>
                    {agent.currentTask && (
                      <p className="text-muted-foreground">Current: {agent.currentTask}</p>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })}
      </CardContent>
    </Card>
  );
});
