import { useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, RotateCcw, FlaskConical } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Spinner,
} from '@protolabs/ui/atoms';
import { Button } from '@protolabs/ui/atoms';
import { cn } from '@/lib/utils';
import { getElectronAPI } from '@/lib/electron';
import { toast } from 'sonner';
import { ProtoLabsReportResults } from './protolabs-report-results';
import type { RepoResearchResult, GapAnalysisReport, AlignmentProposal } from '@automaker/types';

type PipelineStep = 'idle' | 'researching' | 'analyzing' | 'generating' | 'complete' | 'error';

interface ProtoLabsReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectPath: string;
}

const STEPS = [
  { key: 'researching' as const, label: 'Scanning repository...' },
  { key: 'analyzing' as const, label: 'Analyzing gaps...' },
  { key: 'generating' as const, label: 'Generating report...' },
  { key: 'complete' as const, label: 'Complete' },
];

function getStepIndex(step: PipelineStep): number {
  return STEPS.findIndex((s) => s.key === step);
}

export function ProtoLabsReportDialog({
  open,
  onOpenChange,
  projectPath,
}: ProtoLabsReportDialogProps) {
  const [step, setStep] = useState<PipelineStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [failedStep, setFailedStep] = useState<PipelineStep | null>(null);

  // Pipeline data
  const [research, setResearch] = useState<RepoResearchResult | null>(null);
  const [gapReport, setGapReport] = useState<GapAnalysisReport | null>(null);
  const [reportPath, setReportPath] = useState<string | null>(null);
  const [proposal, setProposal] = useState<AlignmentProposal | null>(null);
  const [isCreatingFeatures, setIsCreatingFeatures] = useState(false);

  const resetState = useCallback(() => {
    setStep('idle');
    setError(null);
    setFailedStep(null);
    setResearch(null);
    setGapReport(null);
    setReportPath(null);
    setProposal(null);
    setIsCreatingFeatures(false);
  }, []);

  const runPipeline = useCallback(
    async (startFrom?: PipelineStep) => {
      const api = getElectronAPI();
      let currentStep: PipelineStep = startFrom ?? 'researching';
      setError(null);
      setFailedStep(null);

      try {
        // Step 1: Research
        let researchResult = research;
        if (!startFrom || startFrom === 'researching') {
          currentStep = 'researching';
          setStep('researching');
          const res = await api.setupLab.research(projectPath);
          if (!res.success || !res.research) {
            throw new Error(res.error || 'Research failed');
          }
          researchResult = res.research;
          setResearch(researchResult);
        }

        // Step 2: Gap Analysis
        let gapResult = gapReport;
        if (!startFrom || startFrom === 'researching' || startFrom === 'analyzing') {
          currentStep = 'analyzing';
          setStep('analyzing');
          const res = await api.setupLab.gapAnalysis(projectPath, researchResult!);
          if (!res.success || !res.report) {
            throw new Error(res.error || 'Gap analysis failed');
          }
          gapResult = res.report;
          setGapReport(gapResult);
        }

        // Step 3: Generate Report
        currentStep = 'generating';
        setStep('generating');
        const reportRes = await api.setupLab.report(projectPath, researchResult!, gapResult!);
        if (!reportRes.success || !reportRes.outputPath) {
          throw new Error(reportRes.error || 'Report generation failed');
        }
        setReportPath(reportRes.outputPath);

        // Done
        setStep('complete');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        setFailedStep(currentStep);
        setStep('error');
      }
    },
    [projectPath, research, gapReport]
  );

  const handleRetry = useCallback(() => {
    if (failedStep) {
      runPipeline(failedStep);
    } else {
      runPipeline();
    }
  }, [failedStep, runPipeline]);

  const handleOpenReport = useCallback(async () => {
    if (!reportPath) return;
    try {
      const api = getElectronAPI();
      await api.setupLab.openReport(reportPath);
    } catch {
      toast.error('Failed to open report');
    }
  }, [reportPath]);

  const handleCreateFeatures = useCallback(async () => {
    if (!gapReport) return;
    setIsCreatingFeatures(true);
    try {
      const api = getElectronAPI();
      const res = await api.setupLab.propose(projectPath, gapReport, true);
      if (!res.success) {
        throw new Error(res.error || 'Failed to create features');
      }
      setProposal(res.proposal ?? null);
      toast.success('Alignment features created', {
        description: `${res.featuresCreated ?? res.proposal?.totalFeatures ?? 0} features added to the board`,
      });
    } catch (err) {
      toast.error('Failed to create features', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setIsCreatingFeatures(false);
    }
  }, [projectPath, gapReport]);

  // Auto-start pipeline when dialog opens
  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (isOpen && step === 'idle') {
        runPipeline();
      }
      if (!isOpen) {
        // Reset when closing so next open starts fresh
        resetState();
      }
      onOpenChange(isOpen);
    },
    [step, runPipeline, resetState, onOpenChange]
  );

  const currentStepIndex = getStepIndex(step);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="size-5" />
            ProtoLabs Report
          </DialogTitle>
          <DialogDescription>
            Scanning your project against the ProtoLabs gold standard.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Step indicators */}
          {step !== 'complete' && (
            <div className="space-y-2">
              {STEPS.slice(0, -1).map((s, i) => {
                const isActive = s.key === step;
                const isDone = currentStepIndex > i;
                const isPending = currentStepIndex < i && step !== 'error';

                return (
                  <div key={s.key} className="flex items-center gap-3">
                    <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                      {isActive && !error ? (
                        <Spinner size="sm" />
                      ) : isDone ? (
                        <CheckCircle2 className="size-5 text-green-500" />
                      ) : step === 'error' && failedStep === s.key ? (
                        <AlertCircle className="size-5 text-destructive" />
                      ) : (
                        <div
                          className={cn(
                            'size-2 rounded-full',
                            isPending ? 'bg-muted-foreground/30' : 'bg-muted-foreground/50'
                          )}
                        />
                      )}
                    </div>
                    <span
                      className={cn(
                        'text-sm',
                        isActive && 'font-medium text-foreground',
                        isDone && 'text-muted-foreground',
                        isPending && 'text-muted-foreground/50'
                      )}
                    >
                      {s.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Error state */}
          {step === 'error' && error && (
            <div className="space-y-3">
              <div className="rounded-md bg-destructive/10 p-3">
                <p className="text-sm text-destructive">{error}</p>
              </div>
              <Button onClick={handleRetry} variant="outline" size="sm" className="gap-2">
                <RotateCcw className="size-3.5" />
                Retry
              </Button>
            </div>
          )}

          {/* Complete state */}
          {step === 'complete' && gapReport && reportPath && (
            <ProtoLabsReportResults
              report={gapReport}
              reportPath={reportPath}
              onOpenReport={handleOpenReport}
              onCreateFeatures={handleCreateFeatures}
              isCreatingFeatures={isCreatingFeatures}
              proposal={proposal ?? undefined}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
