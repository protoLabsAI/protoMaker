/**
 * docs-generator.ts
 *
 * Generates structured component documentation metadata from PenDocument
 * frames.  The resulting `ComponentDocEntry` objects can be serialised to JSON
 * and consumed by documentation UIs, static site generators, or design tools.
 *
 * Usage:
 * ```ts
 * import { generateAllComponentDocs } from './docs-generator.js';
 * import { parsePenFile } from '@design-system/pen';
 * import fs from 'node:fs';
 *
 * const doc = parsePenFile(fs.readFileSync('design.pen', 'utf-8'));
 * const docs = generateAllComponentDocs(doc);
 * console.log(JSON.stringify(docs, null, 2));
 * ```
 */

import { extractProps } from './prop-extractor.js';
import { extractCSSVariables } from './css-extractor.js';
import {
  findReusableComponents,
  toComponentName,
  type PenDocument,
  type PenFrame,
} from './react-generator.js';
import type { PropDefinition } from './prop-extractor.js';

// ============================================================================
// Public Types
// ============================================================================

/** A single component's complete documentation entry. */
export interface ComponentDocEntry {
  /** PascalCase component name, e.g. 'Button'. */
  componentName: string;
  /** Optional human-readable description. */
  description?: string;
  /** Visual / organisational category, e.g. 'Forms'. */
  category?: string;
  /** All documented props. */
  props: PropDocEntry[];
  /** CSS custom properties referenced by the component. */
  designTokens: DesignTokenRef[];
  /** Accessibility guidance derived from component name and type. */
  accessibilityNotes: string[];
  /** Names of related components in the design system. */
  relatedComponents: string[];
  /** Source frame ID in the PenDocument (for round-tripping). */
  sourceFrameId?: string;
}

/** Documentation for a single component prop. */
export interface PropDocEntry {
  /** camelCase prop name. */
  name: string;
  /** TypeScript type string, e.g. 'string'. */
  type: string;
  /** Whether the prop must be provided. */
  required: boolean;
  /** Default value as a string representation. */
  defaultValue?: string;
  /** Human-readable description. */
  description?: string;
  /** CSS variable this prop overrides, e.g. '--primary'. */
  cssVariable?: string;
}

/** A design token referenced by the component. */
export interface DesignTokenRef {
  /** CSS custom property name, e.g. '--primary'. */
  variable: string;
  /** Human-readable label derived from the variable name. */
  label: string;
  /** Token category for grouping. */
  category: 'color' | 'spacing' | 'typography' | 'other';
  /** Optional description. */
  description?: string;
}

// ============================================================================
// Options
// ============================================================================

export interface DocsGeneratorOptions {
  /** Include auto-inferred accessibility notes. Defaults to `true`. */
  includeA11yNotes?: boolean;
  /** Include related-component detection (name-similarity heuristic). Defaults to `true`. */
  inferRelated?: boolean;
}

// ============================================================================
// Internals
// ============================================================================

