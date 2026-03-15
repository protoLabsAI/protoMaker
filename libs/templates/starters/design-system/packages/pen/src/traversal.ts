/**
 * Node traversal utilities for .pen documents
 *
 * Provides depth-first traversal, node lookup, and component discovery.
 * Zero external dependencies.
 */

import type { PenDocument, PenNode, NodeVisitor } from './types.js';

/**
 * Traverse all nodes in a PenDocument using depth-first order.
 *
 * The visitor is called for every node. If the visitor returns `false`,
 * traversal will not descend into that node's children.
 *
 * @param doc - The PEN document to traverse
 * @param visitor - Called for each node; return false to skip children
 *
 * @example
 * ```ts
 * traverseNodes(doc, (node) => {
 *   console.log(node.type, node.id);
 * });
 * ```
 */
export function traverseNodes(doc: PenDocument, visitor: NodeVisitor): void {
  const traverse = (node: PenNode, parent?: PenNode, depth = 0): void => {
    const result = visitor(node, parent, depth);
    if (result === false) {
      return;
    }

    if ('children' in node && Array.isArray(node.children)) {
      for (const child of node.children) {
        traverse(child, node, depth + 1);
      }
    }
  };

  for (const child of doc.children) {
    traverse(child);
  }
}

/**
 * Find a node by its ID within the document.
 *
 * Returns the first node whose `id` matches. Traversal stops as soon as
 * the node is found.
 *
 * @param doc - The PEN document to search
 * @param id - The node ID to look for
 * @returns The matching node, or `undefined` if not found
 *
 * @example
 * ```ts
 * const btn = findNodeById(doc, 'button-primary');
 * ```
 */
export function findNodeById(doc: PenDocument, id: string): PenNode | undefined {
  let found: PenNode | undefined;

  traverseNodes(doc, (node) => {
    if (node.id === id) {
      found = node;
      return false; // stop traversal
    }
  });

  return found;
}

/**
 * Find all nodes that satisfy a predicate.
 *
 * @param doc - The PEN document to search
 * @param predicate - Test function; return true to include the node
 * @returns Array of matching nodes (depth-first order)
 *
 * @example
 * ```ts
 * const frames = findNodes(doc, (n) => n.type === 'frame');
 * ```
 */
export function findNodes(doc: PenDocument, predicate: (node: PenNode) => boolean): PenNode[] {
  const results: PenNode[] = [];

  traverseNodes(doc, (node) => {
    if (predicate(node)) {
      results.push(node);
    }
  });

  return results;
}

/**
 * Find all reusable component definitions in the document.
 *
 * A node is considered a component if it has `reusable: true`.
 *
 * @param doc - The PEN document to search
 * @returns Array of reusable nodes
 *
 * @example
 * ```ts
 * const components = findReusableComponents(doc);
 * console.log(`Found ${components.length} components`);
 * ```
 */
export function findReusableComponents(doc: PenDocument): PenNode[] {
  return findNodes(doc, (node) => 'reusable' in node && node.reusable === true);
}
