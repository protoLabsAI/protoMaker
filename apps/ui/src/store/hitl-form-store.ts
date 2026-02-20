/**
 * HITL Form Store - Manages human-in-the-loop form dialog state
 *
 * Tracks pending forms, active form dialog, wizard step navigation,
 * and submission state.
 */

import { create } from 'zustand';
import type { HITLFormRequest } from '@automaker/types';

interface HITLFormState {
  /** Forms waiting for user response */
  pendingForms: HITLFormRequest[];
  /** Currently displayed form (dialog open) */
  activeForm: HITLFormRequest | null;
  /** Whether the dialog is open */
  isDialogOpen: boolean;
  /** Current wizard step (0-indexed) */
  currentStep: number;
  /** Accumulated data per step */
  stepData: Record<string, unknown>[];
  /** Whether a submission is in progress */
  isSubmitting: boolean;
}

interface HITLFormActions {
  addPendingForm: (form: HITLFormRequest) => void;
  removePendingForm: (formId: string) => void;
  openForm: (form: HITLFormRequest) => void;
  closeDialog: () => void;
  nextStep: (data: Record<string, unknown>) => void;
  prevStep: () => void;
  setStepData: (stepIndex: number, data: Record<string, unknown>) => void;
  setSubmitting: (submitting: boolean) => void;
  reset: () => void;
}

const initialState: HITLFormState = {
  pendingForms: [],
  activeForm: null,
  isDialogOpen: false,
  currentStep: 0,
  stepData: [],
  isSubmitting: false,
};

export const useHITLFormStore = create<HITLFormState & HITLFormActions>((set) => ({
  ...initialState,

  addPendingForm: (form) =>
    set((state) => {
      // Avoid duplicates
      if (state.pendingForms.some((f) => f.id === form.id)) return state;
      return { pendingForms: [...state.pendingForms, form] };
    }),

  removePendingForm: (formId) =>
    set((state) => ({
      pendingForms: state.pendingForms.filter((f) => f.id !== formId),
    })),

  openForm: (form) =>
    set({
      activeForm: form,
      isDialogOpen: true,
      currentStep: 0,
      stepData: form.steps.map(() => ({})),
      isSubmitting: false,
    }),

  closeDialog: () =>
    set({
      isDialogOpen: false,
      activeForm: null,
      currentStep: 0,
      stepData: [],
      isSubmitting: false,
    }),

  nextStep: (data) =>
    set((state) => {
      const newStepData = [...state.stepData];
      newStepData[state.currentStep] = data;
      return {
        stepData: newStepData,
        currentStep: state.currentStep + 1,
      };
    }),

  prevStep: () =>
    set((state) => ({
      currentStep: Math.max(0, state.currentStep - 1),
    })),

  setStepData: (stepIndex, data) =>
    set((state) => {
      const newStepData = [...state.stepData];
      newStepData[stepIndex] = data;
      return { stepData: newStepData };
    }),

  setSubmitting: (submitting) => set({ isSubmitting: submitting }),

  reset: () => set(initialState),
}));
