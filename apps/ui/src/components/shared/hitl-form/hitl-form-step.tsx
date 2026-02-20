/**
 * HITL Form Step — Renders a single JSON Schema form step using @rjsf/core
 * with the shadcn theme.
 */

import { useRef, useCallback } from 'react';
import type { IChangeEvent } from '@rjsf/core';
import { Form } from '@rjsf/shadcn';
import validator from '@rjsf/validator-ajv8';
import type { HITLFormStep } from '@automaker/types';

interface HITLFormStepProps {
  step: HITLFormStep;
  formData: Record<string, unknown>;
  onSubmit: (data: Record<string, unknown>) => void;
  onChange?: (data: Record<string, unknown>) => void;
  /** Ref to programmatically submit the form */
  submitRef?: React.MutableRefObject<(() => void) | null>;
}

export function HITLFormStepRenderer({
  step,
  formData,
  onSubmit,
  onChange,
  submitRef,
}: HITLFormStepProps) {
  const formRef = useRef<any>(null);

  const handleSubmit = useCallback(
    (e: IChangeEvent) => {
      onSubmit(e.formData ?? {});
    },
    [onSubmit]
  );

  const handleChange = useCallback(
    (e: IChangeEvent) => {
      onChange?.(e.formData ?? {});
    },
    [onChange]
  );

  // Expose submit trigger to parent
  if (submitRef) {
    submitRef.current = () => {
      formRef.current?.submit();
    };
  }

  return (
    <div className="space-y-4">
      {step.title && <h3 className="text-lg font-semibold">{step.title}</h3>}
      {step.description && <p className="text-sm text-muted-foreground">{step.description}</p>}
      <Form
        ref={formRef}
        schema={step.schema as any}
        uiSchema={step.uiSchema as any}
        formData={formData}
        validator={validator}
        onSubmit={handleSubmit}
        onChange={handleChange}
        liveValidate={false}
        showErrorList={false}
      >
        {/* Hide default submit button — parent controls submission */}
        <></>
      </Form>
    </div>
  );
}
