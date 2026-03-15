/**
 * Extracts W3C DTCG design tokens from .pen file variable declarations.
 *
 * Supports:
 * - Plain scalar values (string / number)
 * - Theme-conditional values (light / dark variants)
 * - Automatic pen-type → DTCG-type mapping
 * - Two theme strategies: 'extensions' (default) or 'groups'
 */

import { isDTCGReservedKey, penVarToPath } from './dtcg.js';
import type { DTCGDocument, DTCGGroup, DTCGToken, DTCGTokenType } from './dtcg.js';

// ---------------------------------------------------------------------------
// .pen file types (the subset we need for extraction)
// ---------------------------------------------------------------------------

/** A theme-conditional value entry from a .pen variable. */
export interface PenThemeValue {
  value: string | number;
  /** Maps theme dimension names to mode values, e.g. `{ "Mode": "Dark" }`. */
  theme: Record<string, string>;
}

/** A single .pen file variable declaration. */
export interface PenVariable {
  type: string; // 'color' | 'dimension' | 'number' | …
  value: string | number | PenThemeValue[];
}

/** The full variables map from a .pen document. */
export type PenVariables = Record<string, PenVariable>;

/**
 * Theme declarations from a .pen document.
 * e.g. `{ "Mode": ["Light", "Dark"], "Base": ["Zinc", "Slate"] }`
 */
export type PenThemes = Record<string, string[]>;

// ---------------------------------------------------------------------------
// Extraction options
// ---------------------------------------------------------------------------

export interface ExtractionOptions {
  /**
   * How theme variants are stored in the output DTCG document.
   *
   * - `'extensions'` (default): All values live at the same path; non-default
   *   theme values are attached under `$extensions.themes`.
   * - `'groups'`: Separate top-level groups are emitted per theme mode
   *   (e.g. `{ light: { … }, dark: { … } }`).
   */
  themeStrategy?: 'extensions' | 'groups';

  /**
   * The theme dimension key used to detect light/dark variants.
   * Defaults to `'Mode'`.
   */
  themeDimension?: string;

  /**
   * The mode value that represents the default (light) theme.
   * Defaults to `'Light'`.
   */
  defaultThemeValue?: string;

  /**
   * Optional top-level group name to nest all extracted tokens under.
   * e.g. `'brand'` → tokens appear at `brand.<name>`.
   */
  groupPrefix?: string;
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface ExtractionResult {
  /** The DTCG document containing the extracted tokens. */
  document: DTCGDocument;

  /**
   * Theme modes discovered while processing the variables.
   * Keys are dimension names (e.g. `'Mode'`), values are mode arrays
   * (e.g. `['Light', 'Dark']`).
   */
  themes: Record<string, string[]>;

  /** Total number of tokens extracted. */
  tokenCount: number;
}

// ---------------------------------------------------------------------------
// Type mapping
// ---------------------------------------------------------------------------

const PEN_TYPE_TO_DTCG: Record<string, DTCGTokenType> = {
  color: 'color',
  dimension: 'dimension',
  number: 'number',
  string: 'string',
  'font-family': 'font-family',
  'font-weight': 'font-weight',
  'font-style': 'font-style',
  duration: 'duration',
  'cubic-bezier': 'cubic-bezier',
};

function mapPenTypeToDTCG(penType: string): DTCGTokenType | undefined {
  return PEN_TYPE_TO_DTCG[penType.toLowerCase()];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extracts design tokens from .pen file variables and returns a DTCG document.
 *
 * @param variables  The `variables` map from a parsed .pen file.
 * @param penThemes  Optional `themes` map from the .pen file for mode discovery.
 * @param options    Extraction options (theme strategy, dimension name, etc.).
 *
 * @example
 * ```ts
 * const { document, themes } = extractTokensFromPen(penDoc.variables, penDoc.themes);
 * ```
 */
export function extractTokensFromPen(
  variables: PenVariables,
  penThemes?: PenThemes,
  options: ExtractionOptions = {}
): ExtractionResult {
  const strategy = options.themeStrategy ?? 'extensions';
  const themeDimension = options.themeDimension ?? 'Mode';
  const defaultThemeValue = options.defaultThemeValue ?? 'Light';

  // Seed discovered themes from the .pen themes declaration
  const discoveredThemes: Record<string, Set<string>> = {};
  if (penThemes) {
    for (const [dimension, modes] of Object.entries(penThemes)) {
      discoveredThemes[dimension] = new Set(modes);
    }
  }

  // First pass: build flat token map
  const flatTokens: Record<string, DTCGToken> = {};
  let tokenCount = 0;

  for (const [rawName, variable] of Object.entries(variables)) {
    // Strip leading '--' if present (pen files sometimes include it)
    const name = penVarToPath(rawName);
    const dtcgType = mapPenTypeToDTCG(variable.type);

    if (Array.isArray(variable.value)) {
      // Theme-conditional: discover modes, then pick default value
      const themeValues = variable.value as PenThemeValue[];

      for (const tv of themeValues) {
        for (const [dim, mode] of Object.entries(tv.theme)) {
          if (!discoveredThemes[dim]) discoveredThemes[dim] = new Set();
          discoveredThemes[dim].add(mode);
        }
      }

      const defaultEntry =
        themeValues.find((tv) => tv.theme[themeDimension] === defaultThemeValue) ?? themeValues[0];

      if (!defaultEntry) continue;

      const token: DTCGToken = {
        $value: normalizeValue(defaultEntry.value, variable.type),
      };
      if (dtcgType) token.$type = dtcgType;

      if (strategy === 'extensions') {
        // Attach all theme variants under $extensions.themes
        const themeExts: Record<string, string | number> = {};
        for (const tv of themeValues) {
          // Use the mode value as the key, lowercased
          const modeKey = Object.values(tv.theme).join('/').toLowerCase().replace(/\s+/g, '-');
          themeExts[modeKey] = normalizeValue(tv.value, variable.type);
        }
        token.$extensions = { themes: themeExts };
      }

      flatTokens[name] = token;
    } else {
      // Plain scalar value
      const token: DTCGToken = {
        $value: normalizeValue(variable.value as string | number, variable.type),
      };
      if (dtcgType) token.$type = dtcgType;
      flatTokens[name] = token;
    }

    tokenCount++;
  }

  // Second pass: build the DTCG document
  const document =
    strategy === 'groups'
      ? buildGroupedDocument(
          flatTokens,
          variables,
          themeDimension,
          defaultThemeValue,
          options.groupPrefix
        )
      : buildNestedDocument(flatTokens, options.groupPrefix);

  // Convert Sets → arrays
  const themes: Record<string, string[]> = {};
  for (const [dim, modes] of Object.entries(discoveredThemes)) {
    themes[dim] = Array.from(modes);
  }

  return { document, themes, tokenCount };
}

// ---------------------------------------------------------------------------
// Document builders
// ---------------------------------------------------------------------------

/**
 * Builds a nested DTCG document from a flat token map.
 * Token names are split on '-' to create nested groups.
 * e.g. `'color-brand-primary'` → `{ color: { brand: { primary: <token> } } }`
 */
function buildNestedDocument(
  tokens: Record<string, DTCGToken>,
  groupPrefix?: string
): DTCGDocument {
  const doc: DTCGDocument = {};

  for (const [name, token] of Object.entries(tokens)) {
    const segments = name.split('-');
    let current = doc as Record<string, unknown>;

    if (groupPrefix) {
      if (!current[groupPrefix]) current[groupPrefix] = {} as DTCGGroup;
      current = current[groupPrefix] as Record<string, unknown>;
    }

    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i];
      if (!current[seg] || isDTCGReservedKey(seg)) {
        current[seg] = {} as DTCGGroup;
      }
      current = current[seg] as Record<string, unknown>;
    }

    current[segments[segments.length - 1]] = token;
  }

