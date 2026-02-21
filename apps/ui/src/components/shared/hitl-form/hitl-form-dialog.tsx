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
} from '@protolabs/ui/atoms';
import { Button } from '@protolabs/ui/atoms';
import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { useHITLFormStore } from '@/store/hitl-form-store';
import { getHttpApiClient } from '@/lib/http-api-client';
import { HITLFormStepRenderer } from './hitl-form-step';
import { HITLFormWizard } from './hitl-form-wizard';

export function HITLFormDialog() {
  const { activeForm, isDialogOpen, isSubmitting, stepData, closeDialog, setSubmitting } =
    useHITLFormStore();
  const submitRef = useRef<(() => void) | null>(null);
  const [additionalContext, setAdditionalContext] = useState('');

  const isSingleStep = activeForm && activeForm.steps.length === 1;

  // Subscribe to WS events to add pending forms and auto-open
  useEffect(() => {
    const api = getHttpApiClient();
    const { addPendingForm, openForm, removePendingForm } = useHITLFormStore.getState();

    const unsubRequested = api.hitlForms.onFormRequested(async (payload: any) => {
      // Fetch full form data
      const result = await api.hitlForms.get(payload.formId);
      if (result.success && result.form) {
        addPendingForm(result.form);
        // Only auto-open if no form is currently displayed
        // (avoids wiping in-progress form data when multiple arrive)
        if (!useHITLFormStore.getState().isDialogOpen) {
          openForm(result.form);
        }
      }
    });

    const unsubResponded = api.hitlForms.onFormResponded((payload: any) => {
      removePendingForm(payload.formId);
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
          closeDialog();
          useHITLFormStore.getState().removePendingForm(activeForm.id);
        } else {
          toast.error(result.error || 'Failed to submit form');
        }
      } catch (error) {
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
    closeDialog();
    useHITLFormStore.getState().removePendingForm(activeForm.id);
  }, [activeForm, closeDialog]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        handleCancel();
      }
    },
    [handleCancel]
  );

  if (!activeForm) return null;

  return (
    <Dialog open={isDialogOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-lg max-h-[85vh] overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        showCloseButton={false}
      >
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
            <div className="flex justify-between pt-2 border-t">
              <Button variant="ghost" size="sm" onClick={handleCancel} disabled={isSubmitting}>
                Cancel
              </Button>
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
          <HITLFormWizard form={activeForm} onSubmit={handleSubmit} onCancel={handleCancel} />
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
