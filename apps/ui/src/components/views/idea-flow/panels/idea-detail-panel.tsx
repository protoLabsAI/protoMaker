/**
 * IdeaDetailPanel — Floating overlay showing selected idea's full state
 *
 * Displays processing notes, path taken, Langfuse trace link, and complete session data.
 */

import { motion } from 'motion/react';
import { X, ExternalLink, CheckCircle2, XCircle, Clock, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';

interface IdeaDetailPanelProps {
  sessionId: string | null;
  sessionData?: Record<string, unknown> | null;
  onClose: () => void;
}

interface IdeaSessionData {
  id: string;
  idea: string;
  status: 'processing' | 'awaiting_approval' | 'completed' | 'failed';
  state?: {
    idea?: {
      title: string;
      description: string;
      category?: string;
    };
    complexity?: 'trivial' | 'simple' | 'complex';
    usedFastPath?: boolean;
    processingNotes?: string[];
    researchResults?: {
      findings?: Array<{ source: string; summary: string; relevance: string }>;
      summary?: string;
      recommendedCategory?: string;
      estimatedImpact?: string;
      estimatedEffort?: string;
    };
    reviewOutput?: {
      approve: boolean;
      category: string;
      impact: string;
      effort: string;
      suggestions?: string[];
      reasoning?: string;
    };
    approved?: boolean;
    category?: string;
    impact?: string;
    effort?: string;
    langfuseTraceUrl?: string;
  };
  result?: unknown;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export function IdeaDetailPanel({
  sessionId,
  sessionData: rawData,
  onClose,
}: IdeaDetailPanelProps) {
  if (!sessionId || !rawData) {
    return null;
  }

  // Cast to typed shape — fields are optional so missing data is safe
  const sessionData = rawData as unknown as IdeaSessionData;

  const statusConfig = {
    processing: { icon: Clock, color: 'text-blue-400', bg: 'bg-blue-500/10', label: 'Processing' },
    awaiting_approval: {
      icon: Clock,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
      label: 'Awaiting Approval',
    },
    completed: {
      icon: CheckCircle2,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      label: 'Completed',
    },
    failed: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10', label: 'Failed' },
  };

  const config = statusConfig[sessionData.status];
  const StatusIcon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="fixed top-4 right-4 z-50 w-96 max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl border border-border/50 bg-card/95 backdrop-blur-md shadow-2xl"
    >
      {/* Header */}
      <div className="sticky top-0 bg-card/95 backdrop-blur-md border-b border-border/50 p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-violet-400" />
          <h3 className="text-sm font-semibold">Idea Details</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md hover:bg-muted/50 transition-colors"
          aria-label="Close panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Status Badge */}
        <div className={cn('flex items-center gap-2 px-3 py-2 rounded-lg', config.bg)}>
          <StatusIcon className={cn('w-4 h-4', config.color)} />
          <span className={cn('text-sm font-medium', config.color)}>{config.label}</span>
        </div>

        {/* Idea Details */}
        {sessionData.state?.idea && (
          <div className="space-y-2">
            <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Idea
            </h4>
            <div className="rounded-lg bg-muted/30 p-3 space-y-2">
              <p className="text-sm font-semibold">{sessionData.state.idea.title}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {sessionData.state.idea.description}
              </p>
              {sessionData.state.idea.category && (
                <div className="pt-1">
                  <span className="inline-block px-2 py-0.5 text-[10px] rounded-md bg-violet-500/15 text-violet-400 font-medium">
                    {sessionData.state.idea.category}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Processing Path */}
        {sessionData.state?.complexity && (
          <div className="space-y-2">
            <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Processing Path
            </h4>
            <div className="rounded-lg bg-muted/30 p-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Complexity:</span>
                <span className="font-medium capitalize">{sessionData.state.complexity}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Fast Path:</span>
                <span className="font-medium">{sessionData.state.usedFastPath ? 'Yes' : 'No'}</span>
              </div>
            </div>
          </div>
        )}

        {/* Processing Notes */}
        {sessionData.state?.processingNotes && sessionData.state.processingNotes.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Processing Notes
            </h4>
            <div className="space-y-1.5">
              {sessionData.state.processingNotes.map((note, idx) => (
                <div key={idx} className="rounded-lg bg-muted/30 p-2 text-xs text-muted-foreground">
                  {note}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Research Results */}
        {sessionData.state?.researchResults && (
          <div className="space-y-2">
            <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Research Results
            </h4>
            <div className="rounded-lg bg-muted/30 p-3 space-y-3">
              {sessionData.state.researchResults.summary && (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {sessionData.state.researchResults.summary}
                </p>
              )}
              {sessionData.state.researchResults.findings &&
                sessionData.state.researchResults.findings.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                      Findings ({sessionData.state.researchResults.findings.length})
                    </p>
                    {sessionData.state.researchResults.findings.map((finding, idx) => (
                      <div key={idx} className="pl-3 border-l-2 border-violet-500/30 space-y-1">
                        <p className="text-[10px] font-medium text-violet-400">{finding.source}</p>
                        <p className="text-xs text-muted-foreground">{finding.summary}</p>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          </div>
        )}

        {/* Review Output */}
        {sessionData.state?.reviewOutput && (
          <div className="space-y-2">
            <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Review Assessment
            </h4>
            <div className="rounded-lg bg-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Recommendation:</span>
                <span
                  className={cn(
                    'font-medium',
                    sessionData.state.reviewOutput.approve ? 'text-emerald-400' : 'text-red-400'
                  )}
                >
                  {sessionData.state.reviewOutput.approve ? 'Approve' : 'Reject'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Impact:</span>
                <span className="font-medium capitalize">
                  {sessionData.state.reviewOutput.impact}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Effort:</span>
                <span className="font-medium capitalize">
                  {sessionData.state.reviewOutput.effort}
                </span>
              </div>
              {sessionData.state.reviewOutput.reasoning && (
                <div className="pt-2 border-t border-border/30">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {sessionData.state.reviewOutput.reasoning}
                  </p>
                </div>
              )}
              {sessionData.state.reviewOutput.suggestions &&
                sessionData.state.reviewOutput.suggestions.length > 0 && (
                  <div className="pt-2 border-t border-border/30 space-y-1">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                      Suggestions
                    </p>
                    <ul className="space-y-1">
                      {sessionData.state.reviewOutput.suggestions.map((suggestion, idx) => (
                        <li
                          key={idx}
                          className="text-xs text-muted-foreground pl-3 before:content-['•'] before:mr-2"
                        >
                          {suggestion}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
            </div>
          </div>
        )}

        {/* Error */}
        {sessionData.error && (
          <div className="space-y-2">
            <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Error
            </h4>
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3">
              <p className="text-xs text-red-400">{sessionData.error}</p>
            </div>
          </div>
        )}

        {/* Langfuse Trace Link */}
        {sessionData.state?.langfuseTraceUrl && (
          <div className="pt-2">
            <a
              href={sessionData.state.langfuseTraceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-500/10 hover:bg-violet-500/20 transition-colors text-violet-400 text-xs font-medium"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View in Langfuse
            </a>
          </div>
        )}

        {/* Metadata */}
        <div className="pt-2 border-t border-border/30 space-y-1">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Session ID:</span>
            <span className="font-mono">{sessionData.id}</span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Created:</span>
            <span>{new Date(sessionData.createdAt).toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Updated:</span>
            <span>{new Date(sessionData.updatedAt).toLocaleString()}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
