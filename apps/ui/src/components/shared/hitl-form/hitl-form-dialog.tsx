/**
 * HITL Form Dialog — Root dialog component that renders at the layout level.
 * Reads from the HITL form store to show/hide and render the active form.
 *
 * Single-step forms render directly. Multi-step forms use the wizard wrapper.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Textarea,
} from '@protolabs-ai/ui/atoms';
import { Button } from '@protolabs-ai/ui/atoms';
import { Loader2, Send, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useHITLFormStore } from '@/store/hitl-form-store';
import { getHttpApiClient } from '@/lib/http-api-client';
import { HITLFormStepRenderer, HITLFormWizard } from '@protolabs-ai/ui/organisms';

export function HITLFormDialog() {
  const {
    activeForm,
    isDialogOpen,
    isSubmitting,
    stepData,
    currentStep,
    nextStep,
    prevStep,
    setStepData,
    closeDialog,
    deferForm,
    clearDraft,
    setSubmitting,
  } = useHITLFormStore();
  const submitRef = useRef<(() => void) | null>(null);
  const [additionalContext, setAdditionalContext] = useState('');

  const isSingleStep = activeForm?.steps && activeForm.steps.length === 1;

  // On mount, fetch pending forms from server and queue any not already in the store.
  // The list endpoint returns summaries (no `steps`), so we must fetch full form data
  // before adding to the store.
  useEffect(() => {
    const api = getHttpApiClient();
    api.hitlForms.list().then(async (result) => {
      if (!result.success || !result.forms) return;
      const { addPendingForm, openForm } = useHITLFormStore.getState();
      for (const summary of result.forms) {
        const full = await api.hitlForms.get(summary.id);
        if (full.success && full.form) {
          addPendingForm(full.form);
        }
      }
      // Auto-open first pending form if no dialog is currently open
      const state = useHITLFormStore.getState();
      if (!state.isDialogOpen && state.pendingForms.length > 0) {
        openForm(state.pendingForms[0]);
      }
    });
  }, []);

  // Subscribe to WS events to add pending forms and auto-open
  useEffect(() => {
    const api = getHttpApiClient();
    const { addPendingForm, openForm, removePendingForm } = useHITLFormStore.getState();

    const unsubRequested = api.hitlForms.onFormRequested(async (payload: unknown) => {
      const { formId } = payload as { formId: string };
      // Dedup guard: if form is already pending, just auto-open if not displayed
      const currentState = useHITLFormStore.getState();
      const existingForm = currentState.pendingForms.find((f) => f.id === formId);
      if (existingForm) {
        if (!currentState.isDialogOpen) {
          openForm(existingForm);
        }
        return;
      }
      // Fetch full form data
      const result = await api.hitlForms.get(formId);
      if (result.success && result.form) {
        addPendingForm(result.form);
        // Only auto-open if no form is currently displayed
        // (avoids wiping in-progress form data when multiple arrive)
        if (!useHITLFormStore.getState().isDialogOpen) {
          openForm(result.form);
        }
      }
    });

    const unsubResponded = api.hitlForms.onFormResponded((payload: unknown) => {
      const { formId } = payload as { formId: string };
      removePendingForm(formId);
    });

    return () => {
      unsubRequested();
      unsubResponded();
    };
  }, []);

  const handleSubmit = useCallback(
    async (allData: Record<string, unknown>[]) => {
      if (!activeForm) return;

      // Merge additional context into submission if provided
      const payload = additionalContext.trim()
        ? allData.map((step, i) =>
            i === allData.length - 1
              ? { ...step, additionalContext: additionalContext.trim() }
              : step
          )
        : allData;

      setSubmitting(true);
      try {
        const api = getHttpApiClient();
        const result = await api.hitlForms.submit(activeForm.id, payload);
        if (result.success) {
          toast.success('Form submitted');
          setAdditionalContext('');
          clearDraft(activeForm.id);
          closeDialog();
          useHITLFormStore.getState().removePendingForm(activeForm.id);
        } else {
          toast.error(result.error || 'Failed to submit form');
        }
      } catch (_error) {
        toast.error('Failed to submit form');
      } finally {
        setSubmitting(false);
      }
    },
    [activeForm, additionalContext, closeDialog, setSubmitting]
  );

  const handleSingleStepSubmit = useCallback(
    (data: Record<string, unknown>) => {
      handleSubmit([data]);
    },
    [handleSubmit]
  );

  const handleCancel = useCallback(async () => {
    if (!activeForm) return;

    try {
      const api = getHttpApiClient();
      await api.hitlForms.cancel(activeForm.id);
    } catch {
      // Best-effort cancel
    }
    setAdditionalContext('');
    clearDraft(activeForm.id);
    closeDialog();
    useHITLFormStore.getState().removePendingForm(activeForm.id);
  }, [activeForm, closeDialog, clearDraft]);

  /** Close dialog without cancelling — form stays pending on server */
  const handleDefer = useCallback(() => {
    setAdditionalContext('');
    deferForm();
  }, [deferForm]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        handleDefer();
      }
    },
    [handleDefer]
  );

  if (!activeForm || !activeForm.steps) return null;

  return (
    <Dialog open={isDialogOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{activeForm.title}</DialogTitle>
          {activeForm.description && (
            <DialogDescription>{activeForm.description}</DialogDescription>
          )}
        </DialogHeader>

        {isSingleStep ? (
          <div className="flex flex-col gap-4">
            <HITLFormStepRenderer
              step={activeForm.steps[0]}
              formData={stepData[0] ?? {}}
              onSubmit={handleSingleStepSubmit}
              submitRef={submitRef}
            />
            <div className="flex items-center justify-between pt-2 border-t">
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={handleDefer} disabled={isSubmitting}>
                  Close
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCancel}
                  disabled={isSubmitting}
                  className="text-destructive hover:text-destructive"
                  title="Cancel this form permanently"
                >
                  <XCircle className="mr-1 h-3 w-3" />
                  Cancel
                </Button>
              </div>
              <Button size="sm" onClick={() => submitRef.current?.()} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="mr-1 h-4 w-4" />
                    Submit
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : (
          <HITLFormWizard
            form={activeForm}
            currentStep={currentStep}
            stepData={stepData}
            isSubmitting={isSubmitting}
            onNextStep={nextStep}
            onPrevStep={prevStep}
            onStepDataChange={setStepData}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
          />
        )}

        <details className="group">
          <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground select-none">
            Add additional context
          </summary>
          <Textarea
            className="mt-2"
            placeholder="Provide any extra details, constraints, or preferences..."
            value={additionalContext}
            onChange={(e) => setAdditionalContext(e.target.value)}
            rows={3}
          />
        </details>
      </DialogContent>
    </Dialog>
  );
}
