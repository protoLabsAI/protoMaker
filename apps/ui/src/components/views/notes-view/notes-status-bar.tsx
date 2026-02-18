import { Eye, EyeOff, Pencil } from 'lucide-react';
import type { NoteTabPermissions } from '@automaker/types';

interface NotesStatusBarProps {
  wordCount: number;
  characterCount: number;
  isSaving: boolean;
  hasUnsavedChanges: boolean;
  permissions: NoteTabPermissions;
}

export function NotesStatusBar({
  wordCount,
  characterCount,
  isSaving,
  hasUnsavedChanges,
  permissions,
}: NotesStatusBarProps) {
  return (
    <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-1 text-xs text-muted-foreground">
      <div className="flex items-center gap-3">
        <span>
          {wordCount} {wordCount === 1 ? 'word' : 'words'}
        </span>
        <span>{characterCount} chars</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          {permissions.agentRead ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
          <span>{permissions.agentRead ? 'Visible to AI' : 'Hidden from AI'}</span>
        </div>
        {permissions.agentWrite && (
          <div className="flex items-center gap-1">
            <Pencil className="size-3" />
            <span>AI writable</span>
          </div>
        )}
        <span className={hasUnsavedChanges && !isSaving ? 'text-yellow-500' : ''}>
          {isSaving ? 'Saving...' : hasUnsavedChanges ? 'Unsaved' : 'Saved'}
        </span>
      </div>
    </div>
  );
}
