/**
 * Ref resolver for .pen component instances.
 *
 * When a `ref` node references a `reusable` component, the resolver
 * deep-clones the component and applies any property overrides from
 * the ref's `descendants` map and direct property overrides.
 */

import type { PenNode, PenRef, PenFrame, PenThemeSelection } from './types.js';
import type { ComponentIndex, NodeIndex } from './parser.js';

/**
 * Deep clone a PEN node tree.
 */
function deepCloneNode<T extends PenNode>(node: T): T {
  return JSON.parse(JSON.stringify(node)) as T;
}

/**
 * Find a descendant node by ID within a node tree.
 */
function findDescendantById(node: PenNode, targetId: string): PenNode | undefined {
  if (node.id === targetId) return node;
  if ('children' in node && Array.isArray(node.children)) {
    for (const child of node.children) {
      const found = findDescendantById(child, targetId);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * Apply property overrides to a node, excluding structural properties.
 */
function applyOverrides(target: PenNode, overrides: Record<string, unknown>): void {
  const t = target as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(overrides)) {
    // Don't override structural properties
    if (key === 'id' || key === 'type' || key === 'children' || key === 'descendants') {
      continue;
    }
    t[key] = value;
  }
}

/**
 * Resolve a ref node into a fully expanded node tree.
 *
 * Process:
 * 1. Look up the referenced component by ID
 * 2. Deep clone the component
 * 3. Apply direct property overrides from the ref (fill, width, etc.)
 * 4. Apply descendant overrides via the `descendants` map
 * 5. If the ref has children, replace the component's children
 *
 * @param ref - The ref node to resolve
 * @param componentIndex - Index of reusable components
 * @param nodeIndex - Full node index (for nested ref resolution)
 * @param maxDepth - Maximum recursion depth to prevent infinite loops (default: 10)
 * @returns The resolved node tree, or undefined if the component is not found
 */
export function resolveRef(
  ref: PenRef,
  componentIndex: ComponentIndex,
  nodeIndex: NodeIndex,
  maxDepth: number = 10
): PenNode | undefined {
  if (maxDepth <= 0) {
    return undefined; // Prevent infinite recursion
  }

  const component = componentIndex.get(ref.ref);
  if (!component) {
    return undefined;
  }

  // Deep clone the component
  const resolved = deepCloneNode(component);

  // Override the ID to match the ref instance
  resolved.id = ref.id;
  if (ref.name) resolved.name = ref.name;

  // Apply direct property overrides from the ref
  const directOverrides: Record<string, unknown> = {};
  if (ref.fill !== undefined) directOverrides.fill = ref.fill;
  if (ref.width !== undefined) directOverrides.width = ref.width;
  if (ref.height !== undefined) directOverrides.height = ref.height;
  if (ref.stroke !== undefined) directOverrides.stroke = ref.stroke;
  if (ref.x !== undefined) directOverrides.x = ref.x;
  if (ref.y !== undefined) directOverrides.y = ref.y;
  if (ref.opacity !== undefined) directOverrides.opacity = ref.opacity;
  if (ref.visible !== undefined) directOverrides.visible = ref.visible;
  if (ref.theme !== undefined) directOverrides.theme = ref.theme;

  applyOverrides(resolved, directOverrides);

  // Apply descendant overrides
  if (ref.descendants) {
    for (const [path, overrides] of Object.entries(ref.descendants)) {
      // Path can be a simple ID or a slash-separated path
      const parts = path.split('/');

      let target: PenNode | undefined;
      if (parts.length === 1) {
        target = findDescendantById(resolved, parts[0]);
      } else {
        // Navigate the path from the resolved root
        target = resolved;
        for (const part of parts) {
          if (!target || !('children' in target) || !Array.isArray(target.children)) {
            target = undefined;
            break;
          }
          target = target.children.find((c: PenNode) => c.id === part);
        }
      }

      if (target) {
        applyOverrides(target, overrides as Record<string, unknown>);
      }
    }
  }

  // If the ref provides children, replace the component's children
  if (ref.children && ref.children.length > 0 && 'children' in resolved) {
    (resolved as PenFrame).children = ref.children;
  }

  // Recursively resolve any nested refs in the resolved tree
  resolveNestedRefs(resolved, componentIndex, nodeIndex, maxDepth - 1);

  return resolved;
}

/**
 * Recursively resolve any nested ref nodes within a node tree.
 */
function resolveNestedRefs(
  node: PenNode,
  componentIndex: ComponentIndex,
  nodeIndex: NodeIndex,
  maxDepth: number
): void {
  if (!('children' in node) || !Array.isArray(node.children)) {
    return;
  }

  const frame = node as PenFrame;
  if (!frame.children) return;

  for (let i = 0; i < frame.children.length; i++) {
    const child = frame.children[i];
    if (child.type === 'ref') {
      const resolved = resolveRef(child as PenRef, componentIndex, nodeIndex, maxDepth);
      if (resolved) {
        frame.children[i] = resolved;
      }
    } else {
      resolveNestedRefs(child, componentIndex, nodeIndex, maxDepth);
    }
  }
}

/**
 * Resolve all ref nodes in an entire document tree.
 *
 * Returns a new tree with all refs expanded. Original tree is not modified.
 */
export function resolveAllRefs(
  nodes: PenNode[],
  componentIndex: ComponentIndex,
  nodeIndex: NodeIndex
): PenNode[] {
  const result = nodes.map((n) => deepCloneNode(n));

  for (let i = 0; i < result.length; i++) {
    if (result[i].type === 'ref') {
      const resolved = resolveRef(result[i] as PenRef, componentIndex, nodeIndex);
      if (resolved) {
        result[i] = resolved;
      }
    } else {
      resolveNestedRefs(result[i], componentIndex, nodeIndex, 10);
    }
  }

  return result;
}
