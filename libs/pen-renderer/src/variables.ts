/**
 * Theme variable resolver for .pen files.
 *
 * Resolves variable references like "$--primary" against the document's
 * variable definitions and active theme selection. Uses a scoring system
 * where more specific theme axis matches win.
 */

import type { PenVariable, PenThemeSelection, PenThemedValue, PenDocument } from './types.js';

/**
 * Resolve a single variable reference against a theme selection.
 *
 * Algorithm:
 * 1. Filter themed values to those compatible with the theme selection
 * 2. Score each candidate by how many theme axes match
 * 3. Return the highest-scoring match (most specific)
 * 4. Fall back to the unthemed default (no theme key) if no match
 *
 * @param variable - The variable definition with themed values
 * @param theme - Active theme selection (e.g., { Mode: "Dark", Base: "Zinc", Accent: "Violet" })
 * @returns The resolved value, or undefined if no match
 */
export function resolveVariable(
  variable: PenVariable,
  theme: PenThemeSelection
): string | number | boolean | undefined {
  if (!variable.value || variable.value.length === 0) {
    return undefined;
  }

  let bestMatch: PenThemedValue | undefined;
  let bestScore = -1;

  for (const entry of variable.value) {
    if (!entry.theme) {
      // Unthemed default — score 0 (lowest priority)
      if (bestScore < 0) {
        bestMatch = entry;
        bestScore = 0;
      }
      continue;
    }

    // Check compatibility: every axis in the entry's theme must match the active theme
    let compatible = true;
    let score = 0;

    for (const [axis, value] of Object.entries(entry.theme)) {
      if (theme[axis] === undefined) {
        // Theme selection doesn't specify this axis — entry is still compatible
        continue;
      }
      if (theme[axis] !== value) {
        compatible = false;
        break;
      }
      score++;
    }

    if (compatible && score > bestScore) {
      bestMatch = entry;
      bestScore = score;
    }
  }

  return bestMatch?.value;
}

/**
 * Build a resolved variable map for a given theme selection.
 *
 * @param variables - All variable definitions from the document
 * @param theme - Active theme selection
 * @returns Map of variable name → resolved value
 */
export function resolveAllVariables(
  variables: Record<string, PenVariable>,
  theme: PenThemeSelection
): Map<string, string | number | boolean> {
  const resolved = new Map<string, string | number | boolean>();

  for (const [name, variable] of Object.entries(variables)) {
    const value = resolveVariable(variable, theme);
    if (value !== undefined) {
      resolved.set(name, value);
    }
  }

  return resolved;
}

/**
 * Resolve a fill value that may be a variable reference.
 *
 * Variable references start with "$" (e.g., "$--primary").
 * Plain values are returned as-is.
 *
 * @param fill - A fill value (string color, variable ref, or complex fill)
 * @param resolvedVars - Pre-resolved variable map
 * @returns The resolved color string, or the original value if not a variable
 */
export function resolveFillValue(
  fill: unknown,
  resolvedVars: Map<string, string | number | boolean>
): string | undefined {
  if (typeof fill !== 'string') {
    // Complex fills (gradients, images) are not resolved here
    return undefined;
  }

  if (fill.startsWith('$')) {
    const varName = fill.slice(1); // Remove $ prefix
    const value = resolvedVars.get(varName);
    return value !== undefined ? String(value) : undefined;
  }

  // Plain color value
  return fill;
}

/**
 * Create a variable resolver function bound to a specific theme.
 *
 * This is the main entry point for the variable resolution pipeline.
 *
 * @param document - The parsed PEN document
 * @param theme - Theme selection to resolve against
 * @returns A resolver function that resolves variable references
 */
export function createVariableResolver(
  document: PenDocument,
  theme: PenThemeSelection
): (fill: unknown) => string | undefined {
  const resolvedVars = document.variables
    ? resolveAllVariables(document.variables, theme)
    : new Map<string, string | number | boolean>();

  return (fill: unknown) => resolveFillValue(fill, resolvedVars);
}
