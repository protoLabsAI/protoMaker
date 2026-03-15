/**
 * a11y-tools.ts
 *
 * MCP tools for accessibility auditing and WCAG contrast checking.
 *
 * Tools:
 *   - audit_html_component  — Run a full WCAG audit on an HTML snippet or page
 *   - check_color_contrast  — Check WCAG contrast ratio between two OKLCH colors
 *   - find_accessible_shade — Find the nearest shade from a scale that meets WCAG
 *
 * Uses @@PROJECT_NAME-a11y and @@PROJECT_NAME-color (sibling packages) via
 * dynamic import. Build sibling packages before running the MCP server.
 */

import { z } from 'zod';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineSharedTool } from '../lib/define-tool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const A11Y_PKG_PATH = resolve(__dirname, '../../../a11y/dist/audit.js');
const COLOR_PKG_PATH = resolve(__dirname, '../../../color/dist/index.js');

// ─── Dynamic import helpers ───────────────────────────────────────────────────

interface AuditReport {
  scope: string;
  timestamp: string;
  summary: {
    passingRules: number;
    failingRules: number;
    incompleteRules: number;
    affectedElements: number;
    wcagAAPassing: boolean;
    wcagAAAPassing: boolean;
    grade: 'pass' | 'warn' | 'fail';
  };
  violations: unknown[];
  passes: unknown[];
  incomplete: unknown[];
}

interface A11yPackage {
  auditComponent: (html: string, options?: { wcagLevel?: string }) => Promise<AuditReport>;
  auditPage: (html: string, options?: { wcagLevel?: string }) => Promise<AuditReport>;
}

interface ContrastResult {
  ratio: number;
  aa: { normal: boolean; large: boolean };
  aaa: { normal: boolean; large: boolean };
}

interface OklchColor {
  l: number;
  c: number;
  h: number;
}

interface ColorPackage {
  checkContrast: (fg: OklchColor, bg: OklchColor) => ContrastResult;
  parseOklch: (oklch: string) => OklchColor | null;
  findAccessibleShade: (
    scale: Record<string, OklchColor>,
    bg: OklchColor,
    level?: 'AA' | 'AAA'
  ) => { shade: string; color: OklchColor; ratio: number } | null;
  generateScale: (options: { l: number; c: number; h: number }) => Record<string, OklchColor>;
  formatOklch: (color: OklchColor) => string;
}

async function loadA11yPkg(): Promise<A11yPackage> {
  return (await import(A11Y_PKG_PATH)) as A11yPackage;
}

