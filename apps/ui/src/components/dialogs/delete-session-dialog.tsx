import { MessageSquare } from 'lucide-react';
import { DeleteConfirmDialog } from '@/components/shared/delete-confirm-dialog';
import type { SessionListItem } from '@/types/electron';

interface DeleteSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: SessionListItem | null;
  onConfirm: (sessionId: string) => void;
}

export function DeleteSessionDialog({
  open,
  onOpenChange,
  session,
  onConfirm,
}: DeleteSessionDialogProps) {
  const handleConfirm = () => {
    if (session) {
      onConfirm(session.id);
    }
  };

  return (
    <DeleteConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={handleConfirm}
      title="Delete Session"
      description="Are you sure you want to delete this session? This action cannot be undone."
      confirmText="Delete Session"
      testId="delete-session-dialog"
      confirmTestId="confirm-delete-session"
    >
      {session && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-sidebar-accent/10 border border-sidebar-border">
          <div className="w-10 h-10 rounded-lg bg-sidebar-accent/20 border border-sidebar-border flex items-center justify-center shrink-0">
            <MessageSquare className="w-5 h-5 text-brand-500" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-foreground truncate">{session.name}</p>
            <p className="text-xs text-muted-foreground">{session.messageCount} messages</p>
          </div>
        </div>
      )}
    </DeleteConfirmDialog>
  );
}
