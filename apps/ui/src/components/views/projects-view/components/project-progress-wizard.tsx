import { Rocket, FileText, CheckCircle, BarChart2, Archive } from 'lucide-react';
import { Button, Spinner } from '@protolabsai/ui/atoms';
import { toast } from 'sonner';
import { useLaunchProject } from '../hooks/use-project';
import { useProjectFeatures } from '../hooks/use-project-features';
import type { Project, ProjectStatus } from '@protolabsai/types';

const HIDDEN_STATUSES: ProjectStatus[] = ['ongoing', 'cancelled'];

interface ProjectProgressWizardProps {
  project: Project;
  onTabChange: (tab: string) => void;
}

function FeatureProgressBar({ projectSlug }: { projectSlug: string }) {
  const { data: featuresData } = useProjectFeatures(projectSlug);
  const features = (featuresData?.data?.features ?? []) as Array<{ status?: string }>;
  const total = features.length;
  const done = features.filter((f) => f.status === 'done').length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden min-w-[80px]">
        <div
          className="h-full bg-[var(--status-success)] rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground shrink-0">
        {done} / {total} features done
      </span>
    </div>
  );
}

function LaunchButton({ projectSlug }: { projectSlug: string }) {
  const launchMutation = useLaunchProject(projectSlug);

  const handleLaunch = () => {
    launchMutation.mutate(undefined, {
      onSuccess: (res) => {
        if (res.success) {
          toast.success(
            res.autoModeStarted
              ? `Project launched — auto-mode started with ${res.featuresInBacklog ?? 0} features`
              : 'Project launched'
          );
        } else {
          toast.error(res.error ?? 'Failed to launch project');
        }
      },
      onError: () => toast.error('Failed to launch project'),
    });
  };

  return (
    <Button
      size="sm"
      onClick={handleLaunch}
      disabled={launchMutation.isPending}
      data-testid="wizard-launch-project-button"
    >
      {launchMutation.isPending ? (
        <Spinner className="w-3.5 h-3.5 mr-1.5" />
      ) : (
        <Rocket className="w-3.5 h-3.5 mr-1.5" />
      )}
      Launch Project
    </Button>
  );
}

const STATUS_CONFIG: Record<
  ProjectStatus,
  {
    label: string;
    description: string;
    icon?: React.ReactNode;
    cta?: (props: { project: Project; onTabChange: (tab: string) => void }) => React.ReactNode;
  } | null
> = {
  ongoing: null,
  cancelled: null,
  researching: {
    label: 'Researching',
    description: 'Deep research is running. This may take a few minutes.',
    icon: <Spinner className="w-4 h-4 text-[var(--status-info)]" />,
  },
  drafting: {
    label: 'Drafting PRD',
    description: 'The PRD is being drafted.',
    icon: <FileText className="w-4 h-4 text-[var(--status-warning)]" />,
    cta: ({ onTabChange }) => (
      <Button size="sm" variant="outline" onClick={() => onTabChange('prd')}>
        <FileText className="w-3.5 h-3.5 mr-1.5" />
        Write PRD
      </Button>
    ),
  },
  reviewing: {
    label: 'Reviewing PRD',
    description: 'The PRD is ready for review.',
    icon: <FileText className="w-4 h-4 text-[var(--status-brand)]" />,
    cta: ({ onTabChange }) => (
      <Button size="sm" variant="outline" onClick={() => onTabChange('prd')}>
        <FileText className="w-3.5 h-3.5 mr-1.5" />
        Review PRD
      </Button>
    ),
  },
  approved: {
    label: 'PRD Approved',
    description: 'The PRD has been approved. Ready to launch.',
    icon: <CheckCircle className="w-4 h-4 text-[var(--status-success)]" />,
    cta: ({ project }) => <LaunchButton projectSlug={project.slug} />,
  },
  scaffolded: {
    label: 'Project Scaffolded',
    description: 'Project structure created. Features are being set up.',
    icon: <BarChart2 className="w-4 h-4 text-[var(--status-info)]" />,
  },
  active: {
    label: 'Active',
    description: 'Work is in progress.',
    icon: <BarChart2 className="w-4 h-4 text-[var(--status-warning)]" />,
    cta: ({ project, onTabChange }) => (
      <div className="flex items-center gap-4 min-w-0">
        <FeatureProgressBar projectSlug={project.slug} />
        <Button size="sm" variant="ghost" onClick={() => onTabChange('features')}>
          View Features
        </Button>
      </div>
    ),
  },
  completed: {
    label: 'Completed',
    description: 'All features are done.',
    icon: <CheckCircle className="w-4 h-4 text-[var(--status-success)]" />,
    cta: ({ onTabChange }) => (
      <Button size="sm" variant="outline" onClick={() => onTabChange('timeline')}>
        <Archive className="w-3.5 h-3.5 mr-1.5" />
        View Retrospective
      </Button>
    ),
  },
};

export function ProjectProgressWizard({ project, onTabChange }: ProjectProgressWizardProps) {
  if (HIDDEN_STATUSES.includes(project.status)) {
    return null;
  }

  const config = STATUS_CONFIG[project.status];
  if (!config) return null;

  return (
    <div className="mx-3 sm:mx-6 mt-3 px-4 py-3 rounded-lg border border-border/50 bg-card flex items-center gap-3 min-w-0">
      {config.icon && <span className="shrink-0">{config.icon}</span>}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground leading-tight">{config.label}</p>
        <p className="text-xs text-muted-foreground">{config.description}</p>
      </div>
      {config.cta && (
        <div className="shrink-0 flex items-center">{config.cta({ project, onTabChange })}</div>
      )}
    </div>
  );
}
