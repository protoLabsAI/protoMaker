import { useState, useEffect } from 'react';
import { Button } from '@protolabsai/ui/atoms';
import { ArrowRight } from 'lucide-react';
import type { Project } from '@protolabsai/types';
import { useCreateProject, useProjectUpdate } from '../../hooks/use-project';
import { useProjectWizardStore } from '@/store/project-wizard-store';
import { EnhanceWithAI } from '@/components/shared/enhancement';

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
];

const PRIORITIES = ['urgent', 'high', 'medium', 'low', 'none'] as const;

interface DefineStepProps {
  project?: Project;
  projectSlug: string | null;
  onCreated: (slug: string) => void;
  onContinue: () => void;
}

export function DefineStep({ project, projectSlug, onCreated, onContinue }: DefineStepProps) {
  const createMutation = useCreateProject();
  const updateMutation = useProjectUpdate(projectSlug ?? '');
  const markCompleted = useProjectWizardStore((s) => s.markCompleted);

  const [title, setTitle] = useState(project?.title ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [goal, setGoal] = useState(project?.goal ?? '');
  const [priority, setPriority] = useState(project?.priority ?? 'medium');
  const [color, setColor] = useState(project?.color ?? '#6366f1');
  const [researchOnCreate, setResearchOnCreate] = useState(false);

  useEffect(() => {
    if (project) {
      setTitle(project.title ?? '');
      setDescription(project.description ?? '');
      setGoal(project.goal ?? '');
      setPriority(project.priority ?? 'medium');
      setColor(project.color ?? '#6366f1');
    }
  }, [project]);

  const isNew = !projectSlug;
  const canSubmit = title.trim() && goal.trim();
  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = () => {
    if (!canSubmit) return;

    if (isNew) {
      createMutation.mutate(
        {
          title: title.trim(),
          goal: goal.trim(),
          description: description.trim() || undefined,
          color,
          priority,
          researchOnCreate,
        },
        {
          onSuccess: (result) => {
            if (result.localSlug) {
              markCompleted('define');
              onCreated(result.localSlug);
            }
          },
        }
      );
    } else {
      updateMutation.mutate(
        {
          title: title.trim(),
          goal: goal.trim(),
          description: description.trim() || undefined,
          color,
          priority,
        },
        {
          onSuccess: () => {
            markCompleted('define');
            onContinue();
          },
        }
      );
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Define your project</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Start with a clear title and goal. You can refine everything later.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_240px] gap-6">
        {/* Left column — primary fields */}
        <div className="space-y-4">
          {/* Title */}
          <div className="space-y-1.5">
            <label htmlFor="project-title" className="text-xs font-medium text-muted-foreground">
              Title
            </label>
            <input
              id="project-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Auth system overhaul"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Goal */}
          <div className="space-y-1.5">
            <label htmlFor="project-goal" className="text-xs font-medium text-muted-foreground">
              Goal
            </label>
            <textarea
              id="project-goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="What should this project accomplish?"
              rows={3}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <EnhanceWithAI
              value={goal}
              onChange={setGoal}
              modes={['improve', 'expand', 'technical']}
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label
              htmlFor="project-description"
              className="text-xs font-medium text-muted-foreground"
            >
              Description <span className="text-muted-foreground/50">(optional)</span>
            </label>
            <textarea
              id="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Additional context, constraints, or background..."
              rows={4}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <EnhanceWithAI
              value={description}
              onChange={setDescription}
              modes={['improve', 'expand', 'research']}
            />
          </div>
        </div>

        {/* Right column — metadata */}
        <div className="space-y-4">
          {/* Priority */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Priority</label>
            <div className="flex flex-wrap gap-1.5">
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    priority === p
                      ? 'bg-foreground/10 text-foreground ring-1 ring-foreground/20'
                      : 'bg-muted/40 text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Color */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Color</label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`size-7 rounded-full transition-all ${
                    color === c ? 'ring-2 ring-offset-2 ring-offset-background ring-white/40' : ''
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={`Color ${c}`}
                />
              ))}
              <label className="size-7 rounded-full border border-dashed border-border flex items-center justify-center cursor-pointer hover:bg-muted/50">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="sr-only"
                />
                <span className="text-xs text-muted-foreground">+</span>
              </label>
            </div>
          </div>

          {/* Research toggle (new projects only) */}
          {isNew && (
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={researchOnCreate}
                  onChange={(e) => setResearchOnCreate(e.target.checked)}
                  className="rounded border-border"
                />
                <span className="text-xs text-muted-foreground">Start with deep research</span>
              </label>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end pt-2">
        <Button onClick={handleSubmit} disabled={!canSubmit || isPending} loading={isPending}>
          {isNew ? 'Create & Continue' : 'Save & Continue'}
          <ArrowRight className="size-4 ml-1.5" />
        </Button>
      </div>
    </div>
  );
}
