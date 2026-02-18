import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@protolabs/ui/atoms';
import { Button } from '@protolabs/ui/atoms';
import { Trash2 } from 'lucide-react';

interface DeleteAllArchivedSessionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  archivedCount: number;
  onConfirm: () => void;
}

export function DeleteAllArchivedSessionsDialog({
  open,
  onOpenChange,
  archivedCount,
  onConfirm,
}: DeleteAllArchivedSessionsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="delete-all-archived-sessions-dialog">
        <DialogHeader>
          <DialogTitle>Delete All Archived Sessions</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete all archived sessions? This action cannot be undone.
            {archivedCount > 0 && (
              <span className="block mt-2 text-yellow-500">
                {archivedCount} session(s) will be deleted.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            data-testid="confirm-delete-all-archived-sessions"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete All
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
