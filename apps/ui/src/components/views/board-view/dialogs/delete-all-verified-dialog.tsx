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

interface DeleteAllVerifiedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  verifiedCount: number;
  onConfirm: () => void;
}

export function DeleteAllVerifiedDialog({
  open,
  onOpenChange,
  verifiedCount,
  onConfirm,
}: DeleteAllVerifiedDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="delete-all-verified-dialog">
        <DialogHeader>
          <DialogTitle>Delete All Verified Features</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete all verified features? This action cannot be undone.
            {verifiedCount > 0 && (
              <span className="block mt-2 text-yellow-500">
                {verifiedCount} feature(s) will be deleted.
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
            data-testid="confirm-delete-all-verified"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete All
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
