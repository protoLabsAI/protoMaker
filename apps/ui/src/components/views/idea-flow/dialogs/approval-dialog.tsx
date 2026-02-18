/**
 * Approval Dialog
 *
 * Displays review output and approval form for idea approval:
 * - Category, impact, effort, and suggestions
 * - Feedback textarea
 * - Approve/reject buttons
 * - Countdown display (when enabled)
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Check, X, AlertCircle } from 'lucide-react';

/**
 * Review output structure (from LangGraph flow)
 */
export interface ReviewOutput {
  approve: boolean;
  category: string;
  impact: 'low' | 'medium' | 'high';
  effort: 'low' | 'medium' | 'high';
  suggestions?: string[];
  reasoning?: string;
}

/**
 * Countdown state for auto-approval
 */
export interface CountdownState {
  startedAt: string;
  expiresAt: string;
  durationSeconds: number;
}

export interface ApprovalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reviewOutput: ReviewOutput | null;
  onApprove: (feedback?: string) => void;
  onReject: (feedback?: string) => void;
  isLoading?: boolean;
  countdown?: CountdownState;
}

/**
 * Get badge color based on level
 */
function getBadgeColor(level: 'low' | 'medium' | 'high'): string {
  switch (level) {
    case 'low':
      return 'bg-green-500/20 text-green-400';
    case 'medium':
      return 'bg-yellow-500/20 text-yellow-400';
    case 'high':
      return 'bg-red-500/20 text-red-400';
  }
}

/**
 * Calculate remaining time in seconds
 */
function getRemainingSeconds(expiresAt: string): number {
  const now = Date.now();
  const expires = new Date(expiresAt).getTime();
  return Math.max(0, Math.floor((expires - now) / 1000));
}

/**
 * Format seconds to human-readable time
 */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function ApprovalDialog({
  open,
  onOpenChange,
  reviewOutput,
  onApprove,
  onReject,
  isLoading = false,
  countdown,
}: ApprovalDialogProps) {
  const [feedback, setFeedback] = useState('');
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  // Update countdown timer
  useEffect(() => {
    if (!countdown || !open) {
      setRemainingSeconds(null);
      return;
    }

    const updateTimer = () => {
      const remaining = getRemainingSeconds(countdown.expiresAt);
      setRemainingSeconds(remaining);

      // Auto-approve when countdown reaches zero
      if (remaining === 0 && reviewOutput?.approve) {
        onApprove(feedback || undefined);
      }
    };

    // Update immediately
    updateTimer();

    // Update every second
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [countdown, open, feedback, reviewOutput, onApprove]);

  // Reset feedback when dialog opens/closes
  useEffect(() => {
    if (open) {
      setFeedback('');
    }
  }, [open]);

  const handleApprove = () => {
    onApprove(feedback.trim() || undefined);
  };

  const handleReject = () => {
    onReject(feedback.trim() || undefined);
  };

  const handleClose = (open: boolean) => {
    if (!open && !isLoading) {
      onOpenChange(false);
    }
  };

  if (!reviewOutput) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl" data-testid="approval-dialog">
        <DialogHeader>
          <DialogTitle>Review & Approve Idea</DialogTitle>
          <DialogDescription>
            Review the AI-generated assessment and provide your decision.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Countdown Warning */}
          {remainingSeconds !== null && remainingSeconds > 0 && (
            <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
              <div className="flex-1 text-sm">
                <span className="font-medium text-yellow-400">Auto-approval in progress</span>
                <span className="text-muted-foreground ml-2">
                  Time remaining: {formatTime(remainingSeconds)}
                </span>
              </div>
            </div>
          )}

          {/* Review Assessment */}
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              {/* Category */}
              <div>
                <Label className="text-xs text-muted-foreground">Category</Label>
                <div className="mt-1 px-3 py-2 bg-muted/50 rounded text-sm font-medium">
                  {reviewOutput.category}
                </div>
              </div>

              {/* Impact */}
              <div>
                <Label className="text-xs text-muted-foreground">Impact</Label>
                <div className="mt-1">
                  <span
                    className={`inline-block px-3 py-2 rounded text-sm font-medium ${getBadgeColor(reviewOutput.impact)}`}
                  >
                    {reviewOutput.impact}
                  </span>
                </div>
              </div>

              {/* Effort */}
              <div>
                <Label className="text-xs text-muted-foreground">Effort</Label>
                <div className="mt-1">
                  <span
                    className={`inline-block px-3 py-2 rounded text-sm font-medium ${getBadgeColor(reviewOutput.effort)}`}
                  >
                    {reviewOutput.effort}
                  </span>
                </div>
              </div>
            </div>

            {/* Reasoning */}
            {reviewOutput.reasoning && (
              <div>
                <Label className="text-xs text-muted-foreground">AI Reasoning</Label>
                <div className="mt-1 px-3 py-2 bg-muted/50 rounded text-sm">
                  {reviewOutput.reasoning}
                </div>
              </div>
            )}

            {/* Suggestions */}
            {reviewOutput.suggestions && reviewOutput.suggestions.length > 0 && (
              <div>
                <Label className="text-xs text-muted-foreground">Suggestions</Label>
                <ul className="mt-1 space-y-1">
                  {reviewOutput.suggestions.map((suggestion, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2 px-3 py-2 bg-muted/50 rounded text-sm"
                    >
                      <span className="text-muted-foreground mt-0.5">•</span>
                      <span className="flex-1">{suggestion}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Feedback Textarea */}
          <div>
            <Label htmlFor="feedback" className="text-sm">
              Your Feedback (Optional)
            </Label>
            <Textarea
              id="feedback"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Add any comments or modifications..."
              className="mt-1.5 min-h-[100px]"
              disabled={isLoading}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleReject} disabled={isLoading}>
            <X className="w-4 h-4 mr-2" />
            Reject
          </Button>
          <Button onClick={handleApprove} disabled={isLoading}>
            <Check className="w-4 h-4 mr-2" />
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
