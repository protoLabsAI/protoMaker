/**
 * HITL Form Store - Manages human-in-the-loop form dialog state
 *
 * Tracks pending forms, active form dialog, wizard step navigation,
 * and submission state.
 */

import { create } from 'zustand';
import type { HITLFormRequest } from '@automaker/types';

const DRAFT_STORAGE_PREFIX = 'hitl-draft-';

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
  /** Close dialog without cancelling — form stays pending on server */
  deferForm: () => void;
  nextStep: (data: Record<string, unknown>) => void;
  prevStep: () => void;
  setStepData: (stepIndex: number, data: Record<string, unknown>) => void;
  setSubmitting: (submitting: boolean) => void;
  /** Save draft step data to localStorage for a form */
  saveDraft: (formId: string, stepData: Record<string, unknown>[]) => void;
  /** Load draft step data from localStorage for a form */
  loadDraft: (formId: string) => Record<string, unknown>[] | null;
  /** Clear draft from localStorage */
  clearDraft: (formId: string) => void;
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

export const useHITLFormStore = create<HITLFormState & HITLFormActions>((set, get) => ({
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

  openForm: (form) => {
    // Restore draft data if available
    const draft = get().loadDraft(form.id);
    set({
      activeForm: form,
      isDialogOpen: true,
      currentStep: 0,
      stepData: draft ?? form.steps.map(() => ({})),
      isSubmitting: false,
    });
  },

  closeDialog: () =>
    set({
      isDialogOpen: false,
      activeForm: null,
      currentStep: 0,
      stepData: [],
      isSubmitting: false,
    }),

  deferForm: () => {
    const { activeForm, stepData } = get();
    if (activeForm) {
      get().saveDraft(activeForm.id, stepData);
    }
    set({
      isDialogOpen: false,
      activeForm: null,
      currentStep: 0,
      stepData: [],
      isSubmitting: false,
    });
  },

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

  saveDraft: (formId, stepData) => {
    try {
      localStorage.setItem(`${DRAFT_STORAGE_PREFIX}${formId}`, JSON.stringify(stepData));
    } catch {
      // localStorage full or unavailable — silently ignore
    }
  },

  loadDraft: (formId) => {
    try {
      const raw = localStorage.getItem(`${DRAFT_STORAGE_PREFIX}${formId}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  },

  clearDraft: (formId) => {
    try {
      localStorage.removeItem(`${DRAFT_STORAGE_PREFIX}${formId}`);
    } catch {
      // Ignore
    }
  },

  reset: () => set(initialState),
}));
