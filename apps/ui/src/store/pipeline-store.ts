import { create } from 'zustand';
import type { PipelineConfig, PipelineStep } from '@protolabs-ai/types';

interface PipelineState {
  pipelineConfigByProject: Record<string, PipelineConfig>;
}

interface PipelineActions {
  setPipelineConfig: (projectPath: string, config: PipelineConfig) => void;
  getPipelineConfig: (projectPath: string) => PipelineConfig | null;
  addPipelineStep: (
    projectPath: string,
    step: Omit<PipelineStep, 'id' | 'createdAt' | 'updatedAt'>
  ) => PipelineStep;
  updatePipelineStep: (
    projectPath: string,
    stepId: string,
    updates: Partial<Omit<PipelineStep, 'id' | 'createdAt'>>
  ) => void;
  deletePipelineStep: (projectPath: string, stepId: string) => void;
  reorderPipelineSteps: (projectPath: string, stepIds: string[]) => void;
}

export const usePipelineStore = create<PipelineState & PipelineActions>()((set, get) => ({
  pipelineConfigByProject: {},

  setPipelineConfig: (projectPath, config) => {
    set({
      pipelineConfigByProject: {
        ...get().pipelineConfigByProject,
        [projectPath]: config,
      },
    });
  },

  getPipelineConfig: (projectPath) => {
    return get().pipelineConfigByProject[projectPath] || null;
  },

  addPipelineStep: (projectPath, step) => {
    const config = get().pipelineConfigByProject[projectPath] || { version: 1, steps: [] };
    const now = new Date().toISOString();
    const newStep: PipelineStep = {
      ...step,
      id: `step_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`,
      createdAt: now,
      updatedAt: now,
    };

    const newSteps = [...config.steps, newStep].sort((a, b) => a.order - b.order);
    newSteps.forEach((s, index) => {
      s.order = index;
    });

    set({
      pipelineConfigByProject: {
        ...get().pipelineConfigByProject,
        [projectPath]: { ...config, steps: newSteps },
      },
    });

    return newStep;
  },

  updatePipelineStep: (projectPath, stepId, updates) => {
    const config = get().pipelineConfigByProject[projectPath];
    if (!config) return;

    const stepIndex = config.steps.findIndex((s) => s.id === stepId);
    if (stepIndex === -1) return;

    const updatedSteps = [...config.steps];
    updatedSteps[stepIndex] = {
      ...updatedSteps[stepIndex],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    set({
      pipelineConfigByProject: {
        ...get().pipelineConfigByProject,
        [projectPath]: { ...config, steps: updatedSteps },
      },
    });
  },

  deletePipelineStep: (projectPath, stepId) => {
    const config = get().pipelineConfigByProject[projectPath];
    if (!config) return;

    const newSteps = config.steps.filter((s) => s.id !== stepId);
    newSteps.forEach((s, index) => {
      s.order = index;
    });

    set({
      pipelineConfigByProject: {
        ...get().pipelineConfigByProject,
        [projectPath]: { ...config, steps: newSteps },
      },
    });
  },

  reorderPipelineSteps: (projectPath, stepIds) => {
    const config = get().pipelineConfigByProject[projectPath];
    if (!config) return;

    const stepMap = new Map(config.steps.map((s) => [s.id, s]));
    const reorderedSteps = stepIds
      .map((id, index) => {
        const step = stepMap.get(id);
        if (!step) return null;
        return { ...step, order: index, updatedAt: new Date().toISOString() };
      })
      .filter((s): s is PipelineStep => s !== null);

    set({
      pipelineConfigByProject: {
        ...get().pipelineConfigByProject,
        [projectPath]: { ...config, steps: reorderedSteps },
      },
    });
  },
}));
