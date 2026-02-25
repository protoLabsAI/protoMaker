/**
 * Theme switcher toolbar for Pen designs
 */

import type { PenTheme } from '@protolabs-ai/types';

interface DesignsToolbarProps {
  themes: PenTheme[];
  selectedTheme: Record<string, string>;
  onThemeChange: (axis: string, value: string) => void;
}

export function DesignsToolbar({ themes, selectedTheme, onThemeChange }: DesignsToolbarProps) {
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
