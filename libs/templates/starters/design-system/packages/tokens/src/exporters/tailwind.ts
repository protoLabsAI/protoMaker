/**
 * Exports a DTCG token document as a Tailwind CSS configuration.
 *
 * Supports:
 * - Tailwind v3 (`theme.extend` JS object / `module.exports` file)
 * - Tailwind v4 (`@theme` CSS block)
 * - CSS variable references (`var(--token-path)`) or raw values
 */

import { walkTokens, pathToCSSVar } from '../dtcg.js';
import type { DTCGDocument, DTCGTokenType } from '../dtcg.js';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface TailwindExportOptions {
  /**
   * Tailwind version to target.
   * - `'v3'` (default): Emits a `theme.extend` JS object.
   * - `'v4'`: Emits an `@theme` CSS block.
   */
  version?: 'v3' | 'v4';

  /**
   * When `true` (default), property values are emitted as `var(--token-name)`
   * references so that runtime theming works via CSS custom properties.
   * When `false`, raw DTCG values are inlined.
   */
  useCSSVarReferences?: boolean;

  /**
   * When `true`, wraps the output in a full `module.exports = { theme: { extend: { … } } }`.
   * Only applies to Tailwind v3.
   * @default false
   */
  wrapInConfig?: boolean;

  /**
   * Indentation string.
   * @default '  ' (two spaces)
   */
  indent?: string;
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface TailwindExportResult {
  /** The generated Tailwind configuration string (JS or CSS). */
  config: string;
  /** The theme object for programmatic use (v3 only). */
  themeObject: TailwindTheme;
  /** Number of tokens that were mapped to a Tailwind section. */
  tokenCount: number;
}

// ---------------------------------------------------------------------------
// Theme shape (subset of Tailwind's theme)
// ---------------------------------------------------------------------------

export interface TailwindTheme {
  colors?: Record<string, string | Record<string, string>>;
  spacing?: Record<string, string | Record<string, string>>;
  fontFamily?: Record<string, string | string[]>;
  fontWeight?: Record<string, string | number>;
  fontSize?: Record<string, string | Record<string, string>>;
  lineHeight?: Record<string, string | Record<string, string>>;
  letterSpacing?: Record<string, string | Record<string, string>>;
  borderRadius?: Record<string, string | Record<string, string>>;
  boxShadow?: Record<string, string | Record<string, string>>;
  opacity?: Record<string, string | Record<string, string>>;
  transitionDuration?: Record<string, string | Record<string, string>>;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Section mapping
// ---------------------------------------------------------------------------

// DTCG type → default Tailwind theme section
const DTCG_TYPE_TO_SECTION: Partial<Record<DTCGTokenType, string>> = {
  color: 'colors',
  'font-family': 'fontFamily',
  'font-weight': 'fontWeight',
  shadow: 'boxShadow',
  duration: 'transitionDuration',
};

// Substrings in the token path that hint at a more specific section
const PATH_HINTS: Array<[string, string]> = [
  ['border-radius', 'borderRadius'],
  ['rounded', 'borderRadius'],
  ['radius', 'borderRadius'],
  ['shadow', 'boxShadow'],
  ['opacity', 'opacity'],
  ['line-height', 'lineHeight'],
  ['leading', 'lineHeight'],
  ['letter-spacing', 'letterSpacing'],
  ['tracking', 'letterSpacing'],
  ['font-size', 'fontSize'],
  ['text-size', 'fontSize'],
  ['duration', 'transitionDuration'],
  ['delay', 'transitionDelay'],
  ['font-family', 'fontFamily'],
  ['font-weight', 'fontWeight'],
  ['font-style', 'fontStyle'],
];

// Tailwind v4 namespace for each v3 section key
const V4_NAMESPACE: Record<string, string> = {
  colors: 'color',
  spacing: 'spacing',
  fontFamily: 'font',
  fontWeight: 'font-weight',
  fontStyle: 'font-style',
  fontSize: 'text',
  lineHeight: 'leading',
  letterSpacing: 'tracking',
  borderRadius: 'radius',
  boxShadow: 'shadow',
  opacity: 'opacity',
  transitionDuration: 'duration',
  transitionDelay: 'delay',
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Exports a DTCG document as a Tailwind CSS configuration.
 *
 * @example
 * ```ts
 * // Tailwind v3 — full config file
 * const { config } = exportToTailwind(doc, { wrapInConfig: true });
 * fs.writeFileSync('tailwind.config.js', config);
 *
 * // Tailwind v4 — @theme block for your global CSS
 * const { config } = exportToTailwind(doc, { version: 'v4' });
 * fs.writeFileSync('tokens.css', config);
 * ```
 */
export function exportToTailwind(
  doc: DTCGDocument,
  options: TailwindExportOptions = {}
): TailwindExportResult {
  const version = options.version ?? 'v3';
  const useCSSVarReferences = options.useCSSVarReferences ?? true;
  const wrapInConfig = options.wrapInConfig ?? false;
  const indent = options.indent ?? '  ';

  const theme: TailwindTheme = {};
  let tokenCount = 0;

  walkTokens(doc, (token, path, resolvedType) => {
    const section = inferSection(path, resolvedType);
    if (!section) return; // no mapping — skip

    const value = useCSSVarReferences
      ? `var(${pathToCSSVar(path)})`
      : tokenValueToString(token.$value, resolvedType);

    // Ensure the section bucket exists
    if (!theme[section]) theme[section] = {};

    // Build nested key path within the section
    const keySegments = buildSectionPath(path.split('.'), section);
    setNestedValue(theme[section] as Record<string, unknown>, keySegments, value);

    tokenCount++;
  });

  const config =
    version === 'v4' ? buildV4Config(theme, indent) : buildV3Config(theme, indent, wrapInConfig);

  return { config, themeObject: theme, tokenCount };
}

// ---------------------------------------------------------------------------
// Section inference
// ---------------------------------------------------------------------------

function inferSection(path: string, type: DTCGTokenType | undefined): string | null {
  const lowerPath = path.toLowerCase();

  // 1. Path hints take priority (more specific)
  for (const [hint, section] of PATH_HINTS) {
    if (lowerPath.includes(hint)) return section;
  }

  // 2. Dimension type: infer section from path keywords
  if (type === 'dimension' || type === 'number') {
    return 'spacing'; // fallback for dimensions without a clearer hint
  }

  // 3. Direct type mapping
  if (type && DTCG_TYPE_TO_SECTION[type]) {
    return DTCG_TYPE_TO_SECTION[type] as string;
  }

  return null;
}

/**
 * Builds the nested key path inside a Tailwind section by stripping the
 * leading segment(s) that name the section itself (e.g. for section 'colors',
 * strip `color` / `colours` from the front of the path).
 */
function buildSectionPath(segments: string[], section: string): string[] {
  const sectionAliases: Record<string, string[]> = {
    colors: ['color', 'colour', 'colors', 'colours'],
    spacing: ['spacing', 'space', 'gap', 'size'],
    fontFamily: ['font-family', 'fontfamily', 'font', 'fonts'],
    fontWeight: ['font-weight', 'fontweight', 'weight'],
    fontSize: ['font-size', 'fontsize', 'text-size', 'textsize'],
    lineHeight: ['line-height', 'lineheight', 'leading'],
    letterSpacing: ['letter-spacing', 'letterspacing', 'tracking'],
    borderRadius: ['border-radius', 'borderradius', 'rounded', 'radius'],
    boxShadow: ['box-shadow', 'boxshadow', 'shadow', 'shadows'],
    opacity: ['opacity'],
    transitionDuration: ['duration', 'transition-duration', 'transitionduration'],
  };

  const aliases = sectionAliases[section] ?? [];
  if (segments.length > 1 && aliases.includes(segments[0].toLowerCase())) {
    return segments.slice(1);
  }
  return segments;
}

// ---------------------------------------------------------------------------
// Tailwind v3 output
// ---------------------------------------------------------------------------

function buildV3Config(theme: TailwindTheme, indent: string, wrapInConfig: boolean): string {
  const themeStr = serializeToJS(theme, indent, indent);

  if (wrapInConfig) {
    return [
      "/** @type {import('tailwindcss').Config} */",
      'module.exports = {',
      `${indent}theme: {`,
      `${indent}${indent}extend: ${themeStr
        .split('\n')
        .map((line, i) => (i === 0 ? line : `${indent}${indent}${line}`))
        .join('\n')},`,
      `${indent}},`,
      '};',
    ].join('\n');
  }

  return themeStr;
}

// ---------------------------------------------------------------------------
// Tailwind v4 output
// ---------------------------------------------------------------------------

function buildV4Config(theme: TailwindTheme, indent: string): string {
  const lines: string[] = ['@theme {'];

  for (const [section, values] of Object.entries(theme)) {
    const ns = V4_NAMESPACE[section];
    if (!ns || typeof values !== 'object' || values === null) continue;

    lines.push(`${indent}/* ${section} */`);
    flattenObject(values as Record<string, unknown>, (path, value) => {
      lines.push(`${indent}--${ns}-${path}: ${value};`);
    });
  }

  lines.push('}');
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/**
 * Sets a value at a nested path inside an object,
 * creating intermediate objects as needed.
 */
function setNestedValue(obj: Record<string, unknown>, segments: string[], value: string): void {
  let current = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (typeof current[seg] !== 'object' || current[seg] === null) {
      current[seg] = {};
    }
    current = current[seg] as Record<string, unknown>;
  }
  current[segments[segments.length - 1]] = value;
}

/**
 * Walks a (possibly nested) object and calls `visitor` for each leaf string.
 * The `path` argument uses `-` as separator (for CSS custom property names).
 */
function flattenObject(
  obj: Record<string, unknown>,
  visitor: (path: string, value: string) => void,
  prefix = ''
): void {
  for (const [key, value] of Object.entries(obj)) {
    const currentPath = prefix ? `${prefix}-${key}` : key;
    if (typeof value === 'string') {
      visitor(currentPath, value);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      flattenObject(value as Record<string, unknown>, visitor, currentPath);
    }
  }
}

/** Converts a DTCG token $value to a plain string for use in Tailwind config. */
function tokenValueToString(value: unknown, type: DTCGTokenType | undefined): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);

  if (Array.isArray(value)) {
    if (
      type === 'cubic-bezier' &&
      value.length === 4 &&
      (value as unknown[]).every((v) => typeof v === 'number')
    ) {
      return `cubic-bezier(${(value as number[]).join(', ')})`;
    }
    if (type === 'font-family') {
      return (value as string[]).map((f) => (f.includes(' ') ? `"${f}"` : f)).join(', ');
    }
    return value.join(', ');
  }

  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;

    if (type === 'shadow' && 'offsetX' in obj) {
      const s = obj as {
        color: string;
        offsetX: string;
        offsetY: string;
        blur: string;
        spread: string;
        inset?: boolean;
      };
      return `${s.inset ? 'inset ' : ''}${s.offsetX} ${s.offsetY} ${s.blur} ${s.spread} ${s.color}`;
    }
  }

  return JSON.stringify(value);
}

/**
 * Serialises a plain JS object to a JavaScript object literal string,
 * formatted with the given indentation.
 */
function serializeToJS(obj: unknown, indent: string, currentIndent: string): string {
  if (typeof obj === 'string') return JSON.stringify(obj);
  if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj);
  if (obj === null) return 'null';

  if (Array.isArray(obj)) {
    const items = obj.map((item) => serializeToJS(item, indent, currentIndent + indent));
    return `[${items.join(', ')}]`;
  }

  if (typeof obj === 'object') {
    const entries = Object.entries(obj as Record<string, unknown>);
    if (entries.length === 0) return '{}';

    const nextIndent = currentIndent + indent;
    const lines = entries.map(([k, v]) => {
      // Unquote simple identifiers
      const key = /^[a-zA-Z_$][a-zA-Z0-9_$-]*$/.test(k) ? k : JSON.stringify(k);
      return `${nextIndent}${key}: ${serializeToJS(v, indent, nextIndent)}`;
    });

    return `{\n${lines.join(',\n')}\n${currentIndent}}`;
  }

  return String(obj);
}
