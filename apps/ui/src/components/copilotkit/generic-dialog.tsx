/**
 * Generic Approval Dialog
 *
 * Simple yes/no dialog as fallback for untyped LangGraph interrupts.
 * Shows a message from the interrupt payload and two action buttons.
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CheckCircle, XCircle } from 'lucide-react';

interface GenericApprovalDialogProps {
  open: boolean;
  title?: string;
  message: string;
  onResolve: (approved: boolean) => void;
}

export function GenericApprovalDialog({
  open,
  title = 'Approval Required',
  message,
  onResolve,
}: GenericApprovalDialogProps) {
  return (
    <Dialog open={open}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button
            onClick={() => onResolve(false)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border border-border bg-background text-foreground hover:bg-muted transition-colors"
          >
            <XCircle className="w-4 h-4" />
            Reject
          </button>
          <button
            onClick={() => onResolve(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <CheckCircle className="w-4 h-4" />
            Approve
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
