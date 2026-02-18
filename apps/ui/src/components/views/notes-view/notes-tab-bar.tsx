import { useState, useCallback } from 'react';
import { X, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@protolabs/ui/atoms';
import { Input } from '@protolabs/ui/atoms';

interface NotesTabBarProps {
  tabs: Array<{ id: string; name: string }>;
  activeTabId: string | null;
  onSwitch: (tabId: string) => void;
  onAdd: () => void;
  onClose: (tabId: string) => void;
  onRename: (tabId: string, name: string) => void;
}

export function NotesTabBar({
  tabs,
  activeTabId,
  onSwitch,
  onAdd,
  onClose,
  onRename,
}: NotesTabBarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const handleDoubleClick = useCallback((tabId: string, currentName: string) => {
    setEditingId(tabId);
    setEditValue(currentName);
  }, []);

  const handleRenameSubmit = useCallback(
    (tabId: string) => {
      const trimmed = editValue.trim();
      if (trimmed) onRename(tabId, trimmed);
      setEditingId(null);
    },
    [editValue, onRename]
  );

  return (
    <div className="flex items-center gap-0.5 border-b border-border bg-muted/30 px-1">
      <div className="flex flex-1 items-center gap-0.5 overflow-x-auto py-1">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={cn(
              'group flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-colors',
              'cursor-pointer select-none',
              tab.id === activeTabId
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
            )}
            onClick={() => onSwitch(tab.id)}
            onDoubleClick={() => handleDoubleClick(tab.id, tab.name)}
          >
            {editingId === tab.id ? (
              <Input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => handleRenameSubmit(tab.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameSubmit(tab.id);
                  if (e.key === 'Escape') setEditingId(null);
                }}
                className="h-5 w-24 px-1 text-xs"
                autoFocus
              />
            ) : (
              <>
                <span className="max-w-[120px] truncate">{tab.name}</span>
                {tabs.length > 1 && (
                  <button
                    className="ml-0.5 hidden rounded p-0.5 text-muted-foreground/50 hover:bg-muted hover:text-foreground group-hover:inline-flex"
                    onClick={(e) => {
                      e.stopPropagation();
                      onClose(tab.id);
                    }}
                  >
                    <X className="size-3" />
                  </button>
                )}
              </>
            )}
          </div>
        ))}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-6 shrink-0"
        onClick={onAdd}
        title="New tab"
      >
        <Plus className="size-3.5" />
      </Button>
    </div>
  );
}
