import { useState } from 'react';
import { Calendar, User, Users, Target } from 'lucide-react';
import { Badge, Card, Input } from '@protolabs-ai/ui/atoms';
import { Button } from '@protolabs-ai/ui/atoms';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@protolabs-ai/ui/atoms';
import { cn } from '@/lib/utils';
import { HealthIndicator } from '../components/health-indicator';
import { getProjectStatusVariant } from '../lib/status-variants';
import { useProjectUpdate } from '../hooks/use-project';
import type { Project, ProjectHealth, ProjectPriority } from '@protolabs-ai/types';
import { toast } from 'sonner';

const PRIORITY_CONFIG: Record<ProjectPriority, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  none: 'None',
};

function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="text-xs text-muted-foreground w-24 shrink-0">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

export function OverviewTab({ project }: { project: Project }) {
  const updateMutation = useProjectUpdate(project.slug);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const milestoneCount = project.milestones?.length ?? 0;
  const phaseCount =
    project.milestones?.reduce((sum, ms) => sum + (ms.phases?.length ?? 0), 0) ?? 0;
  const completedPhases =
    project.milestones?.reduce(
      (sum, ms) => sum + (ms.phases?.filter((p) => p.featureId).length ?? 0),
      0
    ) ?? 0;

  const startEdit = (field: string, value: string) => {
    setEditingField(field);
    setEditValue(value);
  };

  const saveEdit = (field: string) => {
    updateMutation.mutate(
      { [field]: editValue },
      {
        onSuccess: () => {
          setEditingField(null);
          toast.success('Updated');
        },
      }
    );
  };

  const handleHealthChange = (health: ProjectHealth) => {
    updateMutation.mutate({ health });
  };

  const handlePriorityChange = (priority: ProjectPriority) => {
    updateMutation.mutate({ priority });
  };

  return (
    <div className="space-y-6 py-4">
      {/* Goal */}
      {project.goal && (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
            Goal
          </h3>
          <p className="text-sm text-foreground/90">{project.goal}</p>
        </div>
      )}

      {/* Properties Grid */}
      <div className="border border-border/30 rounded-lg divide-y divide-border/20 px-3">
        <PropertyRow label="Status">
          <Badge
            variant={getProjectStatusVariant(project.status)}
            size="sm"
            className="uppercase tracking-wider"
          >
            {project.status}
          </Badge>
        </PropertyRow>

        <PropertyRow label="Health">
          <Select
            value={project.health ?? 'on-track'}
            onValueChange={(v) => handleHealthChange(v as ProjectHealth)}
          >
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue>
                <HealthIndicator
                  health={(project.health ?? 'on-track') as ProjectHealth}
                  size="sm"
                />
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(['on-track', 'at-risk', 'off-track'] as ProjectHealth[]).map((h) => (
                <SelectItem key={h} value={h}>
                  <HealthIndicator health={h} size="sm" />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </PropertyRow>

        <PropertyRow label="Priority">
          <Select
            value={project.priority ?? 'none'}
            onValueChange={(v) => handlePriorityChange(v as ProjectPriority)}
          >
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(PRIORITY_CONFIG) as [ProjectPriority, string][]).map(
                ([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>
        </PropertyRow>

        <PropertyRow label="Lead">
          {editingField === 'lead' ? (
            <div className="flex items-center gap-2">
              <Input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="h-8 w-40 text-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveEdit('lead');
                  if (e.key === 'Escape') setEditingField(null);
                }}
              />
              <Button size="sm" variant="ghost" onClick={() => saveEdit('lead')}>
                Save
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => startEdit('lead', project.lead ?? '')}
              className="flex items-center gap-1.5 text-sm text-foreground/80 hover:text-foreground"
            >
              <User className="w-3.5 h-3.5" />
              {project.lead || 'Set lead...'}
            </button>
          )}
        </PropertyRow>

        <PropertyRow label="Members">
          <span className="flex items-center gap-1.5 text-sm text-foreground/80">
            <Users className="w-3.5 h-3.5" />
            {project.members?.length ? project.members.join(', ') : 'No members'}
          </span>
        </PropertyRow>

        <PropertyRow label="Start Date">
          <span className="flex items-center gap-1.5 text-sm text-foreground/80">
            <Calendar className="w-3.5 h-3.5" />
            {editingField === 'startDate' ? (
              <Input
                type="date"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="h-8 w-40 text-sm"
                autoFocus
                onBlur={() => saveEdit('startDate')}
              />
            ) : (
              <button
                type="button"
                onClick={() => startEdit('startDate', project.startDate ?? '')}
                className="hover:text-foreground"
              >
                {project.startDate || 'Set start date...'}
              </button>
            )}
          </span>
        </PropertyRow>

        <PropertyRow label="Target Date">
          <span className="flex items-center gap-1.5 text-sm text-foreground/80">
            <Target className="w-3.5 h-3.5" />
            {editingField === 'targetDate' ? (
              <Input
                type="date"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="h-8 w-40 text-sm"
                autoFocus
                onBlur={() => saveEdit('targetDate')}
              />
            ) : (
              <button
                type="button"
                onClick={() => startEdit('targetDate', project.targetDate ?? '')}
                className="hover:text-foreground"
              >
                {project.targetDate || 'Set target date...'}
              </button>
            )}
          </span>
        </PropertyRow>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="py-3 px-4 text-center">
          <div className="text-lg font-semibold text-foreground">{milestoneCount}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
            Milestones
          </div>
        </Card>
        <Card className="py-3 px-4 text-center">
          <div className="text-lg font-semibold text-foreground">{phaseCount}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Phases</div>
        </Card>
        <Card className="py-3 px-4 text-center">
          <div className="text-lg font-semibold text-foreground">
            {phaseCount > 0 ? Math.round((completedPhases / phaseCount) * 100) : 0}%
          </div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Complete</div>
        </Card>
      </div>
    </div>
  );
}
