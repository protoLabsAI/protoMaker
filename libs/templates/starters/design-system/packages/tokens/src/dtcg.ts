/**
 * W3C Design Tokens Community Group (DTCG) specification types and utilities.
 * Based on the 2025.10 stable specification.
 *
 * @see https://design-tokens.github.io/community-group/format/
 */

// ---------------------------------------------------------------------------
// Token types
// ---------------------------------------------------------------------------

/** All recognized DTCG token $type values (2025.10 spec). */
export type DTCGTokenType =
  | 'color'
  | 'dimension'
  | 'font-family'
  | 'font-weight'
  | 'font-style'
  | 'number'
  | 'duration'
  | 'cubic-bezier'
  | 'shadow'
  | 'gradient'
  | 'typography'
  | 'border'
  | 'string'
  | 'transition';

// ---------------------------------------------------------------------------
// Composite value types
// ---------------------------------------------------------------------------

/** A single drop/box shadow. */
export interface DTCGShadowValue {
  color: string;
  offsetX: string;
  offsetY: string;
  blur: string;
  spread: string;
  inset?: boolean;
}

/** A single gradient colour stop. */
export interface DTCGGradientStop {
  color: string;
  /** Position in the gradient, expressed as a number between 0 and 1. */
  position: number;
}

/** An array of gradient stops. */
export type DTCGGradientValue = DTCGGradientStop[];

/** Composite typography token. */
export interface DTCGTypographyValue {
  fontFamily?: string | string[];
  fontSize?: string;
  fontWeight?: number | string;
  fontStyle?: string;
  letterSpacing?: string;
  lineHeight?: string | number;
}

/** Composite border token. */
export interface DTCGBorderValue {
  color: string;
  width: string;
  style: string;
}

/** Composite transition token. */
export interface DTCGTransitionValue {
  duration: string;
  delay?: string;
  timingFunction?: [number, number, number, number];
}

/** Union of all valid DTCG token $value types. */
export type DTCGTokenValue =
  | string
  | number
  | boolean
  | [number, number, number, number] // cubic-bezier
  | DTCGShadowValue
  | DTCGShadowValue[] // multiple shadows
  | DTCGGradientValue
  | DTCGTypographyValue
  | DTCGBorderValue
  | DTCGTransitionValue;

// ---------------------------------------------------------------------------
// Core token / group structures
// ---------------------------------------------------------------------------

/** A leaf DTCG design token — has a $value. */
export interface DTCGToken {
  $value: DTCGTokenValue;
  $type?: DTCGTokenType;
  $description?: string;
  /** Non-standard extensions (e.g. theme variants stored under $extensions.themes). */
  $extensions?: Record<string, unknown>;
}

/**
 * A DTCG token group — an object that contains tokens or nested groups.
 * Does NOT have a $value property.
 */
export interface DTCGGroup {
  $type?: DTCGTokenType;
  $description?: string;
  $extensions?: Record<string, unknown>;
  [key: string]: DTCGToken | DTCGGroup | DTCGTokenType | string | unknown;
}

/** Root DTCG document — a group of groups / tokens. */
export type DTCGDocument = DTCGGroup;

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

/** Returns `true` if `value` is a DTCG token (has a `$value` property). */
export function isDTCGToken(value: unknown): value is DTCGToken {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && '$value' in value;
}

/** Returns `true` if `value` is a DTCG group (object without `$value`). */
export function isDTCGGroup(value: unknown): value is DTCGGroup {
  return (
    typeof value === 'object' && value !== null && !Array.isArray(value) && !('$value' in value)
  );
}

