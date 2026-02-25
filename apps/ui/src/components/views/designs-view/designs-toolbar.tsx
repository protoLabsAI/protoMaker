/**
 * Theme switcher toolbar for Pen designs
 */

import { useEffect } from 'react';
import type { PenTheme } from '@protolabs-ai/types';
import { useDesignsStore } from '@/store/designs-store';
import { Save } from 'lucide-react';

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
        if (canUndo) {
          undo();
        }
      }
      // Cmd/Ctrl + Shift + Z to redo
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'z') {
        e.preventDefault();
        if (canRedo) {
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
      <div className="flex items-center gap-3 rounded-lg bg-white px-4 py-2 shadow-sm text-sm text-muted-foreground">
        No theme axes available
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 rounded-lg bg-white px-4 py-2 shadow-sm">
      {/* Save button and undo/redo */}
      <div className="flex items-center gap-2 border-r border-gray-200 pr-4">
        <button
          onClick={() => saveDocument()}
          disabled={!isDirty || isSaving}
          className={`
            flex items-center gap-1.5 rounded px-3 py-1 text-sm font-medium transition-colors
            ${
              isDirty && !isSaving
                ? 'bg-blue-500 text-white hover:bg-blue-600 shadow-sm'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }
          `}
          title={isDirty ? 'Save (Cmd+S)' : 'No changes to save'}
        >
          {isDirty && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
          <Save className="w-4 h-4" />
          {isSaving ? 'Saving...' : 'Save'}
        </button>

        <div className="flex items-center gap-1">
          <button
            onClick={() => undo()}
            disabled={!canUndo}
            className={`
              rounded px-2 py-1 text-xs font-medium transition-colors
              ${
                canUndo
                  ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  : 'bg-gray-50 text-gray-300 cursor-not-allowed'
              }
            `}
            title="Undo (Cmd+Z)"
          >
            Undo
          </button>
          <button
            onClick={() => redo()}
            disabled={!canRedo}
            className={`
              rounded px-2 py-1 text-xs font-medium transition-colors
              ${
                canRedo
                  ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  : 'bg-gray-50 text-gray-300 cursor-not-allowed'
              }
            `}
            title="Redo (Cmd+Shift+Z)"
          >
            Redo
          </button>
        </div>
      </div>

      {/* Theme switcher */}
      {Array.from(themeAxes.entries()).map(([axis, values]) => (
        <div key={axis} className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">{axis}:</span>
          <div className="flex gap-1">
            {values.map((value) => {
              const isSelected = selectedTheme[axis] === value;
              return (
                <button
                  key={value}
                  onClick={() => onThemeChange(axis, value)}
                  className={`
                    rounded px-3 py-1 text-sm font-medium transition-colors
                    ${
                      isSelected
                        ? 'bg-blue-500 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }
                  `}
                  title={`Switch to ${axis}: ${value}`}
                >
                  {value}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
