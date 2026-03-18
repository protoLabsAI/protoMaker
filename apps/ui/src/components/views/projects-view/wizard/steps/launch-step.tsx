import { useState } from 'react';
import { Rocket, CheckCircle, ExternalLink } from 'lucide-react';
import { Button } from '@protolabsai/ui/atoms';
import { toast } from 'sonner';
import { useNavigate } from '@tanstack/react-router';
import type { Project } from '@protolabsai/types';
import { useLaunchProject } from '../../hooks/use-project';
import { useProjectWizardStore } from '@/store/project-wizard-store';

interface LaunchStepProps {
  project: Project;
  projectSlug: string;
}

export function LaunchStep({ project, projectSlug }: LaunchStepProps) {
  const launchMutation = useLaunchProject(projectSlug);
  const markCompleted = useProjectWizardStore((s) => s.markCompleted);
  const navigate = useNavigate();

  const [maxConcurrency, setMaxConcurrency] = useState(2);
  const [createEpics, setCreateEpics] = useState(true);
  const [setupDependencies, setSetupDependencies] = useState(true);

  const isLaunched = project.status === 'active' || project.status === 'completed';

  const handleLaunch = () => {
    launchMutation.mutate(maxConcurrency, {
      onSuccess: (res) => {
        if (res.success) {
          toast.success(
            res.autoModeStarted
              ? `Launched with ${res.featuresInBacklog ?? 0} features`
              : 'Project launched'
          );
          markCompleted('launch');
        } else {
          toast.error(res.error ?? 'Failed to launch');
        }
      },
      onError: () => toast.error('Failed to launch project'),
    });
  };

  if (isLaunched) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Project Launched</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Auto-mode is processing features. Monitor progress on the board.
          </p>
        </div>

        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <div className="size-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <CheckCircle className="size-8 text-emerald-400" />
          </div>
          <p className="text-sm font-medium">Project is active</p>
          <Button variant="outline" onClick={() => navigate({ to: '/' })}>
            <ExternalLink className="size-4 mr-1.5" />
            View Board
          </Button>
        </div>
      </div>
    );
  }

  const totalPhases = project.milestones?.reduce((acc, m) => acc + (m.phases?.length ?? 0), 0) ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Launch Project</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure and start auto-mode to begin autonomous feature implementation.
        </p>
      </div>

      {/* Summary */}
      <div className="rounded-lg border border-border/20 bg-muted/5 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Features to process</span>
          <span className="text-sm font-medium">{totalPhases}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Milestones</span>
          <span className="text-sm font-medium">{project.milestones?.length ?? 0}</span>
        </div>
      </div>

      {/* Configuration */}
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="max-concurrency" className="text-xs font-medium text-muted-foreground">
            Max Concurrency
          </label>
          <input
            id="max-concurrency"
            type="number"
            min={1}
            max={10}
            value={maxConcurrency}
            onChange={(e) => setMaxConcurrency(parseInt(e.target.value, 10) || 1)}
            className="w-24 rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground/60">
            Number of agents working simultaneously
          </p>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={createEpics}
            onChange={(e) => setCreateEpics(e.target.checked)}
            className="rounded border-border"
          />
          <span className="text-sm text-muted-foreground">Create epics for milestones</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={setupDependencies}
            onChange={(e) => setSetupDependencies(e.target.checked)}
            className="rounded border-border"
          />
          <span className="text-sm text-muted-foreground">Set up feature dependencies</span>
        </label>
      </div>

      {/* Launch button */}
      <div className="flex justify-end pt-2">
        <Button onClick={handleLaunch} loading={launchMutation.isPending} size="lg">
          <Rocket className="size-4 mr-1.5" />
          Launch Project
        </Button>
      </div>
    </div>
  );
}
