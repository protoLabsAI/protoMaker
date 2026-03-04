import { ExternalLink, Plus, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';
import { Button } from '../../atoms/button.js';
import { Badge } from '../../atoms/badge.js';
import { cn } from '../../lib/utils.js';
import type { GapAnalysisReport, AlignmentProposal } from '@protolabs-ai/types';

interface ProtoLabsReportResultsProps {
  report: GapAnalysisReport;
  reportPath: string;
  onOpenReport: () => void;
  onCreateFeatures: () => void;
  isCreatingFeatures: boolean;
  proposal?: AlignmentProposal;
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-500';
  if (score >= 50) return 'text-yellow-500';
  return 'text-red-500';
}

function getScoreRingColor(score: number): string {
  if (score >= 80) return 'stroke-green-500';
  if (score >= 50) return 'stroke-yellow-500';
  return 'stroke-red-500';
}

function ScoreRing({ score }: { score: number }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="100" height="100" className="-rotate-90">
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          className="text-muted/20"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn('transition-all duration-1000 ease-out', getScoreRingColor(score))}
        />
      </svg>
      <span className={cn('absolute text-2xl font-bold', getScoreColor(score))}>{score}</span>
    </div>
  );
}

export function ProtoLabsReportResults({
  report,
  reportPath,
  onOpenReport,
  onCreateFeatures,
  isCreatingFeatures,
  proposal,
}: ProtoLabsReportResultsProps) {
  return (
    <div className="space-y-6">
      {/* Score + Summary */}
      <div className="flex items-center gap-6">
        <ScoreRing score={report.overallScore} />
        <div className="flex-1 space-y-2">
          <h3 className="text-lg font-semibold">Alignment Score</h3>
          <div className="flex flex-wrap gap-2">
            {report.summary.critical > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="size-3" />
                {report.summary.critical} critical
              </Badge>
            )}
            {report.summary.recommended > 0 && (
              <Badge variant="secondary" className="gap-1 bg-yellow-500/10 text-yellow-600">
                <Info className="size-3" />
                {report.summary.recommended} recommended
              </Badge>
            )}
            {report.summary.optional > 0 && (
              <Badge variant="outline" className="gap-1">
                <Info className="size-3" />
                {report.summary.optional} optional
              </Badge>
            )}
            {report.summary.compliant > 0 && (
              <Badge variant="secondary" className="gap-1 bg-green-500/10 text-green-600">
                <CheckCircle2 className="size-3" />
                {report.summary.compliant} compliant
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button onClick={onOpenReport} variant="outline" className="gap-2">
          <ExternalLink className="size-4" />
          Open HTML Report
        </Button>
        <Button
          onClick={onCreateFeatures}
          disabled={isCreatingFeatures || report.gaps.length === 0}
          className="gap-2"
        >
          <Plus className="size-4" />
          {isCreatingFeatures ? 'Creating...' : `Create Alignment Features (${report.gaps.length})`}
        </Button>
      </div>

      {/* Proposal summary */}
      {proposal && (
        <p className="text-sm text-muted-foreground">
          {proposal.totalFeatures} features across {proposal.milestones.length} milestones created
          on the board.
        </p>
      )}

      {/* Report path */}
      <p className="text-xs text-muted-foreground truncate" title={reportPath}>
        Report saved to: {reportPath}
      </p>
    </div>
  );
}
