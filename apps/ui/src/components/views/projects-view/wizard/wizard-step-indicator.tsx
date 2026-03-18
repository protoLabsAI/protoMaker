import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WIZARD_STEPS, WIZARD_STEP_LABELS, type WizardStep } from '@/store/project-wizard-store';

interface WizardStepIndicatorProps {
  currentStep: WizardStep;
  completedSteps: Set<WizardStep>;
  onStepClick: (step: WizardStep) => void;
  accentColor?: string;
}

export function WizardStepIndicator({
  currentStep,
  completedSteps,
  onStepClick,
  accentColor,
}: WizardStepIndicatorProps) {
  const currentIndex = WIZARD_STEPS.indexOf(currentStep);

  return (
    <nav
      aria-label="Project wizard progress"
      className="flex items-center justify-center gap-0 w-full py-4 px-2"
      style={accentColor ? ({ '--wizard-accent': accentColor } as React.CSSProperties) : undefined}
    >
      {WIZARD_STEPS.map((step, index) => {
        const isCompleted = completedSteps.has(step);
        const isCurrent = step === currentStep;
        const isClickable = isCompleted || isCurrent;
        const isLast = index === WIZARD_STEPS.length - 1;

        return (
          <div key={step} className="flex items-center">
            <button
              type="button"
              onClick={() => isClickable && onStepClick(step)}
              disabled={!isClickable}
              aria-current={isCurrent ? 'step' : undefined}
              aria-label={`${WIZARD_STEP_LABELS[step]}${isCompleted ? ' (completed)' : ''}${isCurrent ? ' (current)' : ''}`}
              className={cn(
                'flex flex-col items-center gap-1.5 group',
                isClickable ? 'cursor-pointer' : 'cursor-default'
              )}
            >
              {/* Circle */}
              <div
                className={cn(
                  'flex items-center justify-center rounded-full transition-all duration-200',
                  'size-7 text-xs font-medium',
                  isCompleted && 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30',
                  isCurrent && !isCompleted && 'ring-2 text-foreground',
                  !isCompleted && !isCurrent && 'bg-muted/40 text-muted-foreground/50'
                )}
                style={
                  isCurrent && !isCompleted
                    ? ({
                        backgroundColor: accentColor
                          ? `color-mix(in oklch, ${accentColor} 20%, transparent)`
                          : undefined,
                        '--tw-ring-color': accentColor || 'hsl(var(--primary))',
                      } as React.CSSProperties)
                    : undefined
                }
              >
                {isCompleted ? <Check className="size-3.5" /> : <span>{index + 1}</span>}
              </div>

              {/* Label */}
              <span
                className={cn(
                  'text-xs font-medium transition-colors hidden sm:block',
                  isCurrent && 'text-foreground',
                  isCompleted && !isCurrent && 'text-muted-foreground',
                  !isCompleted && !isCurrent && 'text-muted-foreground/50'
                )}
              >
                {WIZARD_STEP_LABELS[step]}
              </span>
            </button>

            {/* Connector line */}
            {!isLast && (
              <div
                className={cn(
                  'h-px w-8 sm:w-12 mx-1 transition-colors',
                  index < currentIndex ||
                    (isCompleted && completedSteps.has(WIZARD_STEPS[index + 1]))
                    ? 'bg-emerald-500/40'
                    : 'bg-border/30'
                )}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}
