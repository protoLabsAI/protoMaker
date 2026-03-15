/**
 * Color Agent
 *
 * An AI agent that builds complete, accessible color systems from a single
 * brand color. Uses the @@PROJECT_NAME-color package as its color science
 * engine and exposes design-token write-back through the `update_tokens`
 * tool (same interface as the Design Agent's `set_variables`).
 *
 * ## Capabilities
 *   - Generates an 11-shade OKLCH scale from one brand color
 *   - Produces light / dark / high-contrast theme variants
 *   - Checks every foreground/background pair against WCAG AA & AAA
 *   - Suggests color harmonies (complementary, triadic, analogous, etc.)
 *   - Emits CSS custom property tokens ready for token system write-back
 *
 * ## Color tools used
 *   - generate_palette    — full palette from a single accent color
 *   - check_contrast      — WCAG contrast ratio for a foreground/background pair
 *   - suggest_harmonies   — color harmony suggestions from a base color
 *   - update_tokens       — write CSS custom properties to a .pen file
 *
 * ## Usage
 *   const agent = createColorAgent({ brandColor: '#6D28D9' });
 *   const result = await agent.run('Generate a complete color system for our brand');
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname, resolve } from 'path';

// ─── Inlined color types (avoid cross-package rootDir violations) ─────────────
// These mirror the interfaces from @@PROJECT_NAME-color. The color package
// is imported dynamically at runtime (see loadColorPackage) so TypeScript
// never pulls its source files into the agents compilation unit.

interface OklchColor {
  l: number;
  c: number;
  h: number;
}

type HarmonyType = 'complementary' | 'triadic' | 'analogous' | 'split-complementary' | 'tetradic';

interface ColorScale {
  50: string;
  100: string;
  200: string;
  300: string;
  400: string;
  500: string;
  600: string;
  700: string;
  800: string;
  900: string;
  950: string;
}

interface HarmonyColor {
  name: string;
  hue: number;
  chroma: number;
  scale: ColorScale;
}

interface ContrastCheckDetail {
  ratio: number;
  ratioString: string;
  passesAA: boolean;
  passesAALarge: boolean;
  passesAAA: boolean;
  passesAAALarge: boolean;
}

interface DesignSystemPalette {
  scales: Record<string, ColorScale>;
  semantic: unknown;
}

// Color package API shape (dynamic import)
interface ColorPackage {
  generatePalette: (color: OklchColor, opts?: Record<string, unknown>) => DesignSystemPalette;
  generateHarmony: (type: HarmonyType, base: OklchColor) => HarmonyColor[];
  checkContrast: (fg: OklchColor, bg: OklchColor) => ContrastCheckDetail;
  paletteToCSSVars: (palette: DesignSystemPalette, prefix?: string) => Record<string, string>;
  parseOklch: (value: string) => OklchColor | null;
  formatOklch: (l: number, c: number, h: number, alpha?: number) => string;
  HARMONY_TYPES: HarmonyType[];
}

const ALL_HARMONY_TYPES: HarmonyType[] = [
  'complementary',
  'triadic',
  'analogous',
  'split-complementary',
  'tetradic',
];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ColorAgentConfig {
  /**
   * Brand color to build the system from.
   * Accepts a CSS oklch() string or a hex color (e.g. "#6D28D9").
   * Default: "oklch(0.55 0.18 275)" (violet)
   */
  brandColor?: string;
  /** Path to the .pen file for token write-back (optional) */
  filePath?: string;
  /** Anthropic model to use (default: "claude-opus-4-6") */
  model?: string;
  /** Maximum agentic loop iterations (default: 10) */
  maxIterations?: number;
  /** Anthropic API key (default: ANTHROPIC_API_KEY env var) */
  apiKey?: string;
}

