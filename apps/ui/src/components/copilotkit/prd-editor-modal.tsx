/**
 * PRD Editor Modal
 *
 * Modal displayed when the content pipeline graph hits an interrupt() call
 * after antagonistic review. Uses TipTap rich text editor for content editing.
 *
 * The modal is lazy-loaded to avoid bundle impact (~200KB for TipTap).
 * This component will later be wired to CopilotKit interrupt events via AG-UI protocol.
 */

import { lazy, Suspense, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@automaker/ui-components/atoms';
import { Loader2 } from 'lucide-react';

// Lazy-load TipTap editor to avoid bundle impact
const TipTapEditor = lazy(() => import('./tiptap-editor'));

interface PRDEditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  content: string;
  onApprove: (editedContent: string) => void;
  onReject: () => void;
}

export function PRDEditorModal({
  open,
  onOpenChange,
  content,
  onApprove,
  onReject,
}: PRDEditorModalProps) {
  const [editedContent, setEditedContent] = useState(content);

  // Reset content when modal opens with new content
  useEffect(() => {
    if (open) {
      setEditedContent(content);
    }
  }, [open, content]);

  const handleApprove = () => {
    onApprove(editedContent);
    onOpenChange(false);
  };

  const handleReject = () => {
    onReject();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Review Content</DialogTitle>
          <DialogDescription>
            Review and edit the content below. You can approve to continue or reject to restart the
            process.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden border border-border rounded-md">
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full min-h-[300px]">
                <Loader2 className="size-8 text-muted-foreground animate-spin" />
              </div>
            }
          >
            <TipTapEditor content={editedContent} onChange={setEditedContent} />
          </Suspense>
        </div>

        <DialogFooter className="flex gap-2 sm:justify-between">
          <Button variant="outline" onClick={handleReject}>
            Reject
          </Button>
          <Button onClick={handleApprove}>Approve</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
