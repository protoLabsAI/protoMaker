import { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@protolabsai/ui/atoms';
import { Button, Input, Textarea, Label, Switch } from '@protolabsai/ui/atoms';
import { Loader2, Plus, Palette } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCreateProject } from '../hooks/use-project';

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

const PRIORITIES = [
  { value: 'urgent', label: 'Urgent', className: 'bg-red-500/20 text-red-400 border-red-500/40' },
  {
    value: 'high',
    label: 'High',
    className: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
  },
  {
    value: 'medium',
    label: 'Medium',
    className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
  },
  { value: 'low', label: 'Low', className: 'bg-blue-500/20 text-blue-400 border-blue-500/40' },
  { value: 'none', label: 'None', className: 'bg-muted text-muted-foreground border-border' },
] as const;

interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewProjectDialog({ open, onOpenChange }: NewProjectDialogProps) {
  const [title, setTitle] = useState('');
  const [goal, setGoal] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('');
  const [priority, setPriority] = useState('medium');
  const [researchOnCreate, setResearchOnCreate] = useState(false);
  const colorInputRef = useRef<HTMLInputElement>(null);

  const createMutation = useCreateProject();

  const handleSubmit = () => {
    if (!title.trim()) return;
    if (!goal.trim()) return;
    createMutation.mutate(
      {
        title: title.trim(),
        goal: goal.trim(),
        description: description.trim() || undefined,
        color: color || undefined,
        priority,
        researchOnCreate,
      },
      {
        onSuccess: () => {
          handleOpenChange(false);
        },
      }
    );
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setTitle('');
      setGoal('');
      setDescription('');
      setColor('');
      setPriority('medium');
      setResearchOnCreate(false);
    }
    onOpenChange(next);
  };

  const isPending = createMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="project-title">Title</Label>
            <Input
              id="project-title"
              placeholder="Project title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              autoFocus
            />
          </div>

          {/* Goal */}
          <div className="space-y-1.5">
            <Label htmlFor="project-goal">Goal</Label>
            <Textarea
              id="project-goal"
              placeholder="Describe the project goal..."
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              rows={3}
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="project-description">Description</Label>
            <Textarea
              id="project-description"
              placeholder="Additional context or idea description..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          {/* Priority */}
          <div className="space-y-1.5">
            <Label>Priority</Label>
            <div className="flex items-center gap-1.5">
              {PRIORITIES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-xs font-medium border transition-all',
                    priority === p.value
                      ? p.className
                      : 'bg-transparent text-muted-foreground border-transparent hover:bg-muted'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Color */}
          <div className="space-y-1.5">
            <Label>Color</Label>
            <div className="flex items-center gap-1.5 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(color === c ? '' : c)}
                  className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{
                    backgroundColor: c,
                    borderColor: color === c ? 'white' : 'transparent',
                    boxShadow: color === c ? `0 0 0 2px ${c}` : undefined,
                  }}
                  aria-label={`Set color ${c}`}
                  aria-pressed={color === c}
                />
              ))}
              <button
                type="button"
                onClick={() => colorInputRef.current?.click()}
                className="w-6 h-6 rounded-full border border-dashed border-border flex items-center justify-center hover:border-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Custom color"
              >
                <Palette className="w-3 h-3 text-muted-foreground" />
              </button>
              <input
                ref={colorInputRef}
                type="color"
                value={color || '#6366f1'}
                onChange={(e) => setColor(e.target.value)}
                className="sr-only"
                aria-label="Custom color picker"
              />
            </div>
          </div>

          {/* Start with research toggle */}
          <div className="flex items-center justify-between pt-1">
            <div className="space-y-0.5">
              <Label htmlFor="research-toggle" className="text-sm font-medium">
                Start with research
              </Label>
              <p className="text-xs text-muted-foreground">
                Auto-run a research pass when the project is created
              </p>
            </div>
            <Switch
              id="research-toggle"
              checked={researchOnCreate}
              onCheckedChange={setResearchOnCreate}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={isPending || !title.trim() || !goal.trim()}
          >
            {isPending ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5 mr-1.5" />
            )}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