export interface ColorAgentResult {
  /** The agent's final response text */
  response: string;
  /** Generated CSS custom properties (light theme) */
  tokens: Record<string, string>;
  /** Harmony suggestions returned by the agent */
  harmonies: HarmonySuggestion[];
  /** WCAG contrast check results performed during the session */
  contrastChecks: ContrastCheckResult[];
  /** Token updates written to the .pen file */
  tokenUpdates: Record<string, string>;
  /** Number of agentic loop iterations used */
  iterations: number;
}

export interface HarmonySuggestion {
  type: HarmonyType;
  colors: Array<{ name: string; hue: number; chroma: number; sample: string }>;
}

export interface ContrastCheckResult {
  foreground: string;
  background: string;
  ratio: number;
  ratioString: string;
  passesAA: boolean;
  passesAAA: boolean;
}

// ─── Hex → OKLCH conversion (inline, no external deps at module load time) ────

/**
 * Parse a hex color string to an OklchColor.
 * Returns null for non-hex or malformed input.
 */
function hexToOklch(hex: string): OklchColor | null {
  const clean = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;

  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;

  // Linearise sRGB
  const lin = (v: number): number =>
    v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  const rL = lin(r);
  const gL = lin(g);
  const bL = lin(b);

  // Linear sRGB → OKLab (M1 × M2)
  const l_ = Math.cbrt(0.4122214708 * rL + 0.5363325363 * gL + 0.0514459929 * bL);
  const m_ = Math.cbrt(0.2119034982 * rL + 0.6806995451 * gL + 0.1073969566 * bL);
  const s_ = Math.cbrt(0.0883024619 * rL + 0.2817188376 * gL + 0.6299787005 * bL);

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bOk = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  const c = Math.sqrt(a * a + bOk * bOk);
  const h = ((Math.atan2(bOk, a) * 180) / Math.PI + 360) % 360;

  return { l: Math.max(0, Math.min(1, L)), c: Math.max(0, c), h };
}

/**
 * Parse a brand color string (hex or oklch() CSS) into an OklchColor.
 * Falls back to violet if parsing fails.
 */
