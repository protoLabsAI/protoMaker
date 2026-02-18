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
import { Feature } from '@/store/app-store';

interface DeleteCompletedFeatureDialogProps {
  feature: Feature | null;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteCompletedFeatureDialog({
  feature,
  onClose,
  onConfirm,
}: DeleteCompletedFeatureDialogProps) {
  if (!feature) return null;

  return (
    <Dialog open={!!feature} onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-testid="delete-completed-confirmation-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="w-5 h-5" />
            Delete Feature
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to permanently delete this feature?
            <span className="block mt-2 font-medium text-foreground">
              &quot;{feature.description?.slice(0, 100)}
              {(feature.description?.length ?? 0) > 100 ? '...' : ''}&quot;
            </span>
            <span className="block mt-2 text-destructive font-medium">
              This action cannot be undone.
            </span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} data-testid="cancel-delete-completed-button">
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            data-testid="confirm-delete-completed-button"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
