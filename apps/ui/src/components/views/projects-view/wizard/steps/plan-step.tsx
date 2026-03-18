import { useState, useEffect } from 'react';
import { ArrowRight, Plus, Trash2, GripVertical, ChevronDown, ChevronRight } from 'lucide-react';
import { Button, Badge } from '@protolabsai/ui/atoms';
import { toast } from 'sonner';
import type { Project, Milestone, Phase } from '@protolabsai/types';
import { useSaveMilestones } from '../../hooks/use-project';
import { useProjectWizardStore } from '@/store/project-wizard-store';

interface PlanStepProps {
  project: Project;
  projectSlug: string;
  onContinue: () => void;
}

type EditableMilestone = {
  id: string;
  title: string;
  description: string;
  targetDate?: string;
  phases: EditablePhase[];
  expanded: boolean;
};

type EditablePhase = {
  id: string;
  title: string;
  description: string;
  complexity: 'small' | 'medium' | 'large';
  filesToModify: string[];
  acceptanceCriteria: string[];
};

function createEmptyPhase(): EditablePhase {
  return {
    id: crypto.randomUUID(),
    title: '',
    description: '',
    complexity: 'medium',
    filesToModify: [],
    acceptanceCriteria: [''],
  };
}

function createEmptyMilestone(): EditableMilestone {
  return {
    id: crypto.randomUUID(),
    title: '',
    description: '',
    phases: [createEmptyPhase()],
    expanded: true,
  };
}

function projectMilestonesToEditable(milestones: Milestone[]): EditableMilestone[] {
  return milestones.map((m) => ({
    id: m.slug ?? crypto.randomUUID(),
    title: m.title,
    description: m.description ?? '',
    targetDate: m.targetDate,
    expanded: true,
    phases: (m.phases ?? []).map((p) => ({
      id: p.name ?? crypto.randomUUID(),
      title: p.title,
      description: p.description ?? '',
      complexity: (p.complexity as 'small' | 'medium' | 'large') ?? 'medium',
      filesToModify: p.filesToModify ?? [],
      acceptanceCriteria: p.acceptanceCriteria ?? [''],
    })),
  }));
}

function editableToMilestones(editable: EditableMilestone[]): Milestone[] {
  return editable
    .filter((m) => m.title.trim())
    .map((m, mi) => ({
      slug: m.id,
      title: m.title.trim(),
      description: m.description.trim() || '',
      targetDate: m.targetDate || undefined,
      number: mi + 1,
      status: 'planned' as const,
      phases: m.phases
        .filter((p) => p.title.trim())
        .map((p, pi) => ({
          name: p.id,
          title: p.title.trim(),
          description: p.description.trim() || '',
          complexity: p.complexity,
          number: pi + 1,
          filesToModify: p.filesToModify.filter(Boolean),
          acceptanceCriteria: p.acceptanceCriteria.filter(Boolean),
        })),
    }));
}

const COMPLEXITY_COLORS: Record<string, string> = {
  small: 'bg-emerald-500/10 text-emerald-400',
  medium: 'bg-amber-500/10 text-amber-400',
  large: 'bg-red-500/10 text-red-400',
};