/** Convert a CSS variable name to a human-readable label. */
function cssVarToLabel(cssVar: string): string {
  // '--primary-color' → 'Primary Color'
  return cssVar
    .replace(/^-+/, '')
    .split('-')
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

/** Classify a CSS variable into a design token category. */
function classifyToken(cssVar: string): DesignTokenRef['category'] {
  const lower = cssVar.toLowerCase();
  if (
    lower.includes('color') ||
    lower.includes('bg') ||
    lower.includes('background') ||
    lower.includes('text') ||
    lower.includes('border') ||
    lower.includes('shadow') ||
    lower.includes('primary') ||
    lower.includes('secondary') ||
    lower.includes('accent') ||
    lower.includes('destructive')
  ) {
    return 'color';
  }
  if (
    lower.includes('spacing') ||
    lower.includes('gap') ||
    lower.includes('padding') ||
    lower.includes('margin') ||
    lower.includes('radius') ||
    lower.includes('size')
  ) {
    return 'spacing';
  }
  if (
    lower.includes('font') ||
    lower.includes('weight') ||
    lower.includes('line-height') ||
    lower.includes('tracking') ||
    lower.includes('leading')
  ) {
    return 'typography';
  }
  return 'other';
}

/** Infer accessibility notes based on component name patterns. */
function inferA11yNotes(componentName: string): string[] {
  const name = componentName.toLowerCase();
  const notes: string[] = [];

  if (name.includes('button')) {
    notes.push('Use a descriptive label that communicates the action to screen readers.');
    notes.push('Ensure keyboard focus styles are visible (min 3:1 contrast ratio).');
  }
  if (name.includes('input') || name.includes('field') || name.includes('textarea')) {
    notes.push('Associate with a visible <label> element using htmlFor/id.');
    notes.push('Provide error messages via aria-describedby.');
  }
  if (name.includes('select') || name.includes('dropdown') || name.includes('combobox')) {
    notes.push('Use native <select> or ARIA combobox pattern for keyboard support.');
    notes.push('Announce selected value changes to screen readers.');
  }
  if (name.includes('modal') || name.includes('dialog')) {
    notes.push('Trap focus within the dialog when open (focus-trap pattern).');
    notes.push('Return focus to the trigger element when closed.');
    notes.push('Add role="dialog" and aria-modal="true".');
  }
  if (name.includes('image') || name.includes('avatar') || name.includes('icon')) {
    notes.push('Provide descriptive alt text for informative images.');
    notes.push('Add aria-hidden="true" on purely decorative icons.');
  }
  if (name.includes('nav') || name.includes('menu')) {
    notes.push('Use <nav> landmark with aria-label for navigation regions.');
    notes.push('Indicate current page/item with aria-current="page".');
  }
  if (name.includes('table') || name.includes('grid')) {
    notes.push('Use <th scope="col|row"> for header cells.');
    notes.push('Provide a <caption> or aria-label describing the table contents.');
  }
  if (name.includes('card')) {
    notes.push('Use appropriate heading level for the card title.');
    notes.push(
      'If the whole card is interactive, use a single focusable element with a full description.'
    );
  }
  if (name.includes('badge') || name.includes('tag') || name.includes('chip')) {
    notes.push('Ensure status/label text is conveyed to screen readers.');
    notes.push('If interactive, use <button> or provide keyboard handlers.');
  }

  if (notes.length === 0) {
    notes.push('Ensure interactive elements are keyboard-focusable and operable.');
    notes.push('Maintain a minimum 4.5:1 contrast ratio for text (WCAG AA).');
  }

  return notes;
}

/** Heuristic: find components with similar name prefix (potential "related"). */
function inferRelatedComponents(componentName: string, allNames: string[]): string[] {
  const target = componentName.toLowerCase();
  return allNames.filter((name) => {
    if (name === componentName) return false;
    const lower = name.toLowerCase();
    for (let len = 4; len <= Math.min(target.length, lower.length); len++) {
      if (target.startsWith(lower.slice(0, len)) || lower.startsWith(target.slice(0, len))) {
        return true;
      }
    }
    return false;
  });
}

// ============================================================================
// Core Generator
// ============================================================================

/**
 * Generate a `ComponentDocEntry` for a single reusable PenFrame.
 *
 * @param frame             The reusable PenFrame to document.
 * @param doc               The parent PenDocument.
 * @param allComponentNames Names of all components (for related-component heuristic).
 * @param options           Generator configuration.
 */
export function generateComponentDoc(
  frame: PenFrame,
  doc: PenDocument,
  allComponentNames: string[] = [],
  options: DocsGeneratorOptions = {}
): ComponentDocEntry {
  const { includeA11yNotes = true, inferRelated = true } = options;
  const componentName = toComponentName(frame.name ?? frame.id);

  // ── Props ──────────────────────────────────────────────────────────────────
  const rawProps = extractProps(
    frame as Parameters<typeof extractProps>[0],
    doc as Parameters<typeof extractProps>[1]
  );

  const props: PropDocEntry[] = rawProps.map((p: PropDefinition) => ({
    name: p.propName,
    type: p.tsType,
    required: p.required,
    description: `Overrides CSS variable \`${p.cssVariable}\``,
    cssVariable: p.cssVariable,
  }));

  // Always document the children prop.
  props.push({
    name: 'children',
    type: 'React.ReactNode',
    required: false,
    description: 'Child content rendered inside the component.',
  });

  // ── Design tokens ──────────────────────────────────────────────────────────
  const cssVars = extractCSSVariables(frame as Parameters<typeof extractCSSVariables>[0]);
  const designTokens: DesignTokenRef[] = cssVars.map((cssVar) => ({
    variable: cssVar,
    label: cssVarToLabel(cssVar),
    category: classifyToken(cssVar),
  }));

  // ── Accessibility ──────────────────────────────────────────────────────────
  const accessibilityNotes = includeA11yNotes ? inferA11yNotes(componentName) : [];

  // ── Related components ─────────────────────────────────────────────────────
  const relatedComponents = inferRelated
    ? inferRelatedComponents(componentName, allComponentNames)
    : [];

  return {
    componentName,
    sourceFrameId: frame.id,
    props,
    designTokens,
    accessibilityNotes,
    relatedComponents,
  };
}

/**
 * Generate documentation for every reusable component in a PenDocument.
 *
 * @param doc     The PenDocument to document.
 * @param options Generator configuration.
 */
export function generateAllComponentDocs(
  doc: PenDocument,
  options: DocsGeneratorOptions = {}
): ComponentDocEntry[] {
  const frames = findReusableComponents(doc);
  const allNames = frames.map((f) => toComponentName(f.name ?? f.id));
  return frames.map((frame) => generateComponentDoc(frame, doc, allNames, options));
}
