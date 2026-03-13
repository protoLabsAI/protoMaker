import { useState, useRef } from 'react';
import { Calendar, User, Users, Target, X, Palette } from 'lucide-react';
import { Badge, Input } from '@protolabsai/ui/atoms';
import { Button } from '@protolabsai/ui/atoms';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@protolabsai/ui/atoms';
import { HealthIndicator } from './health-indicator';
import { getProjectStatusVariant } from '../lib/status-variants';
import { useProjectUpdate } from '../hooks/use-project';
import { InlineEditor } from '@/components/shared/inline-editor';
import type { Project, ProjectHealth, ProjectPriority } from '@protolabsai/types';
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

const PRESET_COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#64748b',
];

export function ProjectSidebar({ project, isOpen }: { project: Project; isOpen?: boolean }) {
  const updateMutation = useProjectUpdate(project.slug);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [newMember, setNewMember] = useState('');
  const colorInputRef = useRef<HTMLInputElement>(null);

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

  const handleAddMember = () => {
    const trimmed = newMember.trim();
    if (!trimmed) return;
    const current = project.members ?? [];
    if (current.includes(trimmed)) {
      setNewMember('');
      return;
    }
    const updated = [...current, trimmed];
    updateMutation.mutate(
      { members: updated },
      {
        onSuccess: () => {
          setNewMember('');
          toast.success('Member added');
        },
      }
    );
  };

  const handleRemoveMember = (member: string) => {
    const updated = (project.members ?? []).filter((m) => m !== member);
    updateMutation.mutate(
      { members: updated },
      {
        onSuccess: () => toast.success('Member removed'),
      }
    );
  };

  const handleColorChange = (color: string) => {
    updateMutation.mutate(
      { color },
      {
        onSuccess: () => toast.success('Color updated'),
      }
    );
  };

  return (
    <div
      className={`w-72 shrink-0 border-r border-border/40 overflow-y-auto px-4 py-4 space-y-4 ${isOpen ? 'block' : 'hidden'} md:block`}
    >
      {/* Goal */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
          Goal
        </h3>
        <InlineEditor
          content={project.goal || ''}
          placeholder="Describe the project goal..."
          className="text-sm text-foreground/90"
          isSaving={updateMutation.isPending}
          onSave={(html) => {
            updateMutation.mutate(
              { goal: html },
              { onSuccess: () => toast.success('Goal updated') }
            );
          }}
        />
      </div>

      {/* Properties */}
      <div className="divide-y divide-border/20">
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
            <SelectTrigger className="h-8 w-full text-xs">
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
            <SelectTrigger className="h-8 w-full text-xs">
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
                className="h-8 w-full text-sm"
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
          <div className="flex flex-col gap-1.5">
            {/* Existing member tags */}
            {(project.members ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1">
                {(project.members ?? []).map((member) => (
                  <span
                    key={member}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-xs text-foreground/80"
                  >
                    <Users className="w-3 h-3" />
                    {member}
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(member)}
                      className="ml-0.5 text-muted-foreground hover:text-foreground"
                      aria-label={`Remove ${member}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {/* Add member input */}
            <div className="flex items-center gap-1.5">
              <Input
                value={newMember}
                onChange={(e) => setNewMember(e.target.value)}
                placeholder="Add member..."
                className="h-7 text-xs flex-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddMember();
                  }
                  if (e.key === 'Escape') setNewMember('');
                }}
              />
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={handleAddMember}
                disabled={!newMember.trim() || updateMutation.isPending}
              >
                Add
              </Button>
            </div>
          </div>
        </PropertyRow>

        <PropertyRow label="Color">
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Preset palette */}
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => handleColorChange(c)}
                className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{
                  backgroundColor: c,
                  borderColor: project.color === c ? 'white' : 'transparent',
                  boxShadow: project.color === c ? `0 0 0 2px ${c}` : undefined,
                }}
                aria-label={`Set color ${c}`}
                aria-pressed={project.color === c}
              />
            ))}
            {/* Custom color input */}
            <button
              type="button"
              onClick={() => colorInputRef.current?.click()}
              className="w-5 h-5 rounded-full border border-dashed border-border flex items-center justify-center hover:border-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Custom color"
            >
              <Palette className="w-3 h-3 text-muted-foreground" />
            </button>
            <input
              ref={colorInputRef}
              type="color"
              value={project.color ?? '#6366f1'}
              onChange={(e) => handleColorChange(e.target.value)}
              className="sr-only"
              aria-label="Custom color picker"
            />
            {/* Clear color */}
            {project.color && (
              <button
                type="button"
                onClick={() => handleColorChange('')}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </PropertyRow>

        <PropertyRow label="Start Date">
          <span className="flex items-center gap-1.5 text-sm text-foreground/80">
            <Calendar className="w-3.5 h-3.5" />
            {editingField === 'startDate' ? (
              <Input
                type="date"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="h-8 w-full text-sm"
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
                className="h-8 w-full text-sm"
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
    </div>
  );
}