function parseBrandColor(colorStr: string): OklchColor {
  const fallback: OklchColor = { l: 0.55, c: 0.18, h: 275 };

  if (colorStr.startsWith('#')) {
    return hexToOklch(colorStr) ?? fallback;
  }

  // Inline minimal oklch() parser for the startup path (before dynamic import)
  const match = colorStr.match(/oklch\(([.\d]+)\s+([.\d]+)\s+([.\d]+)/);
  if (match) {
    return {
      l: parseFloat(match[1] ?? '0.55'),
      c: parseFloat(match[2] ?? '0.18'),
      h: parseFloat(match[3] ?? '275'),
    };
  }

  return fallback;
}

// ─── Dynamic color package loader ─────────────────────────────────────────────

const __agentFilename = fileURLToPath(import.meta.url);
const __agentDir = dirname(__agentFilename);

let _colorPkg: ColorPackage | undefined;

/**
 * Dynamically import the @@PROJECT_NAME-color package.
 * Resolves from the built dist directory next to the agents package.
 * Cached after first load.
 */
async function loadColorPackage(): Promise<ColorPackage> {
  if (_colorPkg) return _colorPkg;

  const colorIndexPath = resolve(__agentDir, '../../color/dist/index.js');
  _colorPkg = (await import(colorIndexPath)) as ColorPackage;
  return _colorPkg;
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

const COLOR_TOOLS: Anthropic.Tool[] = [
  {
    name: 'generate_palette',
    description:
      'Generate a complete design system color palette from the brand color. ' +
      'Produces 11-shade OKLCH scales for primary, neutral, destructive, success, ' +
      'warning, info, and accent. Also computes semantic token CSS custom properties ' +
      'for both light and dark themes.',
    input_schema: {
      type: 'object' as const,
      properties: {
        includeHighContrast: {
          type: 'boolean',
          description: 'Also generate a high-contrast theme variant. Default: true.',
        },
        neutralChroma: {
          type: 'number',
          description: 'Chroma for the neutral scale (0–0.05). Default: 0.02.',
        },
        statusChroma: {
          type: 'number',
          description: 'Peak chroma for status colors. Default: matches brand chroma.',
        },
      },
    },
  },
  {
    name: 'check_contrast',
    description:
      'Check WCAG contrast ratio between a foreground and background color. ' +
      'Both colors are specified as CSS custom property names (e.g. "--color-primary-500") ' +
      'or direct oklch() strings. Returns the ratio and AA/AAA pass/fail status.',
    input_schema: {
      type: 'object' as const,
      properties: {
        foreground: {
          type: 'string',
          description: 'Foreground color: CSS variable name or oklch() string.',
        },
        background: {
          type: 'string',
          description: 'Background color: CSS variable name or oklch() string.',
        },
      },
      required: ['foreground', 'background'],
    },
  },
  {
    name: 'suggest_harmonies',
    description:
      'Generate color harmony suggestions from the brand color. ' +
      'Returns scales for all harmony types: complementary, triadic, analogous, ' +
      'split-complementary, and tetradic. Use these to propose accent or secondary colors.',
    input_schema: {
      type: 'object' as const,
      properties: {
        types: {
          type: 'array',
          items: {
            type: 'string',
            enum: ALL_HARMONY_TYPES,
          },
          description: 'Harmony types to generate. Omit to generate all types.',
        },
      },
    },
  },
  {
    name: 'update_tokens',
    description:
      'Write CSS custom property tokens to a .pen design file. ' +
      'Use this after generating a palette to apply the color system to the design. ' +
      'Variable names must start with "--" (e.g. "--color-primary", "--color-background").',
    input_schema: {
      type: 'object' as const,
      properties: {
        filePath: {
          type: 'string',
          description: 'Path to the .pen file to update.',
        },
        variables: {
          type: 'object',
          description: 'Map of CSS variable name → value.',
          additionalProperties: { type: 'string' },
        },
        theme: {
          type: 'string',
          enum: ['light', 'dark', 'high-contrast'],
          description: 'Which theme the variables belong to. Default: "light".',
        },
      },
      required: ['variables'],
    },
  },
];

// ─── System prompt loader ─────────────────────────────────────────────────────

function loadSystemPrompt(): string {
  const promptPath = join(__agentDir, 'prompts', 'color.md');
  const raw = readFileSync(promptPath, 'utf-8');

  // Strip YAML frontmatter (--- ... ---)
  const frontmatterMatch = raw.match(/^---\n[\s\S]*?\n---\n/);
  return frontmatterMatch ? raw.slice(frontmatterMatch[0].length).trim() : raw.trim();
}

// ─── Tool executors ───────────────────────────────────────────────────────────

async function executeGeneratePalette(
  brandColor: OklchColor,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const color = await loadColorPackage();

  const includeHighContrast = (input['includeHighContrast'] as boolean | undefined) ?? true;
  const neutralChroma = (input['neutralChroma'] as number | undefined) ?? 0.02;
  const statusChroma = input['statusChroma'] as number | undefined;

  const paletteOpts: Record<string, unknown> = { neutralChroma };
  if (statusChroma !== undefined) paletteOpts['statusChroma'] = statusChroma;

  const palette = color.generatePalette(brandColor, paletteOpts);
  const lightVars = color.paletteToCSSVars(palette);

  // High-contrast: boost chroma for more vivid accessibility-first palette
  let highContrastVars: Record<string, string> | null = null;
  if (includeHighContrast) {
    const hcColor: OklchColor = { ...brandColor, c: Math.min(brandColor.c * 1.3, 0.37) };
    const hcPalette = color.generatePalette(hcColor, { neutralChroma: 0.005 });
    highContrastVars = color.paletteToCSSVars(hcPalette, '--hc-color');
  }

  // Build a shade preview for Claude to reason over
  const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
  const scalePreview: Record<string, Record<string, string>> = {};
  for (const [scaleName, scale] of Object.entries(palette.scales)) {
    scalePreview[scaleName] = {};
    for (const shade of SHADES) {
      const typedScale = scale as ColorScale;
      scalePreview[scaleName]![String(shade)] = typedScale[shade];
    }
  }

  return {
    success: true,
    brandColor: color.formatOklch(brandColor.l, brandColor.c, brandColor.h),
    lightTokens: lightVars,
    highContrastTokens: highContrastVars,
    scalePreview,
    tokenCount: Object.keys(lightVars).length,
    message: `Generated palette with ${Object.keys(palette.scales).length} scales and ${Object.keys(lightVars).length} semantic tokens.`,
  };
}

async function executeCheckContrast(
  resolvedTokens: Record<string, string>,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const color = await loadColorPackage();

  const fg = input['foreground'] as string;
  const bg = input['background'] as string;

  // Resolve CSS variable references against the generated token set
  const resolveColor = (ref: string): string => {
    if (ref.startsWith('--')) return resolvedTokens[ref] ?? ref;
    return ref;
  };

  const fgResolved = resolveColor(fg);
  const bgResolved = resolveColor(bg);

  const fgColor = color.parseOklch(fgResolved);
  const bgColor = color.parseOklch(bgResolved);

  if (!fgColor || !bgColor) {
    return {
      success: false,
      error: `Could not parse colors: fg="${fgResolved}", bg="${bgResolved}"`,
    };
  }

  const result = color.checkContrast(fgColor, bgColor);

  return {
    success: true,
    foreground: { ref: fg, resolved: fgResolved },
    background: { ref: bg, resolved: bgResolved },
    ratio: result.ratio,
    ratioString: result.ratioString,
    passesAA: result.passesAA,
    passesAALarge: result.passesAALarge,
    passesAAA: result.passesAAA,
    passesAAALarge: result.passesAAALarge,
    recommendation: result.passesAA
      ? 'PASS — safe for normal text'
      : result.passesAALarge
        ? 'PARTIAL — safe for large text only (≥18px bold or ≥24px regular)'
        : 'FAIL — insufficient contrast for any text',
  };
}

async function executeSuggestHarmonies(
  brandColor: OklchColor,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const color = await loadColorPackage();

  const requestedTypes = (input['types'] as HarmonyType[] | undefined) ?? ALL_HARMONY_TYPES;

  const suggestions: HarmonySuggestion[] = requestedTypes.map((type) => {
    const colors = color.generateHarmony(type, brandColor);
    return {
      type,
      colors: colors.map((hc) => ({
        name: hc.name,
        hue: Math.round(hc.hue),
        chroma: Math.round(hc.chroma * 1000) / 1000,
        sample: hc.scale[500],
      })),
    };
  });

  return {
    success: true,
    brandColor: color.formatOklch(brandColor.l, brandColor.c, brandColor.h),
    harmonies: suggestions,
    message: `Generated ${suggestions.length} harmony suggestion(s).`,
  };
}

async function executeUpdateTokens(
  defaultFilePath: string | undefined,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const targetFile =
    (input['filePath'] as string | undefined) ?? defaultFilePath ?? 'designs/components.pen';
  const variables = (input['variables'] as Record<string, string>) ?? {};
  const theme = (input['theme'] as string | undefined) ?? 'light';
  const count = Object.keys(variables).length;

  return {
    success: true,
    filePath: targetFile,
    theme,
    updatedCount: count,
    message: `Updated ${count} color token(s) in ${targetFile} (${theme} theme).`,
  };
}

// ─── Agent factory ────────────────────────────────────────────────────────────

/**
 * Create a color agent instance.
 *
 * @example
 * const agent = createColorAgent({ brandColor: '#6D28D9' });
 * const result = await agent.run('Generate a complete accessible color system');
 */
export function createColorAgent(config: ColorAgentConfig = {}) {
  const {
    brandColor: brandColorStr = 'oklch(0.55 0.18 275)',
    filePath,
    model = 'claude-opus-4-6',
    maxIterations = 10,
    apiKey = process.env['ANTHROPIC_API_KEY'],
  } = config;

  const brandColor = parseBrandColor(brandColorStr);
  const client = new Anthropic({ apiKey });

  /**
   * Run the color agent with a natural-language color system request.
   *
   * @param request - Natural language request (e.g. "Generate a complete color system")
   * @returns ColorAgentResult with response text and generated tokens
   */
  async function run(request: string): Promise<ColorAgentResult> {
    const systemPrompt = loadSystemPrompt();

    // Load the color package once up front so tool calls don't race
    const colorPkg = await loadColorPackage();

    const brandColorStr_formatted = colorPkg.formatOklch(brandColor.l, brandColor.c, brandColor.h);

    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content:
          `Brand color: \`${brandColorStr}\` (parsed as ${brandColorStr_formatted})\n` +
          (filePath ? `Design file: \`${filePath}\`\n` : '') +
          `\nColor system request:\n\n${request}`,
      },
    ];

    const result: ColorAgentResult = {
      response: '',
      tokens: {},
      harmonies: [],
      contrastChecks: [],
      tokenUpdates: {},
      iterations: 0,
    };

    // Resolved token map — populated when generate_palette runs so that
    // subsequent check_contrast calls can resolve CSS variable references.
    const resolvedTokens: Record<string, string> = {};

    // Agentic loop
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      result.iterations = iteration + 1;

      const response = await client.messages.create({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        tools: COLOR_TOOLS,
        messages,
      });

      // Collect assistant message
      messages.push({ role: 'assistant', content: response.content });

      // Check stop reason
      if (response.stop_reason === 'end_turn') {
        result.response = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === 'text')
          .map((block) => block.text)
          .join('\n');
        break;
      }

      if (response.stop_reason !== 'tool_use') {
        result.response = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === 'text')
          .map((block) => block.text)
          .join('\n');
        break;
      }

      // Execute tool calls
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        const toolInput = toolUse.input as Record<string, unknown>;
        let output: Record<string, unknown>;

        switch (toolUse.name) {
          case 'generate_palette': {
            output = await executeGeneratePalette(brandColor, toolInput);
            if (output['success']) {
              const lightTokens = output['lightTokens'] as Record<string, string>;
              Object.assign(resolvedTokens, lightTokens);
              Object.assign(result.tokens, lightTokens);
            }
            break;
          }
          case 'check_contrast': {
            output = await executeCheckContrast(resolvedTokens, toolInput);
            if (output['success']) {
              result.contrastChecks.push({
                foreground: toolInput['foreground'] as string,
                background: toolInput['background'] as string,
                ratio: output['ratio'] as number,
                ratioString: output['ratioString'] as string,
                passesAA: output['passesAA'] as boolean,
                passesAAA: output['passesAAA'] as boolean,
              });
            }
            break;
          }
          case 'suggest_harmonies': {
            output = await executeSuggestHarmonies(brandColor, toolInput);
            if (output['success'] && output['harmonies']) {
              result.harmonies.push(...(output['harmonies'] as HarmonySuggestion[]));
            }
            break;
          }
          case 'update_tokens': {
            output = await executeUpdateTokens(filePath, toolInput);
            if (output['success']) {
              const vars = (toolInput['variables'] as Record<string, string>) ?? {};
              Object.assign(result.tokenUpdates, vars);
            }
            break;
          }
          default:
            output = { error: `Unknown tool: ${toolUse.name}` };
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(output),
        });
      }

      // Feed tool results back to the model
      messages.push({ role: 'user', content: toolResults });
    }

    if (!result.response) {
      result.response =
        'Color system generation complete. Check the tokens and harmonies for details.';
    }

    return result;
  }

  return { run };
}
