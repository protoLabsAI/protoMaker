import { create } from 'zustand';
import type { Project } from '@protolabsai/types';

export type WizardStep = 'define' | 'research' | 'prd' | 'plan' | 'review' | 'launch';

export const WIZARD_STEPS: WizardStep[] = ['define', 'research', 'prd', 'plan', 'review', 'launch'];

export const WIZARD_STEP_LABELS: Record<WizardStep, string> = {
  define: 'Define',
  research: 'Research',
  prd: 'PRD',
  plan: 'Plan',
  review: 'Review',
  launch: 'Launch',
};

interface ProjectWizardState {
  currentStep: WizardStep;
  completedSteps: Set<WizardStep>;
  isNew: boolean;
  setStep: (step: WizardStep) => void;
  markCompleted: (step: WizardStep) => void;
  reset: () => void;
  hydrateFromProject: (project: Project) => void;
}

function deriveCompletedSteps(project: Project): Set<WizardStep> {
  const completed = new Set<WizardStep>();

  // define: title + goal exist
  if (project.title && project.goal) {
    completed.add('define');
  }

  // research: researchStatus === 'complete' (optional step)
  if ((project as unknown as { researchStatus?: string }).researchStatus === 'complete') {
    completed.add('research');
  }

  // prd: prd exists with non-empty sections
  if (project.prd && (project.prd.situation || project.prd.problem || project.prd.approach)) {
    completed.add('prd');
  }

  // plan: milestones with phases
  if (project.milestones && project.milestones.length > 0) {
    const hasPhases = project.milestones.some((m) => m.phases && m.phases.length > 0);
    if (hasPhases) {
      completed.add('plan');
    }
  }

  // review: status is 'approved' or later
  const approvedStatuses = ['approved', 'scaffolded', 'active', 'completed'];
  if (project.status && approvedStatuses.includes(project.status)) {
    completed.add('review');
  }

  // launch: status is 'active' or later
  const launchedStatuses = ['active', 'completed'];
  if (project.status && launchedStatuses.includes(project.status)) {
    completed.add('launch');
  }

  return completed;
}

function deriveCurrentStep(completed: Set<WizardStep>): WizardStep {
  // Find the first incomplete step
  for (const step of WIZARD_STEPS) {
    if (!completed.has(step)) {
      // research is optional — if define is done and research is not, still show research
      return step;
    }
  }
  return 'launch';
}

export const useProjectWizardStore = create<ProjectWizardState>((set) => ({
  currentStep: 'define',
  completedSteps: new Set<WizardStep>(),
  isNew: true,

  setStep: (step) => set({ currentStep: step }),

  markCompleted: (step) =>
    set((state) => {
      const next = new Set(state.completedSteps);
      next.add(step);
      return { completedSteps: next };
    }),

  reset: () =>
    set({
      currentStep: 'define',
      completedSteps: new Set<WizardStep>(),
      isNew: true,
    }),

  hydrateFromProject: (project) => {
    const completed = deriveCompletedSteps(project);
    const currentStep = deriveCurrentStep(completed);
    set({
      completedSteps: completed,
      currentStep,
      isNew: false,
    });
  },
}));
