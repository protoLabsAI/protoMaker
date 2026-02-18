/**
 * PEN file JSON parser.
 *
 * Parses .pen files (plain JSON) into typed PenDocument objects.
 * Builds lookup indices for fast component resolution.
 */

import type { PenDocument, PenNode, PenFrame } from './types.js';

/** Index of all nodes by ID for fast lookup */
export type NodeIndex = Map<string, PenNode>;

/** Index of reusable components by ID */
export type ComponentIndex = Map<string, PenNode>;

/** Parse result with document and pre-built indices */
export interface ParseResult {
  document: PenDocument;
  nodeIndex: NodeIndex;
  componentIndex: ComponentIndex;
}

/**
 * Parse a .pen JSON string into a typed PenDocument with indices.
 *
 * @param json - Raw JSON string from a .pen file
 * @returns Parsed document with node and component indices
 * @throws If JSON is invalid or missing required fields
 */
export function parsePenDocument(json: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    throw new Error(`Invalid PEN JSON: ${e instanceof Error ? e.message : 'parse error'}`);
  }

  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid PEN document: expected an object');
  }

  const obj = raw as Record<string, unknown>;

  if (!obj.version || typeof obj.version !== 'string') {
    throw new Error('Invalid PEN document: missing or invalid version field');
  }

  if (!Array.isArray(obj.children)) {
    throw new Error('Invalid PEN document: missing children array');
  }

  const document = raw as PenDocument;

  // Build indices
  const nodeIndex: NodeIndex = new Map();
  const componentIndex: ComponentIndex = new Map();

  function indexNode(node: PenNode): void {
    if (node.id) {
      nodeIndex.set(node.id, node);
      if (node.reusable) {
        componentIndex.set(node.id, node);
      }
    }
    if ('children' in node && Array.isArray(node.children)) {
      for (const child of node.children) {
        indexNode(child);
      }
    }
  }

  for (const child of document.children) {
    indexNode(child);
  }

  return { document, nodeIndex, componentIndex };
}

/**
 * Extract all reusable components from a parsed document.
 *
 * @returns Array of reusable component nodes with their names
 */
export function listComponents(
  result: ParseResult
): Array<{ id: string; name: string; type: string }> {
  const components: Array<{ id: string; name: string; type: string }> = [];

  for (const [id, node] of result.componentIndex) {
    components.push({
      id,
      name: node.name ?? id,
      type: node.type,
    });
  }

  return components;
}

/**
 * Find a node by ID in the index.
 */
export function getNodeById(index: NodeIndex, id: string): PenNode | undefined {
  return index.get(id);
}

/**
 * Find a node by navigating a slash-separated path from a root node.
 *
 * For example, "instanceId/childId" navigates from instanceId to its child with id childId.
 */
export function getNodeByPath(index: NodeIndex, path: string): PenNode | undefined {
  const parts = path.split('/');
  if (parts.length === 1) {
    return index.get(parts[0]);
  }

  // Start from the first ID
  let current = index.get(parts[0]);
  if (!current) return undefined;

  for (let i = 1; i < parts.length; i++) {
    if (!current || !('children' in current) || !Array.isArray(current.children)) {
      return undefined;
    }
    const found: PenNode | undefined = current.children.find(
      (c: PenNode) => c.id === parts[i] || c.name === parts[i]
    );
    if (!found) return undefined;
    current = found;
  }

  return current;
}

/**
 * List all .pen design files info from a document.
 * Returns metadata about the document structure.
 */
export function getDocumentInfo(result: ParseResult): {
  version: string;
  themeAxes: Array<{ name: string; values: string[] }>;
  variableCount: number;
  componentCount: number;
  topLevelNodeCount: number;
} {
  const { document } = result;

  const themeAxes: Array<{ name: string; values: string[] }> = [];
  if (document.themes) {
    for (const [name, values] of Object.entries(document.themes)) {
      themeAxes.push({ name, values });
    }
  }

  return {
    version: document.version,
    themeAxes,
    variableCount: document.variables ? Object.keys(document.variables).length : 0,
    componentCount: result.componentIndex.size,
    topLevelNodeCount: document.children.length,
  };
}
