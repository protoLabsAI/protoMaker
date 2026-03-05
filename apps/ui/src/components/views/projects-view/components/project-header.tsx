import { useState } from 'react';
import { ArrowLeft, ExternalLink, Trash2, PanelLeft } from 'lucide-react';
import { Badge } from '@protolabsai/ui/atoms';
import { Button } from '@protolabsai/ui/atoms';
import { HealthIndicator } from './health-indicator';
import { getProjectStatusVariant } from '../lib/status-variants';
import { DeleteConfirmDialog } from '@/components/shared/delete-confirm-dialog';
import type { Project, ProjectHealth } from '@protolabsai/types';

interface ProjectHeaderProps {
  project: Project;
  onBack: () => void;
  onDelete?: () => void;
  onToggleSidebar?: () => void;
  sidebarOpen?: boolean;
}

export function ProjectHeader({
  project,
  onBack,
  onDelete,
  onToggleSidebar,
  sidebarOpen,
}: ProjectHeaderProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

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
            <Badge
              variant={getProjectStatusVariant(project.status)}
              size="sm"
              className="uppercase tracking-wider shrink-0"
            >
              {project.status}
            </Badge>
            {project.health && <HealthIndicator health={project.health as ProjectHealth} />}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{project.slug}</p>
        </div>
        {project.linearProjectUrl && (
          <a
            href={project.linearProjectUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Open project in Linear"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
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
