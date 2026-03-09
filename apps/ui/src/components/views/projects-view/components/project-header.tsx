import { useState } from 'react';
import { ArrowLeft, Trash2, PanelLeft, MessageSquareDot, ChevronDown } from 'lucide-react';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@protolabsai/ui/atoms';
import { HealthIndicator } from './health-indicator';
import { getProjectStatusVariant } from '../lib/status-variants';
import { DeleteConfirmDialog } from '@/components/shared/delete-confirm-dialog';
import { useProjectFeatures } from '../hooks/use-project-features';
import { useProjectUpdate } from '../hooks/use-project';
import type { Project, ProjectHealth, ProjectStatus } from '@protolabsai/types';

const PROJECT_STATUSES: { value: ProjectStatus; label: string }[] = [
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'researching', label: 'Researching' },
  { value: 'drafting', label: 'Drafting' },
  { value: 'reviewing', label: 'Reviewing' },
  { value: 'approved', label: 'Approved' },
  { value: 'scaffolded', label: 'Scaffolded' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
];

interface ProjectHeaderProps {
  project: Project;
  onBack: () => void;
  onDelete?: () => void;
  onToggleSidebar?: () => void;
  sidebarOpen?: boolean;
  onTogglePmChat?: () => void;
  pmChatOpen?: boolean;
}

export function ProjectHeader({
  project,
  onBack,
  onDelete,
  onToggleSidebar,
  sidebarOpen,
  onTogglePmChat,
  pmChatOpen,
}: ProjectHeaderProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { data: featuresData } = useProjectFeatures(project.slug);
  const updateProject = useProjectUpdate(project.slug);

  const features = (featuresData?.data?.features ?? []) as Array<{ status?: string }>;
  const totalFeatures = features.length;
  const doneFeatures = features.filter((f) => f.status === 'done').length;

  const handleStatusChange = (status: ProjectStatus) => {
    updateProject.mutate({ status });
  };

  return (
    <div className="shrink-0 px-6 py-4 border-b border-border/40">
      <div className="flex items-center gap-3">
        <Button size="sm" variant="ghost" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        {onToggleSidebar && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onToggleSidebar}
            className={`md:hidden ${sidebarOpen ? 'text-foreground' : 'text-muted-foreground'}`}
            aria-label="Toggle sidebar"
          >
            <PanelLeft className="w-4 h-4" />
          </Button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-foreground tracking-tight truncate">
              {project.title}
            </h1>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity shrink-0"
                >
                  <Badge
                    variant={getProjectStatusVariant(project.status)}
                    size="sm"
                    className="uppercase tracking-wider"
                  >
                    {project.status}
                  </Badge>
                  <ChevronDown className="w-3 h-3 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {PROJECT_STATUSES.map((s) => (
                  <DropdownMenuItem
                    key={s.value}
                    onClick={() => handleStatusChange(s.value)}
                    className="gap-2"
                  >
                    <Badge
                      variant={getProjectStatusVariant(s.value)}
                      size="sm"
                      className="uppercase tracking-wider text-[10px]"
                    >
                      {s.label}
                    </Badge>
                    {s.value === project.status && (
                      <span className="text-[10px] text-muted-foreground ml-auto">current</span>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {totalFeatures > 0 && (
              <span className="text-xs text-muted-foreground shrink-0">
                {doneFeatures} / {totalFeatures} done
              </span>
            )}
            {project.health && <HealthIndicator health={project.health as ProjectHealth} />}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{project.slug}</p>
        </div>
        {onTogglePmChat && (
          <Button
            size="sm"
            variant={pmChatOpen ? 'secondary' : 'ghost'}
            onClick={onTogglePmChat}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Toggle PM chat"
            data-testid="pm-chat-toggle"
          >
            <MessageSquareDot className="w-4 h-4" />
            <span className="ml-1 text-xs">PM</span>
          </Button>
        )}
        {onDelete && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowDeleteDialog(true)}
            className="text-muted-foreground hover:text-destructive"
            aria-label="Delete project"
            data-testid="delete-project-button"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>

      {onDelete && (
        <DeleteConfirmDialog
          open={showDeleteDialog}
          onOpenChange={setShowDeleteDialog}
          onConfirm={onDelete}
          title={`Delete "${project.title}"?`}
          description="The project directory will be removed. A stats summary is preserved for historical reference. Linked board features are not affected."
          testId="delete-project-dialog"
          confirmTestId="confirm-delete-project"
        />
      )}
    </div>
  );
}
