/**
 * design-tools.ts
 *
 * MCP tools for reading and writing .pen design files.
 *
 * Tools:
 *   - read_pen_file        — Parse a .pen file and return its node tree
 *   - list_components      — List reusable components from a .pen file
 *   - get_component_info   — Get detailed metadata for a specific component
 *   - find_nodes           — Find nodes matching a predicate (type/name filter)
 *
 * Uses @@PROJECT_NAME-pen (sibling package) via dynamic import.
 * Sibling package must be built (`npm run build` in packages/pen) before use.
 */

import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineSharedTool } from '../lib/define-tool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PEN_PKG_PATH = resolve(__dirname, '../../../pen/dist/index.js');

// ─── Dynamic import helper ────────────────────────────────────────────────────

interface PenPackage {
  parsePenFile: (src: string) => unknown;
  findReusableComponents: (doc: unknown) => unknown[];
  findNodes: (doc: unknown, predicate: (n: unknown) => boolean) => unknown[];
  findNodeById: (doc: unknown, id: string) => unknown | undefined;
  traverseNodes: (doc: unknown, visitor: (n: unknown) => void) => void;
}

async function loadPenPkg(): Promise<PenPackage> {
  const pkg = (await import(PEN_PKG_PATH)) as PenPackage;
  return pkg;
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const PenFilePathSchema = z.object({
  filePath: z.string().describe('Absolute or relative path to the .pen file'),
});

const ComponentInfoSchema = z.object({
  filePath: z.string().describe('Absolute or relative path to the .pen file'),
  componentId: z.string().describe('ID of the reusable component to inspect'),
});

const FindNodesSchema = z.object({
  filePath: z.string().describe('Absolute or relative path to the .pen file'),
  nodeType: z
    .string()
    .optional()
    .describe('Filter by node type (e.g. "frame", "text", "icon_font")'),
  nameContains: z.string().optional().describe('Filter by nodes whose name contains this string'),
});

// ─── Tool: read_pen_file ──────────────────────────────────────────────────────

export const readPenFileTool = defineSharedTool({
  name: 'read_pen_file',
  description:
    'Parse a .pen design file and return its structure including version, themes, ' +
    'variables, and the full node tree. Use this to inspect any .pen file.',
  inputSchema: PenFilePathSchema,
  outputSchema: z.object({
    version: z.string(),
    themeCount: z.number(),
    variableCount: z.number(),
    nodeCount: z.number(),
    componentCount: z.number(),
    document: z.unknown(),
  }),
  metadata: { category: 'design', tags: ['pen', 'read', 'parse'], version: '1.0.0' },
  execute: async ({ filePath }) => {
    try {
      const pkg = await loadPenPkg();
      const source = readFileSync(filePath, 'utf-8');
      const doc = pkg.parsePenFile(source) as {
        version?: string;
        themes?: Record<string, string[]>;
        variables?: Record<string, unknown>;
        children?: unknown[];
      };

      let nodeCount = 0;
      pkg.traverseNodes(doc, () => {
        nodeCount++;
      });
      const components = pkg.findReusableComponents(doc);

      return {
        success: true,
        data: {
          version: doc.version ?? '2.8',
          themeCount: Object.keys(doc.themes ?? {}).length,
          variableCount: Object.keys(doc.variables ?? {}).length,
          nodeCount,
          componentCount: components.length,
          document: doc,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to read .pen file at ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

// ─── Tool: list_components ────────────────────────────────────────────────────

export const listComponentsTool = defineSharedTool({
  name: 'list_components',
  description:
    'List all reusable components (frames marked reusable: true) from a .pen file. ' +
    'Returns component IDs, names, and child counts.',
  inputSchema: PenFilePathSchema,
  outputSchema: z.object({
    components: z.array(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        type: z.string(),
        childCount: z.number(),
        hasChildren: z.boolean(),
      })
    ),
    total: z.number(),
  }),
  metadata: { category: 'design', tags: ['pen', 'components', 'list'], version: '1.0.0' },
  execute: async ({ filePath }) => {
    try {
      const pkg = await loadPenPkg();
      const source = readFileSync(filePath, 'utf-8');
      const doc = pkg.parsePenFile(source);
      const components = pkg.findReusableComponents(doc) as Array<{
        id?: string;
        name?: string;
        type?: string;
        children?: unknown[];
      }>;

      return {
        success: true,
        data: {
          components: components.map((c) => ({
            id: c.id ?? '',
            name: c.name,
            type: c.type ?? 'frame',
            childCount: c.children?.length ?? 0,
            hasChildren: (c.children?.length ?? 0) > 0,
          })),
          total: components.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to list components in ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

// ─── Tool: get_component_info ─────────────────────────────────────────────────

export const getComponentInfoTool = defineSharedTool({
  name: 'get_component_info',
  description:
    'Get detailed information about a specific reusable component by ID, ' +
    'including its full node subtree and style properties.',
  inputSchema: ComponentInfoSchema,
  outputSchema: z.object({
    found: z.boolean(),
    component: z.unknown(),
  }),
  metadata: { category: 'design', tags: ['pen', 'component', 'inspect'], version: '1.0.0' },
  execute: async ({ filePath, componentId }) => {
    try {
      const pkg = await loadPenPkg();
      const source = readFileSync(filePath, 'utf-8');
      const doc = pkg.parsePenFile(source);
      const component = pkg.findNodeById(doc, componentId);

      return {
        success: true,
        data: { found: component !== undefined, component: component ?? null },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get component ${componentId}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

// ─── Tool: find_nodes ─────────────────────────────────────────────────────────

export const findNodesTool = defineSharedTool({
  name: 'find_nodes',
  description:
    'Find nodes in a .pen file matching a type and/or name filter. ' +
    'Useful for discovering text nodes, icon nodes, or named elements.',
  inputSchema: FindNodesSchema,
  outputSchema: z.object({
    nodes: z.array(z.unknown()),
    count: z.number(),
  }),
  metadata: { category: 'design', tags: ['pen', 'find', 'traverse'], version: '1.0.0' },
  execute: async ({ filePath, nodeType, nameContains }) => {
    try {
      const pkg = await loadPenPkg();
      const source = readFileSync(filePath, 'utf-8');
      const doc = pkg.parsePenFile(source);

      const nodes = pkg.findNodes(doc, (n: unknown) => {
        const node = n as { type?: string; name?: string };
        if (nodeType && node.type !== nodeType) return false;
        if (nameContains && !node.name?.includes(nameContains)) return false;
        return true;
      });

      return {
        success: true,
        data: { nodes, count: nodes.length },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to find nodes in ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

// ─── Export ───────────────────────────────────────────────────────────────────

export const designTools = [
  readPenFileTool,
  listComponentsTool,
  getComponentInfoTool,
  findNodesTool,
];
