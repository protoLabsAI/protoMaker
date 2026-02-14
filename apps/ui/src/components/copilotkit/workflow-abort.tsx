/**
 * Workflow Abort Button
 *
 * Stop/cancel button for running workflows. Shows a confirmation dialog
 * before aborting the current execution.
 */

import { useState } from 'react';
import { Square, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface WorkflowAbortProps {
  isRunning: boolean;
  workflowName?: string;
  onAbort: () => void;
}

export function WorkflowAbortButton({ isRunning, workflowName, onAbort }: WorkflowAbortProps) {
  const [showConfirm, setShowConfirm] = useState(false);

  if (!isRunning) return null;

  const handleAbort = () => {
    setShowConfirm(false);
    onAbort();
  };

  return (
    <>
      <button
        onClick={() => setShowConfirm(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
        title="Stop workflow"
      >
        <Square className="w-3 h-3 fill-current" />
        Stop
      </button>

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Abort Workflow
            </DialogTitle>
            <DialogDescription>
              {workflowName
                ? `Are you sure you want to abort "${workflowName}"? This action cannot be undone.`
                : 'Are you sure you want to abort the current workflow? This action cannot be undone.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => setShowConfirm(false)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border border-border bg-background text-foreground hover:bg-muted transition-colors"
            >
              Continue Running
            </button>
            <button
              onClick={handleAbort}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-destructive text-destructive-foreground hover:opacity-90 transition-opacity"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              Abort
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
