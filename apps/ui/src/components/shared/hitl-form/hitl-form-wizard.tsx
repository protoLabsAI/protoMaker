/**
 * HITL Form Wizard — Multi-step form navigation with step indicator,
 * data accumulation, and per-step validation.
 */

import { useRef, useCallback } from 'react';
import { Button } from '@protolabs/ui/atoms';
import { ChevronLeft, ChevronRight, Loader2, Send } from 'lucide-react';
import { useHITLFormStore } from '@/store/hitl-form-store';
import { HITLFormStepRenderer } from './hitl-form-step';
import type { HITLFormRequest } from '@automaker/types';

interface HITLFormWizardProps {
  form: HITLFormRequest;
  onSubmit: (allData: Record<string, unknown>[]) => void;
  onCancel: () => void;
}

export function HITLFormWizard({ form, onSubmit, onCancel }: HITLFormWizardProps) {
  const { currentStep, stepData, nextStep, prevStep, setStepData, isSubmitting } =
    useHITLFormStore();
  const submitRef = useRef<(() => void) | null>(null);

  const totalSteps = form.steps.length;
  const isLastStep = currentStep === totalSteps - 1;
  const isFirstStep = currentStep === 0;
  const currentStepDef = form.steps[currentStep];

  const handleStepSubmit = useCallback(
    (data: Record<string, unknown>) => {
      if (isLastStep) {
        // Collect all step data including current
        const allData = [...stepData];
        allData[currentStep] = data;
        onSubmit(allData);
      } else {
        nextStep(data);
      }
    },
    [isLastStep, currentStep, stepData, nextStep, onSubmit]
  );

  const handleStepChange = useCallback(
    (data: Record<string, unknown>) => {
      setStepData(currentStep, data);
    },
    [currentStep, setStepData]
  );

  const handleNext = useCallback(() => {
    // Trigger RJSF validation + submit
    submitRef.current?.();
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {/* Step indicator */}
      {totalSteps > 1 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="font-medium">
            Step {currentStep + 1} of {totalSteps}
          </span>
          <div className="flex-1 flex gap-1">
            {form.steps.map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full ${
                  i <= currentStep ? 'bg-primary' : 'bg-muted'
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Form step */}
      <HITLFormStepRenderer
        step={currentStepDef}
        formData={stepData[currentStep] ?? {}}
        onSubmit={handleStepSubmit}
        onChange={handleStepChange}
        submitRef={submitRef}
      />

      {/* Navigation */}
      <div className="flex justify-between pt-2 border-t">
        <div>
          {!isFirstStep && (
            <Button variant="outline" size="sm" onClick={prevStep} disabled={isSubmitting}>
              <ChevronLeft className="mr-1 h-4 w-4" />
              Back
            </Button>
          )}
          {isFirstStep && (
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={isSubmitting}>
              Cancel
            </Button>
          )}
        </div>
        <Button size="sm" onClick={handleNext} disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              Submitting...
            </>
          ) : isLastStep ? (
            <>
              <Send className="mr-1 h-4 w-4" />
              Submit
            </>
          ) : (
            <>
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
