import { useState, useEffect } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@protolabsai/ui/atoms';
import { Calendar, Link2, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Project, ProjectHealth } from '@protolabsai/types';
import { useProjectUpdate } from '../hooks/use-project';
import { HealthIndicator } from '../components/health-indicator';

const STATUS_OPTIONS = [
  'researching',
  'drafting',
  'reviewing',
  'approved',
  'scaffolded',
  'active',
  'completed',
] as const;

const PRIORITY_OPTIONS = ['urgent', 'high', 'medium', 'low', 'none'] as const;

const HEALTH_OPTIONS: ProjectHealth[] = ['on-track', 'at-risk', 'off-track'];

const HEALTH_LABELS: Record<ProjectHealth, string> = {
  'on-track': 'On Track',
  'at-risk': 'At Risk',
  'off-track': 'Off Track',
};

interface ProjectMetadataSheetProps {
  project: Project;
  projectSlug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProjectMetadataSheet({
  project,
  projectSlug,
  open,
  onOpenChange,
}: ProjectMetadataSheetProps) {
  const updateMutation = useProjectUpdate(projectSlug);

  const [lead, setLead] = useState(project.lead ?? '');
  const [newLinkLabel, setNewLinkLabel] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');

  useEffect(() => {
    setLead(project.lead ?? '');
  }, [project.lead]);

  const handleUpdate = (updates: Record<string, unknown>) => {
    updateMutation.mutate(updates, {
      onSuccess: () => toast.success('Updated'),
      onError: () => toast.error('Failed to update'),
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-80 sm:w-96 overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-sm">Project Settings</SheetTitle>
          <SheetDescription className="text-xs">Manage metadata and configuration</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-4">
          {/* Status */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Status
            </label>
            <select
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={project.status ?? ''}
              onChange={(e) => handleUpdate({ status: e.target.value })}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Health */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Health
            </label>
            <div className="flex gap-2">
              {HEALTH_OPTIONS.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => handleUpdate({ health: h })}
                  className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors ${
                    project.health === h
                      ? 'border-foreground/20 bg-muted'
                      : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <HealthIndicator health={h} />
                  {HEALTH_LABELS[h]}
                </button>
              ))}
            </div>
          </div>

          {/* Priority */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Priority
            </label>
            <div className="flex flex-wrap gap-1.5">
              {PRIORITY_OPTIONS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handleUpdate({ priority: p })}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    project.priority === p
                      ? 'bg-foreground/10 text-foreground ring-1 ring-foreground/20'
                      : 'bg-muted/40 text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Lead */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Lead
            </label>
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={lead}
              onChange={(e) => setLead(e.target.value)}
              onBlur={() => {
                if (lead !== (project.lead ?? '')) {
                  handleUpdate({ lead });
                }
              }}
              placeholder="Assign a lead..."
            />
          </div>

          {/* Color */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Color
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={project.color ?? '#6366f1'}
                onChange={(e) => handleUpdate({ color: e.target.value })}
                className="size-8 rounded-md border border-border cursor-pointer bg-transparent"
              />
              <span className="text-xs text-muted-foreground">
                {project.color ?? 'No color set'}
              </span>
            </div>
          </div>

          {/* Target Date */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Target Date
            </label>
            <div className="flex items-center gap-2">
              <Calendar className="size-3.5 text-muted-foreground" />
              <input
                type="date"
                value={project.targetDate?.split('T')[0] ?? ''}
                onChange={(e) =>
                  handleUpdate({
                    targetDate: e.target.value ? new Date(e.target.value).toISOString() : null,
                  })
                }
                className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* Links */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Links
            </label>
            <div className="space-y-1">
              {project.links?.map((link) => (
                <div
                  key={link.id}
                  className="flex items-center gap-2 rounded-md bg-muted/30 px-2 py-1"
                >
                  <Link2 className="size-3 text-muted-foreground shrink-0" />
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-foreground hover:underline truncate flex-1"
                  >
                    {link.label || link.url}
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      const updated = project.links?.filter((l) => l.id !== link.id) ?? [];
                      handleUpdate({ links: updated });
                    }}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-1.5">
              <input
                placeholder="Label"
                value={newLinkLabel}
                onChange={(e) => setNewLinkLabel(e.target.value)}
                className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <input
                placeholder="URL"
                value={newLinkUrl}
                onChange={(e) => setNewLinkUrl(e.target.value)}
                className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                type="button"
                onClick={() => {
                  if (!newLinkUrl.trim()) return;
                  const newLink = {
                    id: crypto.randomUUID(),
                    label: newLinkLabel.trim() || newLinkUrl.trim(),
                    url: newLinkUrl.trim(),
                  };
                  handleUpdate({ links: [...(project.links ?? []), newLink] });
                  setNewLinkLabel('');
                  setNewLinkUrl('');
                }}
                disabled={!newLinkUrl.trim()}
                className="rounded-md bg-muted px-2 py-1 text-xs hover:bg-muted/80 disabled:opacity-50"
              >
                <Plus className="size-3" />
              </button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
