/**
 * Theme switcher toolbar for Pen designs
 */

import { useEffect } from 'react';
import type { PenTheme } from '@protolabs-ai/types';
import { useDesignsStore } from '@/store/designs-store';
import { Save } from 'lucide-react';
import { Button } from '@protolabs-ai/ui/atoms';

interface DesignsToolbarProps {
  themes: PenTheme[];
  selectedTheme: Record<string, string>;
  onThemeChange: (axis: string, value: string) => void;
}

export function DesignsToolbar({ themes, selectedTheme, onThemeChange }: DesignsToolbarProps) {
  const { isDirty, isSaving, saveDocument, undo, redo, canUndo, canRedo } = useDesignsStore();

  // Setup keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + S to save
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (isDirty && !isSaving) {
          saveDocument();
        }
      }
      // Cmd/Ctrl + Z to undo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (canUndo()) {
          undo();
        }
      }
      // Cmd/Ctrl + Shift + Z to redo
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'z') {
        e.preventDefault();
        if (canRedo()) {
          redo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDirty, isSaving, saveDocument, undo, redo, canUndo, canRedo]);

  // Group themes by their axis (e.g., Mode, Base, Accent)
  // Theme names are typically formatted as "Axis: Value" (e.g., "Mode: Light", "Base: Zinc")
  const themeAxes = new Map<string, string[]>();

  themes.forEach((theme) => {
    const match = theme.name.match(/^([^:]+):\s*(.+)$/);
    if (match) {
      const [, axis, value] = match;
      if (!themeAxes.has(axis)) {
        themeAxes.set(axis, []);
      }
      themeAxes.get(axis)!.push(value);
    }
  });

  // If no structured themes found, show a simple message
  if (themeAxes.size === 0) {
    return (
      <div className="flex items-center gap-3 rounded-lg bg-card px-4 py-2 shadow-sm text-sm text-muted-foreground">
        No theme axes available
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 rounded-lg bg-card px-4 py-2 shadow-sm">
      {/* Save button and undo/redo */}
      <div className="flex items-center gap-2 border-r border-border pr-4">
        <Button
          onClick={() => saveDocument()}
          disabled={!isDirty || isSaving}
          variant={isDirty && !isSaving ? 'default' : 'secondary'}
          size="sm"
          title={isDirty ? 'Save (Cmd+S)' : 'No changes to save'}
          aria-label={isSaving ? 'Saving document' : 'Save document'}
        >
          {isDirty && <span className="w-1.5 h-1.5 bg-primary-foreground rounded-full" />}
          <Save className="w-4 h-4" />
          {isSaving ? 'Saving...' : 'Save'}
        </Button>

        <div className="flex items-center gap-1">
          <Button
            onClick={() => undo()}
            disabled={!canUndo()}
            variant="secondary"
            size="sm"
            title="Undo (Cmd+Z)"
            aria-label="Undo"
          >
            Undo
          </Button>
          <Button
            onClick={() => redo()}
            disabled={!canRedo()}
            variant="secondary"
            size="sm"
            title="Redo (Cmd+Shift+Z)"
            aria-label="Redo"
          >
            Redo
          </Button>
        </div>
      </div>

      {/* Theme switcher */}
      {Array.from(themeAxes.entries()).map(([axis, values]) => (
        <div key={axis} className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{axis}:</span>
          <div className="flex gap-1">
            {values.map((value) => {
              const isSelected = selectedTheme[axis] === value;
              return (
                <Button
                  key={value}
                  onClick={() => onThemeChange(axis, value)}
                  variant={isSelected ? 'default' : 'secondary'}
                  size="sm"
                  title={`Switch to ${axis}: ${value}`}
                  aria-label={`Switch to ${axis}: ${value}`}
                >
                  {value}
                </Button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
