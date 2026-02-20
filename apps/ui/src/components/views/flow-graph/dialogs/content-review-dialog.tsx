/**
 * Content Review Dialog — Review GTM content drafts
 *
 * Shows strategy brief (collapsible) + markdown draft.
 * On approve: saves to Notes tab and navigates to /notes.
 * On request changes: sends feedback for re-drafting.
 * On reject: closes dialog.
 */

import { useState, useCallback } from 'react';
import {
  CheckCircle,
  X,
  Loader2,
  ChevronDown,
  ChevronRight,
  MessageSquarePlus,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@protolabs/ui/atoms';
import { Button } from '@protolabs/ui/atoms';
import { useMutation } from '@tanstack/react-query';
import Markdown from 'react-markdown';
import { getHttpApiClient } from '@/lib/http-api-client';
import { useAppStore } from '@/store/app-store';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';

interface ContentReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contentId: string;
  title: string;
  draft: string;
  strategy: string;
}

function StrategySection({ strategy }: { strategy: string }) {
  const [open, setOpen] = useState(false);

  let parsed: {
    angle?: string;
    audience?: string;
    keyPoints?: string[];
    tone?: string;
    suggestedTitle?: string;
  } | null = null;
  try {
    parsed = JSON.parse(strategy);
  } catch {
    // Not valid JSON, show raw
  }

  return (
    <div className="border border-border/20 rounded-lg overflow-hidden">
      <button
        type="button"
        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        )}
        <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
          Strategy Brief
        </h4>
      </button>
      {open && (
        <div className="px-3 pb-3 text-sm text-foreground/90">
          {parsed ? (
            <div className="space-y-2">
              {parsed.angle && (
                <div>
                  <span className="text-muted-foreground text-xs">Angle:</span>{' '}
                  {String(parsed.angle)}
                </div>
              )}
              {parsed.audience && (
                <div>
                  <span className="text-muted-foreground text-xs">Audience:</span>{' '}
                  {String(parsed.audience)}
                </div>
              )}
              {Array.isArray(parsed.keyPoints) && parsed.keyPoints.length > 0 && (
                <div>
                  <span className="text-muted-foreground text-xs">Key Points:</span>
                  <ul className="list-disc list-inside ml-2 mt-1">
                    {parsed.keyPoints.map((kp: string, i: number) => (
                      <li key={i}>{kp}</li>
                    ))}
                  </ul>
                </div>
              )}
              {parsed.tone && (
                <div>
                  <span className="text-muted-foreground text-xs">Tone:</span> {String(parsed.tone)}
                </div>
              )}
            </div>
          ) : (
            <pre className="text-xs whitespace-pre-wrap">{strategy}</pre>
          )}
        </div>
      )}
    </div>
  );
}

export function ContentReviewDialog({
  open,
  onOpenChange,
  contentId,
  title,
  draft,
  strategy,
}: ContentReviewDialogProps) {
  const projectPath = useAppStore((s) => s.currentProject?.path);
  const navigate = useNavigate();
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState('');

  const approveMutation = useMutation({
    mutationFn: async () => {
      const api = getHttpApiClient();
      return api.engine.contentReview(projectPath || '', contentId, 'approve', draft, title);
    },
    onSuccess: () => {
      toast.success('Draft saved to Notes — opening editor');
      onOpenChange(false);
      navigate({ to: '/notes' });
    },
    onError: (error) => {
      toast.error(
        `Failed to approve draft: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      const api = getHttpApiClient();
      return api.engine.contentReview(projectPath || '', contentId, 'reject');
    },
    onSuccess: () => {
      toast.info('Draft rejected');
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(
        `Failed to reject draft: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    },
  });

  const requestChangesMutation = useMutation({
    mutationFn: async () => {
      const api = getHttpApiClient();
      return api.engine.contentReview(
        projectPath || '',
        contentId,
        'request_changes',
        undefined,
        undefined,
        feedback
      );
    },
    onSuccess: () => {
      toast.success('Changes requested — reprocessing...');
      setShowFeedback(false);
      setFeedback('');
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(
        `Failed to request changes: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    },
  });

  const handleApprove = useCallback(() => {
    approveMutation.mutate();
  }, [approveMutation]);

  const handleReject = useCallback(() => {
    rejectMutation.mutate();
  }, [rejectMutation]);

  const handleRequestChanges = useCallback(() => {
    if (!feedback.trim()) {
      toast.error('Please provide feedback for the revision');
      return;
    }
    requestChangesMutation.mutate();
  }, [requestChangesMutation, feedback]);

  const isPending =
    approveMutation.isPending || rejectMutation.isPending || requestChangesMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Review content draft before editing in Notes</DialogDescription>
        </DialogHeader>

        <div className="mt-3 space-y-3">
          {/* Collapsible strategy brief */}
          {strategy && <StrategySection strategy={strategy} />}

          {/* Markdown draft */}
          <div className="border border-border/20 rounded-lg px-4 py-3 prose prose-sm prose-invert max-w-none prose-p:text-foreground/90 prose-headings:text-foreground prose-li:text-foreground/90 prose-strong:text-foreground prose-code:text-violet-300 prose-code:bg-muted/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-muted/30 prose-pre:border prose-pre:border-border/20">
            <Markdown>{draft}</Markdown>
          </div>

          {/* Feedback textarea (shown when request changes is selected) */}
          {showFeedback && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="feedback-input">
                What changes would you like?
              </label>
              <textarea
                id="feedback-input"
                className="w-full h-24 rounded-lg border border-border/30 bg-muted/20 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-violet-500/50"
                placeholder="Describe the changes you'd like to see..."
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
              />
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowFeedback(false);
                    setFeedback('');
                  }}
                  disabled={isPending}
                >
                  Cancel
                </Button>
                <Button size="sm" onClick={handleRequestChanges} disabled={isPending}>
                  {requestChangesMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <MessageSquarePlus className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Submit Feedback
                </Button>
              </div>
            </div>
          )}

          {/* Action buttons */}
          {!showFeedback && (
            <div className="flex items-center justify-end gap-2 border-t border-border/30 pt-3">
              <Button variant="outline" size="sm" onClick={handleReject} disabled={isPending}>
                <X className="w-3.5 h-3.5 mr-1.5" />
                Reject
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFeedback(true)}
                disabled={isPending}
              >
                <MessageSquarePlus className="w-3.5 h-3.5 mr-1.5" />
                Request Changes
              </Button>
              <Button size="sm" onClick={handleApprove} disabled={isPending}>
                {approveMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                )}
                Approve & Edit in Notes
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
