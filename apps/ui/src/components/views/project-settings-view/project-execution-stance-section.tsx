import { useState, useEffect } from 'react';
import { Label } from '@protolabsai/ui/atoms';
import { Button } from '@protolabsai/ui/atoms';
import { GitPullRequest, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProjectSettings } from '@/hooks/queries/use-settings';
import { useUpdateProjectSettings } from '@/hooks/mutations/use-settings-mutations';
import type { Project } from '@/lib/electron';

interface ProjectExecutionStanceSectionProps {
  project: Project;
}

type ExecutionStance = 'delivery' | 'observe';

const STANCE_OPTIONS: {
  value: ExecutionStance;
  label: string;
  description: string;
  icon: typeof GitPullRequest;
}[] = [
  {
    value: 'delivery',
    label: 'Delivery',
    description: 'Agents branch → push → PR → review → merge',
    icon: GitPullRequest,
  },
  {
    value: 'observe',
    label: 'Observe',
    description: 'Read-only triage/analysis, no PRs',
    icon: Eye,
  },
];

export function ProjectExecutionStanceSection({ project }: ProjectExecutionStanceSectionProps) {
  const { data: settings } = useProjectSettings(project.path);
  const updateSettings = useUpdateProjectSettings();

  const [stance, setStance] = useState<ExecutionStance>(settings?.executionStance ?? 'delivery');

  useEffect(() => {
    if (settings?.executionStance) {
      setStance(settings.executionStance);
    }
  }, [settings?.executionStance]);

  function handleSave(value: ExecutionStance) {
    setStance(value);
    updateSettings.mutate({
      projectPath: project.path,
      settings: { executionStance: value },
    });
  }

  return (
    <div
      className={cn(
        'rounded-xl overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm shadow-black/5'
      )}
    >
      <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500/20 to-brand-600/10 flex items-center justify-center border border-brand-500/20">
            <GitPullRequest className="w-5 h-5 text-brand-500" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">Execution Stance</h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Controls whether signal-intake features produce PRs or stay read-only for this project.
        </p>
      </div>
      <div className="p-6 space-y-4">
        <Label>Default Stance</Label>
        <p className="text-xs text-muted-foreground mb-2">
          Determines how incoming signals (GitHub issues, Discord, MCP) are triaged. A delivery
          stance produces branches and PRs; an observe stance keeps agents read-only.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {STANCE_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isActive = stance === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSave(option.value)}
                disabled={updateSettings.isPending}
                className={cn(
                  'relative flex items-start gap-3 p-4 rounded-lg border text-left transition-all',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
                  isActive
                    ? 'border-brand-500/50 bg-brand-500/5 shadow-sm'
                    : 'border-border/50 bg-card/50 hover:border-border hover:bg-card/80'
                )}
              >
                <div
                  className={cn(
                    'w-8 h-8 rounded-md flex items-center justify-center shrink-0 mt-0.5',
                    isActive
                      ? 'bg-brand-500/20 text-brand-500'
                      : 'bg-muted/50 text-muted-foreground'
                  )}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{option.label}</span>
                    {isActive && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-brand-500/10 text-brand-500 font-medium">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{option.description}</p>
                </div>
              </button>
            );
          })}
        </div>

        {updateSettings.isPending && <p className="text-xs text-muted-foreground">Saving...</p>}
      </div>
    </div>
  );
}
