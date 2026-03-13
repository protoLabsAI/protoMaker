import { Bot, Tag, FileSearch, Cpu, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Switch } from '@protolabsai/ui/atoms';
import { Badge } from '@protolabsai/ui/atoms';
import { toast } from 'sonner';
import { useAgents } from '@/hooks/use-agents';
import { useProjectSettings } from '@/hooks/queries';
import { useUpdateProjectSettings } from '@/hooks/mutations';
import type { Project } from '@/lib/electron';
import type { ProjectAgent } from '@protolabsai/types';

interface ProjectAgentsSectionProps {
  project: Project;
}

/**
 * Individual agent card — collapsible, shows rules summary on expand.
 */
function AgentCard({ agent }: { agent: ProjectAgent }) {
  const [open, setOpen] = useState(false);

  const hasRules =
    (agent.match?.categories?.length ?? 0) > 0 ||
    (agent.match?.keywords?.length ?? 0) > 0 ||
    (agent.match?.filePatterns?.length ?? 0) > 0;

  const isBuiltIn = (agent as unknown as Record<string, unknown>)._builtIn === true;

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden">
      {/* Header row */}
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/50 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <Bot className="w-4 h-4 shrink-0 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground truncate">{agent.name}</span>
            {isBuiltIn && (
              <Badge variant="muted" className="text-[10px] px-1.5 py-0.5 shrink-0">
                built-in
              </Badge>
            )}
            {agent.extends && agent.extends !== agent.name && (
              <span className="text-xs text-muted-foreground shrink-0">
                extends <span className="text-foreground/70">{agent.extends}</span>
              </span>
            )}
          </div>
          {agent.description && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{agent.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {agent.model && (
            <span className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
              <Cpu className="w-3 h-3" />
              {agent.model}
            </span>
          )}
          {open ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Expanded details */}
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-border/30 space-y-3 bg-muted/20">
          {agent.model && (
            <div className="flex items-center gap-2 text-xs">
              <Cpu className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Model override:</span>
              <span className="font-mono text-foreground/80">{agent.model}</span>
            </div>
          )}

          {hasRules ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Match Rules
              </p>

              {(agent.match?.categories?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1.5 items-center">
                  <Tag className="w-3 h-3 text-muted-foreground shrink-0" />
                  {agent.match!.categories.map((cat) => (
                    <Badge key={cat} variant="secondary" className="text-[10px] px-1.5 py-0.5">
                      {cat}
                    </Badge>
                  ))}
                </div>
              )}

              {(agent.match?.keywords?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1.5 items-center">
                  <span className="text-[10px] text-muted-foreground shrink-0">keywords:</span>
                  {agent.match!.keywords.map((kw) => (
                    <Badge key={kw} variant="outline" className="text-[10px] px-1.5 py-0.5">
                      {kw}
                    </Badge>
                  ))}
                </div>
              )}

              {(agent.match?.filePatterns?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1.5 items-center">
                  <FileSearch className="w-3 h-3 text-muted-foreground shrink-0" />
                  {agent.match!.filePatterns.map((pat) => (
                    <Badge
                      key={pat}
                      variant="outline"
                      className="text-[10px] px-1.5 py-0.5 font-mono"
                    >
                      {pat}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">No match rules configured.</p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Project Agents Section — shows built-in + project-manifest agents,
 * and a toggle for automatic assignment.
 */
export function ProjectAgentsSection({ project }: ProjectAgentsSectionProps) {
  const { data: agents = [], isLoading, error } = useAgents(project.path);
  const { data: projectSettings } = useProjectSettings(project.path);
  const updateProjectSettings = useUpdateProjectSettings(project.path);

  const autoAssignEnabled = projectSettings?.workflow?.agentConfig?.autoAssignEnabled ?? true;

  const handleAutoAssignToggle = (checked: boolean) => {
    updateProjectSettings.mutate(
      {
        projectPath: project.path,
        settings: {
          workflow: {
            ...(projectSettings?.workflow ?? {}),
            agentConfig: {
              ...(projectSettings?.workflow?.agentConfig ?? {}),
              autoAssignEnabled: checked,
            },
          },
        },
      },
      {
        onSuccess: () =>
          toast.success(checked ? 'Auto-assignment enabled' : 'Auto-assignment disabled'),
        onError: (err: Error) =>
          toast.error('Failed to update setting', { description: err.message }),
      }
    );
  };

  const builtInAgents = agents.filter(
    (a) => (a as unknown as Record<string, unknown>)._builtIn === true
  );
  const projectAgents = agents.filter(
    (a) => (a as unknown as Record<string, unknown>)._builtIn !== true
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Bot className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Agents</h2>
          <p className="text-sm text-muted-foreground">
            Built-in and project-defined agents with their match rules.
          </p>
        </div>
      </div>

      {/* Auto-assignment toggle */}
      <div className="flex items-center justify-between py-3 px-4 border border-border/50 rounded-lg bg-card">
        <div>
          <p className="text-sm font-medium text-foreground">Automatic Assignment</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            When enabled, match rules automatically route features to the best-fit agent.
          </p>
        </div>
        <Switch
          checked={autoAssignEnabled}
          onCheckedChange={handleAutoAssignToggle}
          disabled={updateProjectSettings.isPending}
        />
      </div>

      {/* Error state */}
      {error && (
        <div className="py-4 text-sm text-destructive text-center">
          Failed to load agents: {error instanceof Error ? error.message : String(error)}
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-muted/40 animate-pulse" />
          ))}
        </div>
      )}

      {/* Project agents */}
      {!isLoading && !error && projectAgents.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
            Project Agents ({projectAgents.length})
          </h3>
          <div className="space-y-2">
            {projectAgents.map((agent) => (
              <AgentCard key={agent.name} agent={agent} />
            ))}
          </div>
        </div>
      )}

      {/* Built-in agents */}
      {!isLoading && !error && builtInAgents.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
            Built-in Roles ({builtInAgents.length})
          </h3>
          <div className="space-y-2">
            {builtInAgents.map((agent) => (
              <AgentCard key={agent.name} agent={agent} />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && agents.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
          <Bot className="w-10 h-10 mb-3 opacity-40" />
          <p className="text-sm">No agents found.</p>
        </div>
      )}
    </div>
  );
}
