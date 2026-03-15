/**
 * Exports a DTCG token document as CSS custom properties.
 *
 * Supports:
 * - Root :root block with all default values
 * - Theme override blocks (data-attribute, class, or media-query strategy)
 * - Both 'extensions' and 'groups' theme layouts from the extractor
 */

import { walkTokens, pathToCSSVar, isDTCGToken } from '../dtcg.js';
import type { DTCGDocument, DTCGTokenType } from '../dtcg.js';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface CSSExportOptions {
  /**
   * CSS selector for the default (light) token block.
   * @default ':root'
   */
  rootSelector?: string;

  /**
   * Whether to emit theme override blocks for variants stored in
   * `$extensions.themes`. Only applies when using the 'extensions' strategy.
   * @default true
   */
  emitThemes?: boolean;

  /**
   * Strategy for targeting the dark/alternate theme:
   * - `'data-attribute'` (default): `[data-theme="dark"]`
   * - `'class'`: `.dark`
   * - `'media'`: `@media (prefers-color-scheme: dark)`
   */
  darkThemeStrategy?: 'data-attribute' | 'class' | 'media';

  /**
   * The theme name used when building the dark-mode selector.
   * @default 'dark'
   */
  darkThemeName?: string;

  /**
   * When `true`, `$description` values are emitted as CSS comments above
   * each custom property.
   * @default false
   */
  includeComments?: boolean;

  /**
   * Indentation string for property lines inside a selector block.
   * @default '  ' (two spaces)
   */
  indent?: string;
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface CSSExportResult {
  /** The full CSS output string. */
  css: string;
  /** Number of tokens in the default (:root) block. */
  tokenCount: number;
  /** Number of tokens emitted inside theme override blocks. */
  themeTokenCount: number;
}

// ---------------------------------------------------------------------------
// Export: extensions strategy
// ---------------------------------------------------------------------------

/**
 * Exports a DTCG document — extracted with `themeStrategy: 'extensions'` —
 * as CSS custom properties.
 *
 * All tokens land in a single root selector block.  Non-default theme values
 * (stored in `$extensions.themes`) are emitted in separate selector blocks.
 *
 * @example
 * ```ts
 * const { css } = exportToCSS(doc, { darkThemeStrategy: 'media' });
 * fs.writeFileSync('tokens.css', css);
 * ```
 */
export function exportToCSS(doc: DTCGDocument, options: CSSExportOptions = {}): CSSExportResult {
  const rootSelector = options.rootSelector ?? ':root';
  const emitThemes = options.emitThemes ?? true;
  const darkThemeStrategy = options.darkThemeStrategy ?? 'data-attribute';
  const darkThemeName = options.darkThemeName ?? 'dark';
  const includeComments = options.includeComments ?? false;
  const indent = options.indent ?? '  ';

  const rootLines: string[] = [];
  // modeKey (e.g. 'dark' | 'light/dark' | …) → property lines
  const themeLines: Record<string, string[]> = {};
  let tokenCount = 0;
  let themeTokenCount = 0;

  walkTokens(doc, (token, path, resolvedType) => {
    const cssVar = pathToCSSVar(path);
    const cssValue = tokenValueToCSS(token.$value, resolvedType);

    if (includeComments && token.$description) {
      rootLines.push(`${indent}/* ${token.$description} */`);
    }
    rootLines.push(`${indent}${cssVar}: ${cssValue};`);
    tokenCount++;

    // Emit alternate theme values from $extensions.themes
    if (emitThemes && token.$extensions?.['themes']) {
      const themeMap = token.$extensions['themes'] as Record<string, unknown>;
      for (const [modeKey, modeValue] of Object.entries(themeMap)) {
        // Skip the default/light entry (it is already in :root)
        if (modeKey.includes('light')) continue;

        if (!themeLines[modeKey]) themeLines[modeKey] = [];
        const themeCSSValue = tokenValueToCSS(modeValue as string | number, resolvedType);
        themeLines[modeKey].push(`${indent}${cssVar}: ${themeCSSValue};`);
        themeTokenCount++;
      }
    }
  });

  // Assemble CSS
  const parts: string[] = [`${rootSelector} {`, ...rootLines, '}'];

  if (emitThemes) {
    for (const [modeKey, lines] of Object.entries(themeLines)) {
      if (lines.length === 0) continue;
      parts.push('');
      const selector = buildThemeSelector(darkThemeStrategy, darkThemeName, modeKey);
      parts.push(`${selector} {`, ...lines, '}');
    }
  }

  return { css: parts.join('\n') + '\n', tokenCount, themeTokenCount };
}

// ---------------------------------------------------------------------------
// Export: groups strategy
// ---------------------------------------------------------------------------

/**
 * Exports a DTCG document — extracted with `themeStrategy: 'groups'` —
 * as CSS custom properties.
 *
 * Each top-level group (e.g. `light`, `dark`) becomes its own CSS selector
 * block.  The group whose key matches `defaultGroupKey` is mapped to
 * `rootSelector`.
 *
 * @example
 * ```ts
 * const { css } = exportGroupedToCSS(doc, {
 *   defaultGroupKey: 'light',
 *   darkThemeStrategy: 'class',
 * });
 * ```
 */
export function exportGroupedToCSS(
  doc: DTCGDocument,
  options: CSSExportOptions & {
    /**
     * The group key that should map to the default root selector.
     * @default 'light'
     */
    defaultGroupKey?: string;
    /**
     * Override the generated selector for specific group keys.
     * e.g. `{ 'dark': '[data-color-scheme="dark"]' }`
     */
    groupSelectors?: Record<string, string>;
  } = {}
): CSSExportResult {
  const rootSelector = options.rootSelector ?? ':root';
  const indent = options.indent ?? '  ';
  const defaultGroupKey = options.defaultGroupKey ?? 'light';
  const darkThemeStrategy = options.darkThemeStrategy ?? 'data-attribute';
  const darkThemeName = options.darkThemeName ?? 'dark';

  const parts: string[] = [];
  let tokenCount = 0;
  let themeTokenCount = 0;

  for (const [groupKey, groupValue] of Object.entries(doc)) {
    if (groupKey.startsWith('$')) continue;
    if (!isDTCGToken(groupValue) && typeof groupValue !== 'object') continue;

    const vars: string[] = [];

    // Walk this group, stripping the leading group key from each path
    walkTokens({ [groupKey]: groupValue } as DTCGDocument, (token, path, resolvedType) => {
      // Remove the leading "groupKey." prefix
      const trimmedPath = path.replace(new RegExp(`^${escapeRegex(groupKey)}\\.?`), '');
      if (!trimmedPath) return;

      const cssVar = pathToCSSVar(trimmedPath);
      const cssValue = tokenValueToCSS(token.$value, resolvedType);
      vars.push(`${indent}${cssVar}: ${cssValue};`);
    });

    if (vars.length === 0) continue;

    const isDefault = groupKey === defaultGroupKey;
    const selector = isDefault
      ? rootSelector
      : (options.groupSelectors?.[groupKey] ??
        buildThemeSelector(darkThemeStrategy, darkThemeName, groupKey));

    parts.push(`${selector} {`, ...vars, '}', '');

    if (isDefault) tokenCount += vars.length;
    else themeTokenCount += vars.length;
  }

  return { css: parts.join('\n'), tokenCount, themeTokenCount };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Builds a CSS selector for an alternate theme (non-default mode).
 */
function buildThemeSelector(
  strategy: 'data-attribute' | 'class' | 'media',
  darkThemeName: string,
  modeKey: string
): string {
  const isDark = modeKey.includes('dark');
  const displayName = isDark ? darkThemeName : modeKey;

  switch (strategy) {
    case 'data-attribute':
      return `[data-theme="${displayName}"]`;
    case 'class':
      return `.${displayName}`;
    case 'media':
      return `@media (prefers-color-scheme: ${isDark ? 'dark' : 'light'})`;
  }
}

/**
 * Converts a DTCG token `$value` to a CSS value string.
 */
export function tokenValueToCSS(value: unknown, type: DTCGTokenType | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;

  if (Array.isArray(value)) {
    // cubic-bezier: [x1, y1, x2, y2]
    if (value.length === 4 && (value as unknown[]).every((v) => typeof v === 'number')) {
      return `cubic-bezier(${(value as number[]).join(', ')})`;
    }
    // Gradient stops: [{ color, position }]
    if (value.length > 0 && typeof value[0] === 'object' && 'color' in (value[0] as object)) {
      return gradientToCSS(value as Array<{ color: string; position: number }>);
    }
    return value.join(', ');
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;

    // Shadow composite
    if ('offsetX' in obj) {
      return shadowToCSS(
        obj as {
          color: string;
          offsetX: string;
          offsetY: string;
          blur: string;
          spread: string;
          inset?: boolean;
        }
      );
    }

    // Typography composite
    if ('fontFamily' in obj || 'fontSize' in obj) {
      return typographyToCSS(
        obj as {
          fontFamily?: string | string[];
          fontSize?: string;
          fontWeight?: number | string;
          fontStyle?: string;
          letterSpacing?: string;
          lineHeight?: string | number;
        }
      );
    }

    // Border composite
    if ('width' in obj && 'style' in obj && 'color' in obj) {
      return `${obj['width']} ${obj['style']} ${obj['color']}`;
    }

    // Transition composite
    if ('duration' in obj) {
      const t = obj as {
        duration: string;
        delay?: string;
        timingFunction?: [number, number, number, number];
      };
      const parts = [t.duration];
      if (t.delay) parts.push(t.delay);
      if (t.timingFunction) {
        parts.push(`cubic-bezier(${t.timingFunction.join(', ')})`);
      }
      return parts.join(' ');
    }
  }

  return String(value);
}

function shadowToCSS(shadow: {
  color: string;
  offsetX: string;
  offsetY: string;
  blur: string;
  spread: string;
  inset?: boolean;
}): string {
  const parts = [
    shadow.inset ? 'inset' : '',
    shadow.offsetX,
    shadow.offsetY,
    shadow.blur,
    shadow.spread,
    shadow.color,
  ].filter(Boolean);
  return parts.join(' ');
}

function gradientToCSS(stops: Array<{ color: string; position: number }>): string {
  const stopStr = stops.map((s) => `${s.color} ${Math.round(s.position * 100)}%`).join(', ');
  return `linear-gradient(${stopStr})`;
}

function typographyToCSS(value: {
  fontFamily?: string | string[];
  fontSize?: string;
  fontWeight?: number | string;
  fontStyle?: string;
  letterSpacing?: string;
  lineHeight?: string | number;
}): string {
  const parts: string[] = [];
  if (value.fontStyle) parts.push(value.fontStyle);
  if (value.fontWeight) parts.push(String(value.fontWeight));
  if (value.fontSize) {
    const size = value.lineHeight ? `${value.fontSize}/${value.lineHeight}` : value.fontSize;
    parts.push(size);
  }
  if (value.fontFamily) {
    const families = Array.isArray(value.fontFamily)
      ? value.fontFamily.map((f) => (f.includes(' ') ? `"${f}"` : f)).join(', ')
      : value.fontFamily;
    parts.push(families);
  }
  return parts.join(' ') || 'inherit';
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
