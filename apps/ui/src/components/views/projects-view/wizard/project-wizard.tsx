import { useEffect } from 'react';
import { ArrowLeft, Settings2, Trash2 } from 'lucide-react';
import { Button } from '@protolabsai/ui/atoms';
import { Spinner } from '@protolabsai/ui/atoms';
import { toast } from 'sonner';
import { useProject, useProjectDelete } from '../hooks/use-project';
import { useProjectWizardStore, type WizardStep } from '@/store/project-wizard-store';
import { WizardStepIndicator } from './wizard-step-indicator';
import { ProjectMetadataSheet } from './project-metadata-sheet';
import { DefineStep } from './steps/define-step';
import { ResearchStep } from './steps/research-step';
import { PrdStep } from './steps/prd-step';
import { PlanStep } from './steps/plan-step';
import { ReviewStep } from './steps/review-step';
import { LaunchStep } from './steps/launch-step';
import { useState } from 'react';

interface ProjectWizardProps {
  projectSlug: string | null;
  onBack: () => void;
}

export function ProjectWizard({ projectSlug, onBack }: ProjectWizardProps) {
  const { data: project, isLoading } = useProject(projectSlug);
  const deleteMutation = useProjectDelete();
  const [sheetOpen, setSheetOpen] = useState(false);

  const { currentStep, completedSteps, setStep, hydrateFromProject, reset } =
    useProjectWizardStore();

  // Hydrate wizard state from project data
  useEffect(() => {
    if (project) {
      hydrateFromProject(project);
    } else if (!projectSlug) {
      reset();
    }
  }, [project, projectSlug, hydrateFromProject, reset]);

  const handleDelete = () => {
    if (!projectSlug) return;
    deleteMutation.mutate(projectSlug, {
      onSuccess: () => {
        toast.success('Project deleted');
        onBack();
      },
      onError: () => toast.error('Failed to delete project'),
    });
  };

  const advanceToStep = (step: WizardStep) => {
    setStep(step);
  };

  if (isLoading && projectSlug) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const isNew = !projectSlug;
  const title = project?.title ?? 'New Project';
  const accentColor = project?.color;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-border/20">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to projects">
          <ArrowLeft className="size-4" />
        </Button>

        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold truncate">{title}</h1>
          {project?.goal && (
            <p className="text-xs text-muted-foreground truncate">{project.goal}</p>
          )}
        </div>

        {!isNew && (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSheetOpen(true)}
              aria-label="Project settings"
            >
              <Settings2 className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDelete}
              aria-label="Delete project"
              className="text-destructive/60 hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </Button>
          </>
        )}
      </div>

      {/* Step Indicator */}
      {!isNew && (
        <div className="shrink-0 border-b border-border/10">
          <WizardStepIndicator
            currentStep={currentStep}
            completedSteps={completedSteps}
            onStepClick={setStep}
            accentColor={accentColor}
          />
        </div>
      )}

      {/* Step Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 sm:px-8">
          {(isNew || currentStep === 'define') && (
            <DefineStep
              project={project ?? undefined}
              projectSlug={projectSlug}
              onCreated={(slug) => advanceToStep('research')}
              onContinue={() => advanceToStep('research')}
            />
          )}
          {!isNew && currentStep === 'research' && project && (
            <ResearchStep
              project={project}
              onContinue={() => advanceToStep('prd')}
              onSkip={() => advanceToStep('prd')}
            />
          )}
          {!isNew && currentStep === 'prd' && project && (
            <PrdStep
              project={project}
              projectSlug={projectSlug!}
              onContinue={() => advanceToStep('plan')}
            />
          )}
          {!isNew && currentStep === 'plan' && project && (
            <PlanStep
              project={project}
              projectSlug={projectSlug!}
              onContinue={() => advanceToStep('review')}
            />
          )}
          {!isNew && currentStep === 'review' && project && (
            <ReviewStep
              project={project}
              projectSlug={projectSlug!}
              onContinue={() => advanceToStep('launch')}
            />
          )}
          {!isNew && currentStep === 'launch' && project && (
            <LaunchStep project={project} projectSlug={projectSlug!} />
          )}
        </div>
      </div>

      {/* Metadata Sheet */}
      {!isNew && project && (
        <ProjectMetadataSheet
          project={project}
          projectSlug={projectSlug!}
          open={sheetOpen}
          onOpenChange={setSheetOpen}
        />
      )}
    </div>
  );
}
