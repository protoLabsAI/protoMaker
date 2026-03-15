/**
 * token-tools.ts
 *
 * MCP tools for W3C DTCG design token extraction and export.
 *
 * Tools:
 *   - extract_tokens       — Extract tokens from a .pen file as W3C DTCG format
 *   - export_tokens_css    — Export token document as CSS custom properties
 *   - export_tokens_tailwind — Export token document as Tailwind config
 *   - generate_palette     — Generate a full OKLCH color palette from a brand color
 *
 * Uses @@PROJECT_NAME-tokens and @@PROJECT_NAME-color (sibling packages) via
 * dynamic import. Build sibling packages before running the MCP server.
 */

import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineSharedTool } from '../lib/define-tool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PEN_PKG_PATH = resolve(__dirname, '../../../pen/dist/index.js');
const TOKENS_PKG_PATH = resolve(__dirname, '../../../tokens/dist/index.js');
const COLOR_PKG_PATH = resolve(__dirname, '../../../color/dist/index.js');

// ─── Dynamic import helpers ───────────────────────────────────────────────────

interface PenPackage {
  parsePenFile: (src: string) => {
    variables?: Record<string, unknown>;
    themes?: Record<string, string[]>;
  };
}

interface TokensPackage {
  extractTokensFromPen: (
    variables: Record<string, unknown>,
    themes?: Record<string, string[]>
  ) => { document: unknown; themes: string[] };
  exportToCSS: (
    document: unknown,
    options?: { darkThemeStrategy?: 'media' | 'class' | 'none'; prefix?: string }
  ) => { css: string };
  exportToTailwind: (
    document: unknown,
    options?: { version?: 'v3' | 'v4'; wrapInConfig?: boolean; prefix?: string }
  ) => { config: string };
}

interface ColorPackage {
  generatePalette: (options: {
    accent: { l: number; c: number; h: number };
    neutral?: { l: number; c: number; h: number };
  }) => unknown;
  parseOklch: (oklch: string) => { l: number; c: number; h: number } | null;
  paletteToCSSVars: (palette: unknown) => Record<string, string>;
  PRESET_PALETTES: Record<string, () => unknown>;
}

async function loadPenPkg(): Promise<PenPackage> {
  return (await import(PEN_PKG_PATH)) as PenPackage;
}

async function loadTokensPkg(): Promise<TokensPackage> {
  return (await import(TOKENS_PKG_PATH)) as TokensPackage;
}

