import type { PenDocument, PenNode, Theme, Variables } from './types.js';
import { findNodeById } from './traversal.js';

/**
 * Resolve a variable reference (e.g., "$--background") using theme and variables context
 * @param name - Variable name (with or without $ prefix)
 * @param theme - Theme object from the document
 * @param variables - Additional variables to resolve against
 * @returns Resolved value or the original name if not found
 */
export function resolveVariable(
  name: string,
  theme?: Theme,
  variables?: Variables
): string | number {
  // Remove $ prefix if present
  const varName = name.startsWith('$') ? name.slice(1) : name;

  // Check in provided variables first
  if (variables && varName in variables) {
    const value = variables[varName];
    if (value !== undefined) {
      return value;
    }
  }

  // Check in theme if available
  if (theme && varName in theme) {
    const value = theme[varName];
    if (value !== undefined) {
      return value;
    }
  }

  // Return original name if not found (leave as-is for CSS variables, etc.)
  return name;
}

/**
 * Resolve a component reference by ID
 * @param refId - The ID of the referenced node
 * @param doc - The PEN document to search
 * @returns The referenced node if found, undefined otherwise
 */
export function resolveRef(refId: string, doc: PenDocument): PenNode | undefined {
  return findNodeById(doc, refId);
}

/**
 * Extract theme from the document (looks for theme in root frames)
 * @param doc - The PEN document
 * @returns Theme object if found, undefined otherwise
 */
export function extractTheme(doc: PenDocument): Theme | undefined {
  // Look for theme in root level frames
  for (const child of doc.children) {
    if (child.type === 'frame' && 'theme' in child && child.theme) {
      return child.theme;
    }
  }
  return undefined;
}

/**
 * Build a map of all reusable component IDs to their nodes
 * @param doc - The PEN document
 * @returns Map of component ID to node
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
