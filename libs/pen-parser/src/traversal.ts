import type { PenDocument, PenNode, NodeVisitor } from './types.js';

/**
 * Traverse all nodes in a PEN document using depth-first traversal
 * @param doc - The PEN document to traverse
 * @param visitor - Visitor function called for each node. Return false to skip children.
 */
export function traverseNodes(doc: PenDocument, visitor: NodeVisitor): void {
  const traverse = (node: PenNode, parent?: PenNode, depth = 0): void => {
    // Call visitor - if it returns false, skip children
    const result = visitor(node, parent, depth);
    if (result === false) {
      return;
    }

    // Traverse children if they exist
    if ('children' in node && Array.isArray(node.children)) {
      for (const child of node.children) {
        traverse(child, node, depth + 1);
      }
    }
  };

  // Start traversal from root children
  for (const child of doc.children) {
    traverse(child);
  }
}

/**
 * Find a node by ID in the document
 * @param doc - The PEN document to search
 * @param id - The node ID to find
 * @returns The node if found, undefined otherwise
 */
export function findNodeById(doc: PenDocument, id: string): PenNode | undefined {
  let found: PenNode | undefined;

  traverseNodes(doc, (node) => {
    if (node.id === id) {
      found = node;
      return false; // Stop traversal
    }
  });

  return found;
}

/**
 * Find all nodes matching a predicate
 * @param doc - The PEN document to search
 * @param predicate - Function to test each node
 * @returns Array of matching nodes
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
 * Find all reusable component definitions
 * @param doc - The PEN document to search
 * @returns Array of reusable nodes
 */
export function findReusableComponents(doc: PenDocument): PenNode[] {
  return findNodes(doc, (node) => 'reusable' in node && node.reusable === true);
}
