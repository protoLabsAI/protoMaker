/**
 * Variable and theme resolution utilities for .pen documents
 *
 * Resolves `$--variable` references, component refs, and theme extraction.
 * Zero external dependencies.
 */

import type { PenDocument, PenNode, Theme, Variables } from './types.js';
import { findNodeById } from './traversal.js';

/**
 * Resolve a variable reference such as `$--background` using the provided
 * theme and variables context.
 *
 * Resolution order:
 * 1. `variables` map (runtime overrides)
 * 2. `theme` map (document-level theme)
 * 3. Original name (returned as-is for CSS variables, etc.)
 *
 * @param name - Variable name, with or without `$` prefix
 * @param theme - Theme selection object from the document
 * @param variables - Additional variables to resolve against
 * @returns Resolved string/number value, or original name if not found
 *
 * @example
 * ```ts
 * const color = resolveVariable('$--primary', doc.theme, variables);
 * // → '#3B82F6' or 'var(--primary)'
 * ```
 */
export function resolveVariable(
  name: string,
  theme?: Theme,
  variables?: Variables
): string | number {
  const varName = name.startsWith('$') ? name.slice(1) : name;

  if (variables && varName in variables) {
    const value = variables[varName];
    if (value !== undefined) {
      return value;
    }
  }

  if (theme && varName in theme) {
    const value = theme[varName];
    if (value !== undefined) {
      return value;
    }
  }

  // Leave unresolved — callers can convert to CSS var() if needed
  return name;
}

/**
 * Resolve a component reference by node ID.
 *
 * Looks up the node with the given `refId` in the document tree.
 *
 * @param refId - The ID of the referenced node
 * @param doc - The PEN document to search
 * @returns The referenced node, or `undefined` if not found
 *
 * @example
 * ```ts
 * const component = resolveRef(refNode.ref, doc);
 * ```
 */
export function resolveRef(refId: string, doc: PenDocument): PenNode | undefined {
  return findNodeById(doc, refId);
}

/**
 * Extract the active theme from the document.
 *
 * Searches root-level frame nodes for a `theme` property.
 *
 * @param doc - The PEN document
 * @returns Theme object if found, `undefined` otherwise
 *
 * @example
 * ```ts
 * const theme = extractTheme(doc);
 * // → { Mode: 'Light', Base: 'Zinc', Accent: 'Blue' }
 * ```
 */
export function extractTheme(doc: PenDocument): Theme | undefined {
  for (const child of doc.children) {
    if (child.type === 'frame' && 'theme' in child && child.theme) {
      return child.theme as Theme;
    }
  }
  return undefined;
}

/**
 * Build a map of all reusable component IDs to their nodes.
 *
 * Traverses the full document tree and collects every node that has
 * `reusable: true`.
 *
 * @param doc - The PEN document
 * @returns Map from node ID → node
 *
 * @example
 * ```ts
 * const components = buildComponentMap(doc);
 * const btn = components.get('button-primary');
 * ```
 */
export function buildComponentMap(doc: PenDocument): Map<string, PenNode> {
  const map = new Map<string, PenNode>();

  const traverse = (node: PenNode): void => {
    if ('reusable' in node && node.reusable === true) {
      map.set(node.id, node);
    }

    if ('children' in node && Array.isArray(node.children)) {
      for (const child of node.children) {
        traverse(child);
      }
    }
  };

  for (const child of doc.children) {
    traverse(child);
  }

  return map;
}