async function loadColorPkg(): Promise<ColorPackage> {
  return (await import(COLOR_PKG_PATH)) as ColorPackage;
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const ExtractTokensSchema = z.object({
  filePath: z.string().describe('Path to the .pen file to extract tokens from'),
});

const ExportCSSSchema = z.object({
  filePath: z.string().describe('Path to the .pen file'),
  darkThemeStrategy: z
    .enum(['media', 'class', 'none'])
    .optional()
    .default('media')
    .describe('How to output dark theme tokens'),
  prefix: z.string().optional().describe('Optional CSS variable prefix'),
});

const ExportTailwindSchema = z.object({
  filePath: z.string().describe('Path to the .pen file'),
  version: z.enum(['v3', 'v4']).optional().default('v4').describe('Tailwind CSS version to target'),
  wrapInConfig: z
    .boolean()
    .optional()
    .default(false)
    .describe('Wrap output in a module.exports = { theme: { extend: { ... } } } block'),
  prefix: z.string().optional().describe('Optional token prefix for variable names'),
});

const GeneratePaletteSchema = z.object({
  brandColor: z
    .string()
    .describe(
      'Brand accent color in OKLCH format (e.g. "oklch(0.65 0.18 265)") or preset name ' +
        '(violet | blue | teal | green | amber | rose | slate)'
    ),
});

// ─── Tool: extract_tokens ─────────────────────────────────────────────────────

export const extractTokensTool = defineSharedTool({
  name: 'extract_tokens',
  description:
    'Extract W3C DTCG design tokens from a .pen file. Returns the token document ' +
    'containing all color, typography, spacing, and other design tokens defined ' +
    'as variables in the .pen file.',
  inputSchema: ExtractTokensSchema,
  outputSchema: z.object({
    tokenDocument: z.unknown(),
    themes: z.array(z.string()),
    summary: z.object({
      totalTokens: z.number(),
      groups: z.array(z.string()),
    }),
  }),
  metadata: { category: 'tokens', tags: ['dtcg', 'extract', 'pen'], version: '1.0.0' },
  execute: async ({ filePath }) => {
    try {
      const [penPkg, tokensPkg] = await Promise.all([loadPenPkg(), loadTokensPkg()]);
      const source = readFileSync(filePath, 'utf-8');
      const doc = penPkg.parsePenFile(source);

      const { document, themes } = tokensPkg.extractTokensFromPen(
        (doc.variables ?? {}) as Record<string, unknown>,
        doc.themes
      );

      // Count tokens by walking the document
      let totalTokens = 0;
      const groups: string[] = [];
      const tokenDoc = document as Record<string, unknown>;
      for (const [key, value] of Object.entries(tokenDoc)) {
        if (typeof value === 'object' && value !== null && '$type' in value) {
          totalTokens++;
        } else if (typeof value === 'object' && value !== null) {
          groups.push(key);
          // Shallow count
          for (const inner of Object.values(value as Record<string, unknown>)) {
            if (typeof inner === 'object' && inner !== null && '$type' in inner) {
              totalTokens++;
            }
          }
        }
      }

      return {
        success: true,
        data: {
          tokenDocument: document,
          themes,
          summary: { totalTokens, groups },
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to extract tokens from ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

// ─── Tool: export_tokens_css ──────────────────────────────────────────────────

export const exportTokensCssTool = defineSharedTool({
  name: 'export_tokens_css',
  description:
    'Extract tokens from a .pen file and export them as CSS custom properties. ' +
    'Supports light/dark theme strategies. Outputs ready-to-paste CSS.',
  inputSchema: ExportCSSSchema,
  outputSchema: z.object({
    css: z.string(),
    lineCount: z.number(),
  }),
  metadata: { category: 'tokens', tags: ['css', 'export', 'variables'], version: '1.0.0' },
  execute: async ({ filePath, darkThemeStrategy, prefix }) => {
    try {
      const [penPkg, tokensPkg] = await Promise.all([loadPenPkg(), loadTokensPkg()]);
      const source = readFileSync(filePath, 'utf-8');
      const doc = penPkg.parsePenFile(source);

      const { document } = tokensPkg.extractTokensFromPen(
        (doc.variables ?? {}) as Record<string, unknown>,
        doc.themes
      );

      const { css } = tokensPkg.exportToCSS(document, {
        darkThemeStrategy: darkThemeStrategy ?? 'media',
        prefix,
      });

      return {
        success: true,
        data: { css, lineCount: css.split('\n').length },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to export CSS tokens from ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

// ─── Tool: export_tokens_tailwind ─────────────────────────────────────────────

export const exportTokensTailwindTool = defineSharedTool({
  name: 'export_tokens_tailwind',
  description:
    'Extract tokens from a .pen file and export them as a Tailwind CSS configuration ' +
    'block. Supports Tailwind v3 (JS theme.extend) and v4 (@theme CSS block).',
  inputSchema: ExportTailwindSchema,
  outputSchema: z.object({
    config: z.string(),
    lineCount: z.number(),
  }),
  metadata: {
    category: 'tokens',
    tags: ['tailwind', 'export', 'config'],
    version: '1.0.0',
  },
  execute: async ({ filePath, version, wrapInConfig, prefix }) => {
    try {
      const [penPkg, tokensPkg] = await Promise.all([loadPenPkg(), loadTokensPkg()]);
      const source = readFileSync(filePath, 'utf-8');
      const doc = penPkg.parsePenFile(source);

      const { document } = tokensPkg.extractTokensFromPen(
        (doc.variables ?? {}) as Record<string, unknown>,
        doc.themes
      );

      const { config } = tokensPkg.exportToTailwind(document, {
        version: version ?? 'v4',
        wrapInConfig: wrapInConfig ?? false,
        prefix,
      });

      return {
        success: true,
        data: { config, lineCount: config.split('\n').length },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to export Tailwind config from ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

// ─── Tool: generate_palette ───────────────────────────────────────────────────

export const generatePaletteTool = defineSharedTool({
  name: 'generate_palette',
  description:
    'Generate a full OKLCH design system color palette from a brand accent color. ' +
    'Produces primary, neutral, destructive, warning, success, and info scales ' +
    'with WCAG-compliant contrast. Pass an OKLCH string or a preset name ' +
    '(violet | blue | teal | green | amber | rose | slate).',
  inputSchema: GeneratePaletteSchema,
  outputSchema: z.object({
    palette: z.unknown(),
    cssVars: z.record(z.string()),
    presetUsed: z.string().optional(),
  }),
  metadata: {
    category: 'tokens',
    tags: ['color', 'palette', 'oklch', 'generate'],
    version: '1.0.0',
  },
  execute: async ({ brandColor }) => {
    try {
      const colorPkg = await loadColorPkg();

      // Check if a preset name was given
      const presetNames = Object.keys(colorPkg.PRESET_PALETTES);
      if (presetNames.includes(brandColor)) {
        const palette = colorPkg.PRESET_PALETTES[brandColor]();
        const cssVars = colorPkg.paletteToCSSVars(palette);
        return {
          success: true,
          data: { palette, cssVars, presetUsed: brandColor },
        };
      }

      // Parse as OKLCH string
      const parsed = colorPkg.parseOklch(brandColor);
      if (!parsed) {
        return {
          success: false,
          error: `Invalid brand color "${brandColor}". Use oklch(L C H) format or a preset: ${presetNames.join(', ')}`,
        };
      }

      const palette = colorPkg.generatePalette({ accent: parsed });
      const cssVars = colorPkg.paletteToCSSVars(palette);

      return {
        success: true,
        data: { palette, cssVars },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to generate palette: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

// ─── Export ───────────────────────────────────────────────────────────────────

export const tokenTools = [
  extractTokensTool,
  exportTokensCssTool,
  exportTokensTailwindTool,
  generatePaletteTool,
];
