import { useState } from 'react';
import { ArrowRight, Sparkles, ChevronDown, ChevronRight } from 'lucide-react';
import Markdown from 'react-markdown';
import { Button, Spinner } from '@protolabsai/ui/atoms';
import { toast } from 'sonner';
import type { Project } from '@protolabsai/types';
import { useGeneratePrd, useProjectUpdate } from '../../hooks/use-project';
import { useProjectWizardStore } from '@/store/project-wizard-store';
import { InlineEditor } from '@/components/shared/inline-editor';
import { EnhanceWithAI } from '@/components/shared/enhancement';

const SPARC_SECTIONS = [
  { key: 'situation', label: 'Situation', borderColor: 'border-l-blue-400/60' },
  { key: 'problem', label: 'Problem', borderColor: 'border-l-red-400/60' },
  { key: 'approach', label: 'Approach', borderColor: 'border-l-emerald-400/60' },
  { key: 'results', label: 'Results', borderColor: 'border-l-amber-400/60' },
  { key: 'constraints', label: 'Constraints', borderColor: 'border-l-violet-400/60' },
] as const;

interface PrdStepProps {
  project: Project;
  projectSlug: string;
  onContinue: () => void;
}

export function PrdStep({ project, projectSlug, onContinue }: PrdStepProps) {
  const generateMutation = useGeneratePrd(projectSlug);
  const updateMutation = useProjectUpdate(projectSlug);
  const markCompleted = useProjectWizardStore((s) => s.markCompleted);

  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(project.prd ? [] : ['situation'])
  );

  const hasPrd = project.prd && (project.prd.situation || project.prd.problem);

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleGenerate = () => {
    generateMutation.mutate(undefined, {
      onSuccess: (res) => {
        if (res.success) {
          toast.success('PRD generated');
          // Expand all sections after generation
          setExpandedSections(new Set(SPARC_SECTIONS.map((s) => s.key)));
        } else {
          toast.error(res.error ?? 'Failed to generate PRD');
        }
      },
      onError: () => toast.error('Failed to generate PRD'),
    });
  };

  const handleSectionSave = (key: string, html: string) => {
    updateMutation.mutate(
      { prd: { ...project.prd, [key]: html } },
      { onSuccess: () => toast.success(`${key.charAt(0).toUpperCase() + key.slice(1)} updated`) }
    );
  };

  const handleContinue = () => {
    markCompleted('prd');
    onContinue();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">Product Requirements</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {hasPrd
              ? 'Edit the SPARC PRD sections below, or regenerate with AI.'
              : 'Generate a structured PRD with AI, or write it manually.'}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleGenerate}
          loading={generateMutation.isPending}
          disabled={generateMutation.isPending}
        >
          <Sparkles className="size-4 mr-1.5" />
          {hasPrd ? 'Regenerate' : 'Generate PRD'}
        </Button>
      </div>

      {generateMutation.isPending && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Spinner size="lg" />
          <p className="text-sm text-muted-foreground">Generating PRD...</p>
        </div>
      )}

      {!generateMutation.isPending && (
        <div className="space-y-2">
          {SPARC_SECTIONS.map(({ key, label, borderColor }) => {
            const content = (project.prd?.[key as keyof typeof project.prd] as string) ?? '';
            const isExpanded = expandedSections.has(key);

            return (
              <div key={key} className={`border-l-2 ${borderColor} rounded-r-lg bg-muted/5`}>
                <button
                  type="button"
                  className="flex items-center gap-2 w-full px-3 py-2.5 text-left hover:bg-muted/20 transition-colors"
                  onClick={() => toggleSection(key)}
                >
                  {isExpanded ? (
                    <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
                  )}
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {label}
                  </span>
                  {!content && (
                    <span className="text-xs text-muted-foreground/40 ml-auto">Empty</span>
                  )}
                </button>
                {isExpanded && (
                  <div className="px-3 pb-3 space-y-2">
                    <InlineEditor
                      content={content}
                      onSave={(html) => handleSectionSave(key, html)}
                      isSaving={updateMutation.isPending}
                      placeholder={`Describe the ${label.toLowerCase()}...`}
                      className="prose prose-sm prose-invert max-w-none prose-p:text-foreground/90 prose-headings:text-foreground prose-li:text-foreground/90 prose-strong:text-foreground"
                    />
                    <EnhanceWithAI
                      value={content}
                      onChange={(enhanced) => handleSectionSave(key, enhanced)}
                      modes={['improve', 'expand', 'technical']}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex justify-end pt-2">
        <Button onClick={handleContinue} disabled={!hasPrd}>
          Continue
          <ArrowRight className="size-4 ml-1.5" />
        </Button>
      </div>
    </div>
  );
}