/** Returns `true` if `key` is a DTCG reserved keyword (starts with `$`). */
export function isDTCGReservedKey(key: string): boolean {
  return key.startsWith('$');
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface DTCGValidationError {
  /** Dot-separated path to the offending token/group (e.g. `color.brand.primary`). */
  path: string;
  message: string;
}

const VALID_TOKEN_TYPES = new Set<string>([
  'color',
  'dimension',
  'font-family',
  'font-weight',
  'font-style',
  'number',
  'duration',
  'cubic-bezier',
  'shadow',
  'gradient',
  'typography',
  'border',
  'string',
  'transition',
]);

/**
 * Validates a DTCG document against the W3C spec.
 *
 * @param doc     The document to validate.
 * @param options Pass `{ strict: true }` to enable deep value validation.
 * @returns       An array of validation errors; empty means the document is valid.
 */
export function validateDTCGDocument(
  doc: DTCGDocument,
  options: { strict?: boolean } = {}
): DTCGValidationError[] {
  const errors: DTCGValidationError[] = [];
  validateNode(doc, '', errors, options.strict ?? false);
  return errors;
}

function validateNode(
  node: unknown,
  path: string,
  errors: DTCGValidationError[],
  strict: boolean
): void {
  if (typeof node !== 'object' || node === null || Array.isArray(node)) return;

  const obj = node as Record<string, unknown>;

  if (isDTCGToken(obj)) {
    const type = obj.$type as DTCGTokenType | undefined;
    if (type !== undefined && !VALID_TOKEN_TYPES.has(type)) {
      errors.push({ path, message: `Unknown $type: "${type}"` });
    }
    if (strict) {
      validateTokenValue(obj.$value, type, path, errors);
    }
  } else {
    // Group — recurse into children
    for (const [key, value] of Object.entries(obj)) {
      if (isDTCGReservedKey(key)) continue;
      const childPath = path ? `${path}.${key}` : key;
      validateNode(value, childPath, errors, strict);
    }
  }
}

function validateTokenValue(
  value: unknown,
  type: DTCGTokenType | undefined,
  path: string,
  errors: DTCGValidationError[]
): void {
  if (value === undefined || value === null) {
    errors.push({ path, message: '$value is required' });
    return;
  }

  if (!type) return; // without a type we cannot do deeper validation

  switch (type) {
    case 'color':
      if (typeof value !== 'string') {
        errors.push({ path, message: 'color $value must be a string' });
      } else if (!isValidColor(value)) {
        errors.push({ path, message: `Invalid color value: "${value}"` });
      }
      break;

    case 'dimension':
      if (typeof value !== 'string') {
        errors.push({ path, message: 'dimension $value must be a string (e.g. "16px")' });
      } else if (!isValidDimension(value)) {
        errors.push({ path, message: `Invalid dimension value: "${value}"` });
      }
      break;

    case 'number':
      if (typeof value !== 'number') {
        errors.push({ path, message: 'number $value must be a number' });
      }
      break;

    case 'font-weight':
      if (typeof value !== 'number' && typeof value !== 'string') {
        errors.push({ path, message: 'font-weight $value must be a number or string keyword' });
      }
      break;

    case 'cubic-bezier':
      if (
        !Array.isArray(value) ||
        value.length !== 4 ||
        !(value as unknown[]).every((v) => typeof v === 'number')
      ) {
        errors.push({
          path,
          message: 'cubic-bezier $value must be an array of 4 numbers [x1, y1, x2, y2]',
        });
      }
      break;

    case 'duration':
      if (typeof value !== 'string') {
        errors.push({ path, message: 'duration $value must be a string (e.g. "200ms")' });
      }
      break;

    case 'font-family':
      if (typeof value !== 'string' && !Array.isArray(value)) {
        errors.push({ path, message: 'font-family $value must be a string or array of strings' });
      }
      break;

    default:
      break;
  }
}

// Accepts: hex, rgb(), rgba(), hsl(), hsla(), CSS vars, named keywords
const COLOR_PATTERN = /^(#[0-9a-fA-F]{3,8}|rgb\(|rgba\(|hsl\(|hsla\(|oklch\(|lch\(|lab\(|var\(--)/;

const CSS_COLOR_KEYWORDS = new Set([
  'transparent',
  'currentcolor',
  'inherit',
  'initial',
  'unset',
  'revert',
  'black',
  'white',
  'red',
  'green',
  'blue',
  'yellow',
  'orange',
  'purple',
  'pink',
  'gray',
  'grey',
]);

function isValidColor(value: string): boolean {
  return COLOR_PATTERN.test(value) || CSS_COLOR_KEYWORDS.has(value.toLowerCase());
}

// Number (with optional decimal) followed by a CSS length/time unit, or bare 0
const DIMENSION_PATTERN =
  /^-?(\d+\.?\d*|\.\d+)(px|em|rem|%|vw|vh|vmin|vmax|ch|ex|fr|pt|pc|cm|mm|in|lh|rlh|svh|svw|dvh|dvw|cqi|cqb|cqw|cqh|ms|s)$/;

function isValidDimension(value: string): boolean {
  return value === '0' || DIMENSION_PATTERN.test(value);
}

// ---------------------------------------------------------------------------
// Document traversal
// ---------------------------------------------------------------------------

/**
 * Walks every token in a DTCG document, calling `visitor` for each one.
 *
 * @param doc           The DTCG document (or sub-group) to walk.
 * @param visitor       Called with `(token, dotPath, resolvedType)` for each token.
 * @param inheritedType The `$type` inherited from a parent group (if any).
 * @param currentPath   Internal recursion parameter — leave at default (`''`).
 */
export function walkTokens(
  doc: DTCGDocument,
  visitor: (token: DTCGToken, path: string, resolvedType: DTCGTokenType | undefined) => void,
  inheritedType?: DTCGTokenType,
  currentPath = ''
): void {
  for (const [key, value] of Object.entries(doc)) {
    if (isDTCGReservedKey(key)) continue;

    const childPath = currentPath ? `${currentPath}.${key}` : key;

    if (isDTCGToken(value)) {
      const resolvedType = (value.$type as DTCGTokenType | undefined) ?? inheritedType;
      visitor(value, childPath, resolvedType);
    } else if (isDTCGGroup(value)) {
      const groupType = (value.$type as DTCGTokenType | undefined) ?? inheritedType;
      walkTokens(value as DTCGDocument, visitor, groupType, childPath);
    }
  }
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * Converts a dot-separated token path to a CSS custom property name.
 *
 * @example `pathToCSSVar('color.brand.primary')` → `'--color-brand-primary'`
 */
export function pathToCSSVar(path: string): string {
  return '--' + path.replace(/\./g, '-');
}

/**
 * Converts a CSS custom property name to a dot-separated DTCG token path.
 *
 * @example `cssVarToPath('--color-brand-primary')` → `'color.brand.primary'`
 */
export function cssVarToPath(cssVar: string): string {
  return cssVar.replace(/^--/, '').replace(/-/g, '.');
}

/**
 * Converts a CSS variable name from a .pen file (e.g. `$--primary-color`)
 * to a DTCG-compatible path segment (e.g. `primary-color`).
 */
export function penVarToPath(penVar: string): string {
  return penVar.replace(/^\$?--/, '');
}