async function loadColorPkg(): Promise<ColorPackage> {
  return (await import(COLOR_PKG_PATH)) as ColorPackage;
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const AuditSchema = z.object({
  html: z.string().describe('HTML snippet or full page markup to audit'),
  scope: z
    .enum(['component', 'page'])
    .optional()
    .default('component')
    .describe('Whether this is a component snippet or a full page'),
  wcagLevel: z
    .enum(['A', 'AA', 'AAA'])
    .optional()
    .default('AA')
    .describe('WCAG conformance level to check against'),
});

const ContrastCheckSchema = z.object({
  foreground: z.string().describe('Foreground color in OKLCH format — e.g. "oklch(0.2 0.01 265)"'),
  background: z
    .string()
    .describe('Background color in OKLCH format — e.g. "oklch(0.98 0.005 265)"'),
});

const FindAccessibleShadeSchema = z.object({
  accentColor: z
    .string()
    .describe('Accent hue in OKLCH format to generate a scale from — e.g. "oklch(0.65 0.18 265)"'),
  background: z.string().describe('Background color in OKLCH format to check contrast against'),
  wcagLevel: z
    .enum(['AA', 'AAA'])
    .optional()
    .default('AA')
    .describe('Minimum WCAG conformance level required'),
});

// ─── Tool: audit_html_component ───────────────────────────────────────────────

export const auditHtmlComponentTool = defineSharedTool({
  name: 'audit_html_component',
  description:
    'Run a WCAG accessibility audit on an HTML snippet or full page. ' +
    'Returns a compliance report with violations, passes, and an overall grade. ' +
    'Uses axe-core when available; falls back to pattern-matching heuristics.',
  inputSchema: AuditSchema,
  outputSchema: z.object({
    grade: z.enum(['pass', 'warn', 'fail']),
    wcagAAPassing: z.boolean(),
    wcagAAAPassing: z.boolean(),
    violationCount: z.number(),
    passingRuleCount: z.number(),
    affectedElements: z.number(),
    violations: z.array(z.unknown()),
    summary: z.unknown(),
  }),
  metadata: {
    category: 'a11y',
    tags: ['wcag', 'audit', 'axe', 'accessibility'],
    version: '1.0.0',
  },
  execute: async ({ html, scope, wcagLevel }) => {
    try {
      const a11yPkg = await loadA11yPkg();
      const auditFn = scope === 'page' ? a11yPkg.auditPage : a11yPkg.auditComponent;
      const report = await auditFn(html, { wcagLevel });

      return {
        success: true,
        data: {
          grade: report.summary.grade,
          wcagAAPassing: report.summary.wcagAAPassing,
          wcagAAAPassing: report.summary.wcagAAAPassing,
          violationCount: report.summary.failingRules,
          passingRuleCount: report.summary.passingRules,
          affectedElements: report.summary.affectedElements,
          violations: report.violations,
          summary: report.summary,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Audit failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

// ─── Tool: check_color_contrast ──────────────────────────────────────────────

export const checkColorContrastTool = defineSharedTool({
  name: 'check_color_contrast',
  description:
    'Check the WCAG contrast ratio between a foreground and background color pair. ' +
    'Returns the contrast ratio and whether it passes WCAG AA/AAA for normal and large text. ' +
    'Both colors must be in OKLCH format: oklch(L C H).',
  inputSchema: ContrastCheckSchema,
  outputSchema: z.object({
    ratio: z.number(),
    ratioFormatted: z.string(),
    aa: z.object({ normal: z.boolean(), large: z.boolean() }),
    aaa: z.object({ normal: z.boolean(), large: z.boolean() }),
    overallGrade: z.enum(['fail', 'AA', 'AAA']),
  }),
  metadata: {
    category: 'a11y',
    tags: ['contrast', 'wcag', 'color', 'check'],
    version: '1.0.0',
  },
  execute: async ({ foreground, background }) => {
    try {
      const colorPkg = await loadColorPkg();

      const fg = colorPkg.parseOklch(foreground);
      const bg = colorPkg.parseOklch(background);

      if (!fg) {
        return {
          success: false,
          error: `Invalid foreground color: "${foreground}". Use oklch(L C H) format.`,
        };
      }
      if (!bg) {
        return {
          success: false,
          error: `Invalid background color: "${background}". Use oklch(L C H) format.`,
        };
      }

      const result = colorPkg.checkContrast(fg, bg);
      const ratio = Math.round(result.ratio * 100) / 100;

      let overallGrade: 'fail' | 'AA' | 'AAA' = 'fail';
      if (result.aaa.normal) overallGrade = 'AAA';
      else if (result.aa.normal) overallGrade = 'AA';

      return {
        success: true,
        data: {
          ratio,
          ratioFormatted: `${ratio.toFixed(2)}:1`,
          aa: result.aa,
          aaa: result.aaa,
          overallGrade,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Contrast check failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

// ─── Tool: find_accessible_shade ─────────────────────────────────────────────

export const findAccessibleShadeTool = defineSharedTool({
  name: 'find_accessible_shade',
  description:
    'Given an accent hue (OKLCH), generate an 11-step scale and find the shade ' +
    'that best meets the target WCAG level against a specified background. ' +
    'Useful for picking text colors that are both on-brand and accessible.',
  inputSchema: FindAccessibleShadeSchema,
  outputSchema: z.object({
    found: z.boolean(),
    shade: z.string().optional(),
    color: z.string().optional(),
    contrastRatio: z.number().optional(),
    wcagLevel: z.string(),
    allShades: z.record(z.string()),
  }),
  metadata: {
    category: 'a11y',
    tags: ['contrast', 'wcag', 'shade', 'color-scale'],
    version: '1.0.0',
  },
  execute: async ({ accentColor, background, wcagLevel }) => {
    try {
      const colorPkg = await loadColorPkg();

      const accent = colorPkg.parseOklch(accentColor);
      const bg = colorPkg.parseOklch(background);

      if (!accent) {
        return {
          success: false,
          error: `Invalid accent color: "${accentColor}". Use oklch(L C H) format.`,
        };
      }
      if (!bg) {
        return {
          success: false,
          error: `Invalid background color: "${background}". Use oklch(L C H) format.`,
        };
      }

      const scale = colorPkg.generateScale(accent);

      // Format each shade as an oklch string for the response
      const allShades: Record<string, string> = {};
      for (const [shade, color] of Object.entries(scale)) {
        allShades[shade] = colorPkg.formatOklch(color);
      }

      const match = colorPkg.findAccessibleShade(scale, bg, wcagLevel as 'AA' | 'AAA');

      if (!match) {
        return {
          success: true,
          data: {
            found: false,
            wcagLevel: wcagLevel ?? 'AA',
            allShades,
          },
        };
      }

      return {
        success: true,
        data: {
          found: true,
          shade: match.shade,
          color: colorPkg.formatOklch(match.color),
          contrastRatio: Math.round(match.ratio * 100) / 100,
          wcagLevel: wcagLevel ?? 'AA',
          allShades,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to find accessible shade: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

// ─── Export ───────────────────────────────────────────────────────────────────

export const a11yTools = [auditHtmlComponentTool, checkColorContrastTool, findAccessibleShadeTool];
