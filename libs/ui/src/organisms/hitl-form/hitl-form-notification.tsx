/**
 * HITL Form Notification Badge — Shows count of pending forms.
 * Can be placed in the sidebar or toolbar.
 *
 * Presentational component — connect to your store in the consuming app.
 */

import { Badge } from '../../atoms/badge.js';
import { ClipboardList } from 'lucide-react';

export interface HITLFormNotificationProps {
  pendingCount: number;
  onOpen: () => void;
}

export function HITLFormNotification({ pendingCount, onOpen }: HITLFormNotificationProps) {
  if (pendingCount === 0) return null;

  return (
    <button
      onClick={onOpen}
      className="relative inline-flex items-center gap-1.5 px-2 py-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      title={`${pendingCount} form(s) waiting for input`}
    >
      <ClipboardList className="h-4 w-4" />
      <Badge variant="destructive" className="h-5 min-w-5 px-1 text-xs">
        {pendingCount}
      </Badge>
    </button>
  );
}
