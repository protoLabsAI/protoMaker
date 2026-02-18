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
  PenLayoutMode,
  ResolvedNode,
  ResolvedStyles,
} from './types.js';
import type { ParseResult } from './parser.js';
import { createVariableResolver } from './variables.js';
import { convertNodeToStyles } from './layout.js';
import { resolveRef } from './refs.js';

/**
 * Get the layout mode of a node (for passing to children as parent context).
 */
function getNodeLayout(node: PenNode): PenLayoutMode | undefined {
  if (node.type === 'frame') {
    return (node as PenFrame).layout;
  }
  return undefined;
}

/**
 * Resolve a single PEN node into a ResolvedNode.
 *
 * This is the core of the rendering pipeline:
 * 1. If ref → resolve to expanded component tree
 * 2. Resolve variable references in fills/colors
 * 3. Convert layout to CSS styles
 * 4. Recursively resolve children
 *
 * @param node - The node to resolve
 * @param resolveFill - Variable resolver function
 * @param parseResult - Parsed document with indices
 * @param theme - Active theme selection
 * @param parentLayout - The parent's layout mode (determines absolute vs flow positioning)
 */
function resolveNode(
  node: PenNode,
  resolveFill: (fill: unknown) => string | undefined,
  parseResult: ParseResult,
  theme: PenThemeSelection,
  parentLayout?: PenLayoutMode
): ResolvedNode | undefined {
  // Handle ref nodes — expand to component tree first
  if (node.type === 'ref') {
    const ref = node as PenRef;
    const expanded = resolveRef(ref, parseResult.componentIndex, parseResult.nodeIndex);
    if (!expanded) return undefined;
    return resolveNode(expanded, resolveFill, parseResult, theme, parentLayout);
  }

  // Skip invisible nodes
  if (node.visible === false) return undefined;

  // Convert to CSS styles (pass parent layout for positioning context)
  const styles = convertNodeToStyles(node, resolveFill, parentLayout);

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

  // Path geometry and stroke info for SVG rendering
  if (node.type === 'path' || node.type === 'line') {
    const pathNode = node as PenNode & {
      geometry?: string;
      stroke?: { fill?: string; thickness?: number; cap?: string; join?: string };
    };
    if (pathNode.geometry) {
      resolved.geometry = pathNode.geometry;
    }
    if (pathNode.stroke) {
      const strokeColor = pathNode.stroke.fill ? resolveFill(pathNode.stroke.fill) : undefined;
      resolved.stroke = {
        color: strokeColor ?? 'currentColor',
        width: typeof pathNode.stroke.thickness === 'number' ? pathNode.stroke.thickness : 1,
        cap: pathNode.stroke.cap,
        join: pathNode.stroke.join,
      };
    }
  }

  // Recursively resolve children, passing THIS node's layout as parent context
  const thisLayout = getNodeLayout(node);
  if ('children' in node && Array.isArray(node.children)) {
    resolved.children = [];
    for (const child of node.children) {
      const resolvedChild = resolveNode(child, resolveFill, parseResult, theme, thisLayout);
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
