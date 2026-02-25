/**
 * Theme context for resolving Pen variables with theme-dependent values
 */

import { createContext, useContext, useState, useMemo, type ReactNode } from 'react';
import type { PenDocument } from '@protolabs-ai/types';

/**
 * Theme selections (e.g., { Mode: "Dark", Base: "Zinc", Accent: "Violet" })
 */
export type ThemeSelections = Record<string, string>;

/**
 * Variable value with optional theme constraints
 */
interface VariableValue {
  value: string | number | boolean;
  theme?: Record<string, string>;
}

/**
 * Variable definition
 */
interface Variable {
  type: 'color' | 'number' | 'string' | 'boolean';
  value: VariableValue[];
}

/**
 * Themes structure (e.g., { Mode: ["Light", "Dark"], Base: ["Zinc", "Slate"] })
 */
export type ThemeAxes = Record<string, string[]>;

interface PenThemeContextValue {
  themes: ThemeAxes;
  variables: Record<string, Variable>;
  selections: ThemeSelections;
  setSelection: (axis: string, value: string) => void;
  resolveVariable: (name: string) => string | number | boolean | null;
}

const PenThemeContext = createContext<PenThemeContextValue | null>(null);

/**
 * Hook to access theme context
 */
export function usePenTheme() {
  const context = useContext(PenThemeContext);
  if (!context) {
    throw new Error('usePenTheme must be used within PenThemeProvider');
  }
  return context;
}

interface PenThemeProviderProps {
  document: PenDocument | null;
  children: ReactNode;
}

/**
 * Provider that manages theme state and variable resolution
 */
export function PenThemeProvider({ document, children }: PenThemeProviderProps) {
  // Extract themes and variables from document
  const themes = useMemo<ThemeAxes>(() => {
    if (!document?.themes) return {};
    // Convert PenDocument themes format to our internal format
    if (typeof document.themes === 'object' && !Array.isArray(document.themes)) {
      return document.themes as ThemeAxes;
    }
    return {};
  }, [document]);

  const variables = useMemo<Record<string, Variable>>(() => {
    if (!document?.variables) return {};
    // Convert PenDocument variables format to our internal format
    if (typeof document.variables === 'object') {
      return document.variables as Record<string, Variable>;
    }
    return {};
  }, [document]);

  // Initialize selections with first value from each axis
  const initialSelections = useMemo<ThemeSelections>(() => {
    const selections: ThemeSelections = {};
    for (const [axis, values] of Object.entries(themes)) {
      if (values.length > 0) {
        selections[axis] = values[0];
      }
    }
    return selections;
  }, [themes]);

  const [selections, setSelections] = useState<ThemeSelections>(initialSelections);

  // Update selection for a specific axis
  const setSelection = (axis: string, value: string) => {
    setSelections((prev) => ({ ...prev, [axis]: value }));
  };

  /**
   * Resolve a variable to its value based on current theme selections
   * Returns the most specific match or default value
   */
  const resolveVariable = (name: string): string | number | boolean | null => {
    // Remove $ prefix if present
    const varName = name.startsWith('$') ? name.slice(1) : name;

    const variable = variables[varName];
    if (!variable || !variable.value) {
      return null;
    }

    // Find the best match for current theme
    let bestMatch: VariableValue | null = null;
    let bestMatchScore = -1;

    for (const valueEntry of variable.value) {
      if (!valueEntry.theme) {
        // Default value (no theme constraints)
        if (bestMatchScore === -1) {
          bestMatch = valueEntry;
          bestMatchScore = 0;
        }
      } else {
        // Check how many theme axes match
        let matchScore = 0;
        let allMatch = true;

        for (const [axis, requiredValue] of Object.entries(valueEntry.theme)) {
          if (selections[axis] === requiredValue) {
            matchScore++;
          } else {
            allMatch = false;
            break;
          }
        }

        // Update best match if this is a complete match and more specific
        if (allMatch && matchScore > bestMatchScore) {
          bestMatch = valueEntry;
          bestMatchScore = matchScore;
        }
      }
    }

    return bestMatch?.value ?? null;
  };

  const value: PenThemeContextValue = {
    themes,
    variables,
    selections,
    setSelection,
    resolveVariable,
  };

  return <PenThemeContext.Provider value={value}>{children}</PenThemeContext.Provider>;
}
