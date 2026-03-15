/**
 * component-tools.ts
 *
 * MCP tools for generating React and HTML components from .pen files.
 *
 * Tools:
 *   - generate_react_component  — Generate a React TSX component from a .pen frame
 *   - generate_html_component   — Generate static HTML + CSS from a .pen frame
 *   - list_pen_components       — List generatable components in a .pen file
 *
 * Uses @@PROJECT_NAME-codegen and @@PROJECT_NAME-pen (sibling packages) via
 * dynamic import. Build sibling packages before running the MCP server.
 */

import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineSharedTool } from '../lib/define-tool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PEN_PKG_PATH = resolve(__dirname, '../../../pen/dist/index.js');
const CODEGEN_PKG_PATH = resolve(__dirname, '../../../codegen/dist/react-generator.js');
const HTML_GEN_PATH = resolve(__dirname, '../../../codegen/dist/html-generator.js');

// ─── Dynamic import helpers ───────────────────────────────────────────────────

interface PenPackage {
  parsePenFile: (src: string) => unknown;
  findReusableComponents: (doc: unknown) => Array<{
    id?: string;
    name?: string;
    type?: string;
    children?: unknown[];
  }>;
  findNodeById: (doc: unknown, id: string) => unknown | undefined;
}

interface GeneratedFile {
  filename: string;
  content: string;
  language: 'tsx' | 'css' | 'html' | 'ts';
}

interface CodegenPackage {
  generateFromDocument: (doc: unknown) => GeneratedFile[];
}

interface HtmlGenPackage {
  generateHTML: (
    node: unknown,
    options?: { embedCSS?: boolean }
  ) => {
    html: string;
    css: string;
  };
}

async function loadPenPkg(): Promise<PenPackage> {
  return (await import(PEN_PKG_PATH)) as PenPackage;
}

async function loadCodegenPkg(): Promise<CodegenPackage> {
  return (await import(CODEGEN_PKG_PATH)) as CodegenPackage;
}

async function loadHtmlGenPkg(): Promise<HtmlGenPackage> {
  return (await import(HTML_GEN_PATH)) as HtmlGenPackage;
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const GenerateReactSchema = z.object({
  filePath: z.string().describe('Path to the .pen file'),
  componentId: z
    .string()
    .optional()
    .describe('ID of a specific reusable component. If omitted, generates all components.'),
});

const GenerateHtmlSchema = z.object({
  filePath: z.string().describe('Path to the .pen file'),
  componentId: z.string().describe('ID of the reusable component to render'),
  embedCSS: z
    .boolean()
    .optional()
    .default(false)
    .describe('Embed CSS in a <style> tag inside the HTML output'),
});

const ListPenComponentsSchema = z.object({
  filePath: z.string().describe('Path to the .pen file'),
});

// ─── Tool: generate_react_component ──────────────────────────────────────────

export const generateReactComponentTool = defineSharedTool({
  name: 'generate_react_component',
  description:
    'Generate React TSX components from a .pen design file. Converts pen nodes into ' +
    'React functional components with Tailwind/CSS classes and typed props. ' +
    'Provide a componentId to generate a single component, or omit to generate all.',
  inputSchema: GenerateReactSchema,
  outputSchema: z.object({
    files: z.array(
      z.object({
        filename: z.string(),
        content: z.string(),
        language: z.enum(['tsx', 'css', 'html', 'ts']),
      })
    ),
    componentCount: z.number(),
  }),
  metadata: {
    category: 'components',
    tags: ['react', 'codegen', 'tsx', 'generate'],
    version: '1.0.0',
  },
  execute: async ({ filePath, componentId }) => {
    try {
      const [penPkg, codegenPkg] = await Promise.all([loadPenPkg(), loadCodegenPkg()]);
      const source = readFileSync(filePath, 'utf-8');
      const doc = penPkg.parsePenFile(source);

      let targetDoc = doc;

      if (componentId) {
        // Wrap the single node in a minimal document for the generator
        const node = penPkg.findNodeById(doc, componentId);
        if (!node) {
          return {
            success: false,
            error: `Component with id "${componentId}" not found in ${filePath}`,
          };
        }
        targetDoc = { version: '2.8', children: [node] };
      }

      const files = codegenPkg.generateFromDocument(targetDoc);

      return {
        success: true,
        data: {
          files,
          componentCount: files.filter((f) => f.language === 'tsx').length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to generate React component from ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

// ─── Tool: generate_html_component ───────────────────────────────────────────

export const generateHtmlComponentTool = defineSharedTool({
  name: 'generate_html_component',
  description:
    'Generate static HTML + CSS from a specific reusable component in a .pen file. ' +
    'Useful for creating standalone previews or integrating with non-React stacks.',
  inputSchema: GenerateHtmlSchema,
  outputSchema: z.object({
    html: z.string(),
    css: z.string(),
    combined: z.string(),
  }),
  metadata: {
    category: 'components',
    tags: ['html', 'css', 'static', 'generate'],
    version: '1.0.0',
  },
  execute: async ({ filePath, componentId, embedCSS }) => {
    try {
      const [penPkg, htmlGenPkg] = await Promise.all([loadPenPkg(), loadHtmlGenPkg()]);
      const source = readFileSync(filePath, 'utf-8');
      const doc = penPkg.parsePenFile(source);
      const node = penPkg.findNodeById(doc, componentId);

      if (!node) {
        return {
          success: false,
          error: `Component with id "${componentId}" not found in ${filePath}`,
        };
      }

      const { html, css } = htmlGenPkg.generateHTML(node, { embedCSS: embedCSS ?? false });

      const combined = embedCSS ? html : `<style>\n${css}\n</style>\n\n${html}`;

      return {
        success: true,
        data: { html, css, combined },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to generate HTML for component ${componentId}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

// ─── Tool: list_pen_components ────────────────────────────────────────────────

export const listPenComponentsTool = defineSharedTool({
  name: 'list_pen_components',
  description:
    'List all reusable components in a .pen file with their IDs and names. ' +
    'Use this before calling generate_react_component or generate_html_component ' +
    'to discover valid component IDs.',
  inputSchema: ListPenComponentsSchema,
  outputSchema: z.object({
    components: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        childCount: z.number(),
      })
    ),
    total: z.number(),
  }),
  metadata: {
    category: 'components',
    tags: ['pen', 'list', 'discover'],
    version: '1.0.0',
  },
  execute: async ({ filePath }) => {
    try {
      const penPkg = await loadPenPkg();
      const source = readFileSync(filePath, 'utf-8');
      const doc = penPkg.parsePenFile(source);
      const components = penPkg.findReusableComponents(doc);

      return {
        success: true,
        data: {
          components: components.map((c) => ({
            id: c.id ?? '',
            name: c.name ?? '(unnamed)',
            childCount: c.children?.length ?? 0,
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

// ─── Export ───────────────────────────────────────────────────────────────────

export const componentTools = [
  generateReactComponentTool,
  generateHtmlComponentTool,
  listPenComponentsTool,
];
