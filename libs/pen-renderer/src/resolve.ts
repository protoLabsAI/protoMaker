/**
 * Full resolution pipeline for .pen files.
 *
 * Takes a PenDocument + theme selection and produces a tree of ResolvedNodes
 * ready for React rendering.
 */

import type {
  PenDocument,
  PenNode,
  PenFrame,
  PenText,
  PenIconFont,
  PenRef,
  PenThemeSelection,
  ResolvedNode,
  ResolvedStyles,
} from './types.js';
import type { ParseResult } from './parser.js';
import { createVariableResolver } from './variables.js';
import { convertNodeToStyles } from './layout.js';
import { resolveRef } from './refs.js';

/**
 * Resolve a single PEN node into a ResolvedNode.
 *
 * This is the core of the rendering pipeline:
 * 1. If ref → resolve to expanded component tree
 * 2. Resolve variable references in fills/colors
 * 3. Convert layout to CSS styles
 * 4. Recursively resolve children
 */
function resolveNode(
  node: PenNode,
  resolveFill: (fill: unknown) => string | undefined,
  parseResult: ParseResult,
  theme: PenThemeSelection
): ResolvedNode | undefined {
  // Handle ref nodes — expand to component tree first
  if (node.type === 'ref') {
    const ref = node as PenRef;
    const expanded = resolveRef(ref, parseResult.componentIndex, parseResult.nodeIndex);
    if (!expanded) return undefined;
    return resolveNode(expanded, resolveFill, parseResult, theme);
  }

  // Skip invisible nodes
  if (node.visible === false) return undefined;

  // Convert to CSS styles
  const styles = convertNodeToStyles(node, resolveFill);

  const resolved: ResolvedNode = {
    id: node.id,
    type: node.type,
    name: node.name,
    styles,
    reusable: node.reusable,
  };

  // Text content
  if (node.type === 'text') {
    resolved.content = (node as PenText).content;
  }

  // Icon info
  if (node.type === 'icon_font') {
    const icon = node as PenIconFont;
    resolved.iconFamily = icon.iconFontFamily;
    resolved.iconName = icon.iconFontName;
  }

  // Recursively resolve children
  if ('children' in node && Array.isArray(node.children)) {
    resolved.children = [];
    for (const child of node.children) {
      const resolvedChild = resolveNode(child, resolveFill, parseResult, theme);
      if (resolvedChild) {
        resolved.children.push(resolvedChild);
      }
    }
  }

  return resolved;
}

/**
 * Resolve an entire PEN document into a renderable tree.
 *
 * @param parseResult - The parsed document with indices
 * @param theme - Active theme selection
 * @returns Array of resolved top-level nodes
 */
export function resolveDocument(
  parseResult: ParseResult,
  theme: PenThemeSelection
): ResolvedNode[] {
  const resolveFill = createVariableResolver(parseResult.document, theme);
  const results: ResolvedNode[] = [];

  for (const child of parseResult.document.children) {
    const resolved = resolveNode(child, resolveFill, parseResult, theme);
    if (resolved) {
      results.push(resolved);
    }
  }

  return results;
}

/**
 * Resolve a single component by ID for preview rendering.
 *
 * Useful for the component browser / Storybook-like panel.
 *
 * @param parseResult - The parsed document with indices
 * @param componentId - ID of the reusable component to resolve
 * @param theme - Active theme selection
 * @returns The resolved component tree, or undefined if not found
 */
export function resolveComponent(
  parseResult: ParseResult,
  componentId: string,
  theme: PenThemeSelection
): ResolvedNode | undefined {
  const component = parseResult.componentIndex.get(componentId);
  if (!component) return undefined;

  const resolveFill = createVariableResolver(parseResult.document, theme);
  return resolveNode(component, resolveFill, parseResult, theme);
}