  return doc;
}

/**
 * Builds a DTCG document with separate top-level groups per theme mode.
 * e.g. `{ light: { color: { … } }, dark: { color: { … } } }`
 */
function buildGroupedDocument(
  defaultTokens: Record<string, DTCGToken>,
  variables: PenVariables,
  themeDimension: string,
  defaultThemeValue: string,
  groupPrefix?: string
): DTCGDocument {
  const doc: DTCGDocument = {};

  // Build default (light) group
  const defaultGroup: DTCGGroup = {};
  for (const [name, token] of Object.entries(defaultTokens)) {
    // Strip $extensions — they are unneeded in the group strategy
    const { $extensions: _ext, ...base } = token;
    setNestedToken(defaultGroup, name.split('-'), base as DTCGToken);
  }

  const defaultKey = defaultThemeValue.toLowerCase();
  if (groupPrefix) {
    doc[groupPrefix] = { [defaultKey]: defaultGroup } as DTCGGroup;
  } else {
    doc[defaultKey] = defaultGroup;
  }

  // Build per-mode groups for non-default theme values
  for (const [rawName, variable] of Object.entries(variables)) {
    if (!Array.isArray(variable.value)) continue;

    const name = penVarToPath(rawName);
    const dtcgType = mapPenTypeToDTCG(variable.type);

    for (const tv of variable.value as PenThemeValue[]) {
      const modeValue = tv.theme[themeDimension];
      if (!modeValue || modeValue === defaultThemeValue) continue;

      const groupKey = modeValue.toLowerCase().replace(/\s+/g, '-');
      const targetDoc = groupPrefix ? (doc[groupPrefix] as DTCGGroup) : doc;

      if (!targetDoc[groupKey]) {
        (targetDoc as Record<string, unknown>)[groupKey] = {} as DTCGGroup;
      }

      const token: DTCGToken = {
        $value: normalizeValue(tv.value, variable.type),
      };
      if (dtcgType) token.$type = dtcgType;

      setNestedToken(
        (targetDoc as Record<string, unknown>)[groupKey] as DTCGGroup,
        name.split('-'),
        token
      );
    }
  }

  return doc;
}

/** Writes a token into a group at the path described by `segments`. */
function setNestedToken(group: DTCGGroup, segments: string[], token: DTCGToken): void {
  let current = group as Record<string, unknown>;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (!current[seg]) current[seg] = {} as DTCGGroup;
    current = current[seg] as Record<string, unknown>;
  }
  current[segments[segments.length - 1]] = token;
}

// ---------------------------------------------------------------------------
// Value normalisation
// ---------------------------------------------------------------------------

/** Normalises a raw .pen value into a DTCG-compatible scalar. */
function normalizeValue(value: string | number, type: string): string | number {
  if (typeof value === 'number') return value;

  // Expand shorthand hex colours (#RGB → #RRGGBB)
  if (type === 'color' && /^#[0-9a-fA-F]{3}$/.test(value)) {
    const [, r, g, b] = value.match(/^#(.)(.)(.)$/) ?? [];
    if (r && g && b) return `#${r}${r}${g}${g}${b}${b}`;
  }

  return value;
}

// ---------------------------------------------------------------------------
// Re-exports for convenience
// ---------------------------------------------------------------------------
export type { DTCGDocument, DTCGGroup, DTCGToken, DTCGTokenType };
