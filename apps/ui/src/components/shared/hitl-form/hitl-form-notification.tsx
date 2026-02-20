/**
 * HITL Form Notification Badge — Shows count of pending forms.
 * Can be placed in the sidebar or toolbar.
 */

import { Badge } from '@protolabs/ui/atoms';
import { ClipboardList } from 'lucide-react';
import { useHITLFormStore } from '@/store/hitl-form-store';

export function HITLFormNotification() {
  const pendingForms = useHITLFormStore((s) => s.pendingForms);
  const openForm = useHITLFormStore((s) => s.openForm);

  if (pendingForms.length === 0) return null;

  const nextForm = pendingForms[0];

  return (
    <button
      onClick={() => openForm(nextForm)}
      className="relative inline-flex items-center gap-1.5 px-2 py-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      title={`${pendingForms.length} form(s) waiting for input`}
    >
      <ClipboardList className="h-4 w-4" />
      <Badge variant="destructive" className="h-5 min-w-5 px-1 text-xs">
        {pendingForms.length}
      </Badge>
    </button>
  );
}