export function PlanStep({ project, projectSlug, onContinue }: PlanStepProps) {
  const saveMutation = useSaveMilestones(projectSlug);
  const markCompleted = useProjectWizardStore((s) => s.markCompleted);

  const [milestones, setMilestones] = useState<EditableMilestone[]>(() => {
    if (project.milestones && project.milestones.length > 0) {
      return projectMilestonesToEditable(project.milestones);
    }
    return [createEmptyMilestone()];
  });

  useEffect(() => {
    if (project.milestones && project.milestones.length > 0) {
      setMilestones(projectMilestonesToEditable(project.milestones));
    }
  }, [project.milestones]);

  const updateMilestone = (index: number, updates: Partial<EditableMilestone>) => {
    setMilestones((prev) => prev.map((m, i) => (i === index ? { ...m, ...updates } : m)));
  };

  const removeMilestone = (index: number) => {
    setMilestones((prev) => prev.filter((_, i) => i !== index));
  };

  const addMilestone = () => {
    setMilestones((prev) => [...prev, createEmptyMilestone()]);
  };

  const updatePhase = (mIndex: number, pIndex: number, updates: Partial<EditablePhase>) => {
    setMilestones((prev) =>
      prev.map((m, mi) =>
        mi === mIndex
          ? {
              ...m,
              phases: m.phases.map((p, pi) => (pi === pIndex ? { ...p, ...updates } : p)),
            }
          : m
      )
    );
  };

  const removePhase = (mIndex: number, pIndex: number) => {
    setMilestones((prev) =>
      prev.map((m, mi) =>
        mi === mIndex ? { ...m, phases: m.phases.filter((_, pi) => pi !== pIndex) } : m
      )
    );
  };

  const addPhase = (mIndex: number) => {
    setMilestones((prev) =>
      prev.map((m, mi) => (mi === mIndex ? { ...m, phases: [...m.phases, createEmptyPhase()] } : m))
    );
  };

  const handleSave = () => {
    const converted = editableToMilestones(milestones);
    if (converted.length === 0) {
      toast.error('Add at least one milestone with a title');
      return;
    }
    saveMutation.mutate(converted, {
      onSuccess: () => {
        toast.success(`Saved ${converted.length} milestones`);
        markCompleted('plan');
        onContinue();
      },
      onError: () => toast.error('Failed to save milestones'),
    });
  };

  const totalPhases = milestones.reduce(
    (acc, m) => acc + m.phases.filter((p) => p.title.trim()).length,
    0
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Implementation Plan</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Break the project into milestones and phases. Each phase becomes a feature on the board.
        </p>
      </div>

      {/* Milestone list */}
      <div className="space-y-4">
        {milestones.map((milestone, mIndex) => (
          <div
            key={milestone.id}
            className="rounded-lg border border-border/20 bg-muted/5 overflow-hidden"
          >
            {/* Milestone header */}
            <div className="flex items-center gap-2 px-3 py-2 bg-muted/10">
              <GripVertical className="size-3.5 text-muted-foreground/30 shrink-0" />
              <button
                type="button"
                onClick={() => updateMilestone(mIndex, { expanded: !milestone.expanded })}
                className="shrink-0"
              >
                {milestone.expanded ? (
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="size-3.5 text-muted-foreground" />
                )}
              </button>
              <input
                value={milestone.title}
                onChange={(e) => updateMilestone(mIndex, { title: e.target.value })}
                placeholder={`Milestone ${mIndex + 1}`}
                className="flex-1 bg-transparent text-sm font-medium focus:outline-none placeholder:text-muted-foreground/40"
              />
              <Badge variant="secondary" className="text-xs shrink-0">
                {milestone.phases.length} {milestone.phases.length === 1 ? 'phase' : 'phases'}
              </Badge>
              <button
                type="button"
                onClick={() => removeMilestone(mIndex)}
                className="text-muted-foreground/40 hover:text-destructive transition-colors"
                aria-label="Remove milestone"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>

            {milestone.expanded && (
              <div className="px-3 pb-3 space-y-3 pt-2">
                {/* Milestone description */}
                <textarea
                  value={milestone.description}
                  onChange={(e) => updateMilestone(mIndex, { description: e.target.value })}
                  placeholder="Milestone description..."
                  rows={2}
                  className="w-full rounded-md border border-border/20 bg-background px-3 py-1.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                />

                {/* Phases */}
                <div className="space-y-2 pl-4 border-l border-border/10">
                  {milestone.phases.map((phase, pIndex) => (
                    <div key={phase.id} className="space-y-2 rounded-md bg-muted/10 p-2.5">
                      <div className="flex items-center gap-2">
                        <input
                          value={phase.title}
                          onChange={(e) => updatePhase(mIndex, pIndex, { title: e.target.value })}
                          placeholder={`Phase ${pIndex + 1}`}
                          className="flex-1 bg-transparent text-xs font-medium focus:outline-none placeholder:text-muted-foreground/40"
                        />
                        <select
                          value={phase.complexity}
                          onChange={(e) =>
                            updatePhase(mIndex, pIndex, {
                              complexity: e.target.value as 'small' | 'medium' | 'large',
                            })
                          }
                          className={`rounded-md px-2 py-0.5 text-xs border-0 ${COMPLEXITY_COLORS[phase.complexity]}`}
                        >
                          <option value="small">Small</option>
                          <option value="medium">Medium</option>
                          <option value="large">Large</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => removePhase(mIndex, pIndex)}
                          className="text-muted-foreground/30 hover:text-destructive"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                      <textarea
                        value={phase.description}
                        onChange={(e) =>
                          updatePhase(mIndex, pIndex, { description: e.target.value })
                        }
                        placeholder="Phase description..."
                        rows={2}
                        className="w-full rounded-md border border-border/10 bg-background px-2 py-1 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                      />

                      {/* Acceptance criteria */}
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground/60">
                          Acceptance criteria
                        </span>
                        {phase.acceptanceCriteria.map((criterion, cIndex) => (
                          <div key={cIndex} className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground/40">-</span>
                            <input
                              value={criterion}
                              onChange={(e) => {
                                const updated = [...phase.acceptanceCriteria];
                                updated[cIndex] = e.target.value;
                                updatePhase(mIndex, pIndex, { acceptanceCriteria: updated });
                              }}
                              placeholder="Criterion..."
                              className="flex-1 bg-transparent text-xs focus:outline-none placeholder:text-muted-foreground/30"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  const updated = [...phase.acceptanceCriteria];
                                  updated.splice(cIndex + 1, 0, '');
                                  updatePhase(mIndex, pIndex, { acceptanceCriteria: updated });
                                }
                                if (
                                  e.key === 'Backspace' &&
                                  criterion === '' &&
                                  phase.acceptanceCriteria.length > 1
                                ) {
                                  const updated = phase.acceptanceCriteria.filter(
                                    (_, i) => i !== cIndex
                                  );
                                  updatePhase(mIndex, pIndex, { acceptanceCriteria: updated });
                                }
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => addPhase(mIndex)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
                  >
                    <Plus className="size-3" />
                    Add phase
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addMilestone}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <Plus className="size-4" />
        Add milestone
      </button>

      {/* Summary + actions */}
      <div className="flex items-center justify-between pt-2">
        <span className="text-xs text-muted-foreground">
          {milestones.filter((m) => m.title.trim()).length} milestones, {totalPhases} phases
        </span>
        <Button onClick={handleSave} loading={saveMutation.isPending}>
          Save & Continue
          <ArrowRight className="size-4 ml-1.5" />
        </Button>
      </div>
    </div>
  );
}
