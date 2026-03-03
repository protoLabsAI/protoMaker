import { useEffect, useRef, useCallback, useState } from 'react';
import { FilePlus, FolderPlus, Pencil, Trash2, Copy, ClipboardCopy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@protolabs-ai/ui/molecules';

export interface ContextMenuTarget {
  x: number;
  y: number;
  relativePath: string;
  isDirectory: boolean;
}

interface FileTreeContextMenuProps {
  target: ContextMenuTarget;
  onClose: () => void;
  onNewFile: (parentDir: string) => void;
  onNewFolder: (parentDir: string) => void;
  onRename: (relativePath: string) => void;
  onDelete: (relativePath: string, isDirectory: boolean) => void;
  onCopyRelativePath: (relativePath: string) => void;
  onCopyAbsolutePath: (relativePath: string) => void;
}

interface MenuItem {
  icon: typeof FilePlus;
  label: string;
  onClick: () => void;
  variant?: 'destructive';
  dividerBefore?: boolean;
}

export function FileTreeContextMenu({
  target,
  onClose,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
  onCopyRelativePath,
  onCopyAbsolutePath,
}: FileTreeContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    const handleClickOutside = (e: globalThis.MouseEvent) => {
      if (showDeleteConfirm) return;
      if (menuRef.current && !menuRef.current.contains(e.target as globalThis.Node)) {
        onClose();
      }
    };
    const handleEscape = (e: globalThis.KeyboardEvent) => {
      if (showDeleteConfirm) return;
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose, showDeleteConfirm]);

  const parentDir = target.isDirectory
    ? target.relativePath
    : target.relativePath.split('/').slice(0, -1).join('/') || '.';

  const handleDelete = useCallback(() => {
    setShowDeleteConfirm(true);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    onDelete(target.relativePath, target.isDirectory);
    setShowDeleteConfirm(false);
    onClose();
  }, [onDelete, onClose, target]);

  const items: MenuItem[] = [];

  if (target.isDirectory) {
    items.push(
      {
        icon: FilePlus,
        label: 'New File',
        onClick: () => {
          onNewFile(parentDir);
          onClose();
        },
      },
      {
        icon: FolderPlus,
        label: 'New Folder',
        onClick: () => {
          onNewFolder(parentDir);
          onClose();
        },
      }
    );
  }

  items.push(
    {
      icon: Pencil,
      label: 'Rename',
      onClick: () => {
        onRename(target.relativePath);
        onClose();
      },
    },
    {
      icon: Trash2,
      label: 'Delete',
      onClick: handleDelete,
      variant: 'destructive',
      dividerBefore: true,
    },
    {
      icon: Copy,
      label: 'Copy Path',
      onClick: () => {
        onCopyRelativePath(target.relativePath);
        onClose();
      },
      dividerBefore: true,
    },
    {
      icon: ClipboardCopy,
      label: 'Copy Absolute Path',
      onClick: () => {
        onCopyAbsolutePath(target.relativePath);
        onClose();
      },
    }
  );

  const fileName = target.relativePath.split('/').pop() ?? target.relativePath;

  return (
    <>
      {!showDeleteConfirm && (
        <div
          ref={menuRef}
          className={cn(
            'fixed min-w-44 rounded-lg',
            'bg-popover text-popover-foreground',
            'border border-border shadow-lg',
            'animate-in fade-in zoom-in-95 duration-100',
            'z-[100]'
          )}
          style={{ top: target.y, left: target.x }}
        >
          <div className="p-1">
            {items.map(({ icon: Icon, label, onClick, variant, dividerBefore }) => (
              <div key={label}>
                {dividerBefore && <div className="h-px bg-border my-1" />}
                <button
                  onClick={onClick}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-1.5 rounded-md',
                    'text-xs text-left',
                    'hover:bg-accent transition-colors',
                    'focus:outline-none focus:bg-accent',
                    variant === 'destructive' && 'text-destructive hover:bg-destructive/10'
                  )}
                >
                  <Icon className="size-3.5" />
                  <span>{label}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={(isOpen) => {
          setShowDeleteConfirm(isOpen);
          if (!isOpen) onClose();
        }}
        onConfirm={handleConfirmDelete}
        title={`Delete ${target.isDirectory ? 'Folder' : 'File'}`}
        description={`Are you sure you want to delete "${fileName}"? This action cannot be undone.`}
        icon={Trash2}
        iconClassName="text-destructive"
        confirmText="Delete"
        confirmVariant="destructive"
      />
    </>
  );
}
