/**
 * Phase Approval Dialog
 *
 * Dynamic form for approving/rejecting phase completions.
 * Supports custom fields based on phase type and metadata.
 * Wired to PhaseApproval interrupt type.
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface CustomField {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'checkbox';
  required?: boolean;
  placeholder?: string;
  defaultValue?: string | number | boolean;
}

interface PhaseDetails {
  phaseName: string;
  phaseType?: string;
  description?: string;
  completedTasks?: string[];
  metadata?: Record<string, unknown>;
  customFields?: CustomField[];
}

interface PhaseApprovalDialogProps {
  open: boolean;
  phaseDetails: PhaseDetails;
  onResolve: (approved: boolean, data?: Record<string, unknown>) => void;
}

export function PhaseApprovalDialog({ open, phaseDetails, onResolve }: PhaseApprovalDialogProps) {
  const [formData, setFormData] = useState<Record<string, unknown>>(() => {
    // Initialize form data with default values from custom fields
    const initial: Record<string, unknown> = {};
    phaseDetails.customFields?.forEach((field) => {
      if (field.defaultValue !== undefined) {
        initial[field.name] = field.defaultValue;
      }
    });
    return initial;
  });

  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectionInput, setShowRejectionInput] = useState(false);

  const handleFieldChange = (name: string, value: unknown) => {
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleApprove = () => {
    onResolve(true, formData);
  };

  const handleReject = () => {
    if (!showRejectionInput) {
      setShowRejectionInput(true);
      return;
    }

    onResolve(false, {
      ...formData,
      rejectionReason: rejectionReason.trim() || 'No reason provided',
    });
  };

  const renderCustomField = (field: CustomField) => {
    const value = formData[field.name];

    switch (field.type) {
      case 'textarea':
        return (
          <div key={field.name} className="space-y-2">
            <Label htmlFor={field.name}>
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Textarea
              id={field.name}
              value={(value as string) || ''}
              onChange={(e) => handleFieldChange(field.name, e.target.value)}
              placeholder={field.placeholder}
              required={field.required}
              className="min-h-[80px]"
            />
          </div>
        );

      case 'number':
        return (
          <div key={field.name} className="space-y-2">
            <Label htmlFor={field.name}>
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Input
              id={field.name}
              type="number"
              value={(value as number) || ''}
              onChange={(e) => handleFieldChange(field.name, parseFloat(e.target.value))}
              placeholder={field.placeholder}
              required={field.required}
            />
          </div>
        );

      case 'checkbox':
        return (
          <div key={field.name} className="flex items-center space-x-2">
            <input
              id={field.name}
              type="checkbox"
              checked={(value as boolean) || false}
              onChange={(e) => handleFieldChange(field.name, e.target.checked)}
              className="w-4 h-4 rounded border-border"
            />
            <Label htmlFor={field.name} className="cursor-pointer">
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </Label>
          </div>
        );

      case 'text':
      default:
        return (
          <div key={field.name} className="space-y-2">
            <Label htmlFor={field.name}>
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Input
              id={field.name}
              type="text"
              value={(value as string) || ''}
              onChange={(e) => handleFieldChange(field.name, e.target.value)}
              placeholder={field.placeholder}
              required={field.required}
            />
          </div>
        );
    }
  };

  const isFormValid = () => {
    // Check if all required fields are filled
    return (
      phaseDetails.customFields?.every((field) => {
        if (!field.required) return true;
        const value = formData[field.name];
        if (field.type === 'checkbox') return true; // Checkboxes are always valid
        return value !== undefined && value !== null && value !== '';
      }) ?? true
    );
  };

  return (
    <Dialog open={open}>
      <DialogContent showCloseButton={false} className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <DialogTitle className="text-lg">
                Phase Completion: {phaseDetails.phaseName}
              </DialogTitle>
              {phaseDetails.phaseType && (
                <div className="text-sm text-muted-foreground mt-1">
                  Type: {phaseDetails.phaseType}
                </div>
              )}
            </div>
          </div>
          {phaseDetails.description && (
            <DialogDescription className="mt-3">{phaseDetails.description}</DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Completed Tasks */}
          {phaseDetails.completedTasks && phaseDetails.completedTasks.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Completed Tasks</Label>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                {phaseDetails.completedTasks.map((task, idx) => (
                  <li key={idx}>{task}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Custom Fields */}
          {phaseDetails.customFields && phaseDetails.customFields.length > 0 && (
            <div className="space-y-4 border-t pt-4">
              <Label className="text-sm font-semibold">Additional Information</Label>
              {phaseDetails.customFields.map((field) => renderCustomField(field))}
            </div>
          )}

          {/* Rejection Reason Input */}
          {showRejectionInput && (
            <div className="space-y-2 border-t pt-4">
              <Label htmlFor="rejection-reason" className="text-sm font-semibold">
                Rejection Reason <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="rejection-reason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Please provide a reason for rejection..."
                className="min-h-[80px]"
                autoFocus
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={handleReject}
            variant="outline"
            className="inline-flex items-center gap-2"
          >
            <XCircle className="w-4 h-4" />
            {showRejectionInput ? 'Submit Rejection' : 'Reject'}
          </Button>
          <Button
            onClick={handleApprove}
            disabled={!isFormValid()}
            className="inline-flex items-center gap-2"
          >
            <CheckCircle className="w-4 h-4" />
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
