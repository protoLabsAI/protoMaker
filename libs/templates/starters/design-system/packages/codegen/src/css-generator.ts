/**
 * css-generator.ts
 *
 * Generates plain CSS files from PenDocument / PenFrame nodes.
 *
 * - One .css file per reusable frame.
 * - A :root {} block is emitted for CSS custom properties from document variables.
 * - Child nodes receive BEM-style class names (.component-name__child-name).
 * - $--variable references in fills/strokes become var(--variable) values.
 *
 * Usage:
 * ```ts
 * import { generateCSSFromDocument } from './css-generator.js';
 *
 * const files = generateCSSFromDocument(myPenDocument);
 * for (const file of files) {
 *   fs.writeFileSync(file.filename, file.content, 'utf-8');
 * }
 * ```
 */

import { extractNodeStyles } from './css-extractor.js';

// ============================================================================
// Minimal local types (structural match to pen.ts PenNode family)
// ============================================================================

interface LocalFill {
  type: 'solid' | 'gradient' | 'image';
  color?: string;
  opacity?: number;
  gradientType?: 'linear' | 'radial';
  stops?: Array<{ position: number; color: string }>;
  imageRef?: string;
}

interface LocalStroke {
  color: string;
  width: number;
  opacity?: number;
}

interface LocalNodeBase {
  id: string;
  name?: string;
  visible?: boolean;
  opacity?: number;
  reusable?: boolean;
}

interface LocalFrame extends LocalNodeBase {
  type: 'frame';
  children: LocalNode[];
  fills?: LocalFill[];
  strokes?: LocalStroke[];
  cornerRadius?: number;
  layoutMode?: 'none' | 'horizontal' | 'vertical';
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  itemSpacing?: number;
  clipsContent?: boolean;
}

interface LocalGroup extends LocalNodeBase {
  type: 'group';
  children: LocalNode[];
}

interface LocalText extends LocalNodeBase {
  type: 'text';
  content: string;
  fontSize: number;
  fontFamily: string;
  fontWeight?: number | string;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  fills?: LocalFill[];
}

interface LocalIconFont extends LocalNodeBase {
  type: 'icon-font';
  character: string;
  fontFamily: string;
  fontSize: number;
  fills?: LocalFill[];
}

interface LocalRectangle extends LocalNodeBase {
  type: 'rectangle';
  width: number;
  height: number;
  fills?: LocalFill[];
  strokes?: LocalStroke[];
  cornerRadius?: number;
}

interface LocalEllipse extends LocalNodeBase {
  type: 'ellipse';
  width: number;
  height: number;
  fills?: LocalFill[];
  strokes?: LocalStroke[];
}

interface LocalRef extends LocalNodeBase {
  type: 'ref';
  refId: string;
}

interface LocalPath extends LocalNodeBase {
  type: 'path';
  pathData: string;
  fills?: LocalFill[];
  strokes?: LocalStroke[];
}

type LocalNode =
  | LocalFrame
  | LocalGroup
  | LocalText
  | LocalIconFont
  | LocalRectangle
  | LocalEllipse
  | LocalRef
  | LocalPath;

interface LocalVariable {
  id: string;
  name: string;
  type: 'color' | 'number' | 'string' | 'boolean';
  values: Record<string, unknown>;
}

interface LocalDocument {
  variables?: LocalVariable[];
  children: LocalNode[];
}

// ============================================================================
// Generator Output
// ============================================================================

/** A single generated CSS file. */
export interface GeneratedCSSFile {
  /** Filename, e.g. 'my-button.css'. */
  filename: string;
  /** kebab-case component class name, e.g. 'my-button'. */
  className: string;
  /** Complete CSS source code ready to write to disk. */
  content: string;
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Convert an arbitrary design name to a valid kebab-case CSS class name.
 *
 * Examples:
 *   'my button'   → 'my-button'
 *   'CardHeader'  → 'card-header'
 *   'Icon/Close'  → 'icon-close'
 */
export function toCSSClassName(name: string): string {
  return (
    name
      .replace(/[^a-zA-Z0-9\s_/-]/g, '')
      // Insert hyphen between camelCase transitions
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .split(/[\s_/-]+/)
      .filter(Boolean)
      .map((part) => part.toLowerCase())
      .join('-') || 'component'
  );
}

// ============================================================================
// CSS Variable Generation
// ============================================================================

/**
 * Generate a :root {} block declaring CSS custom properties from document
 * variables.  Each variable uses its `default` value, or the first available
 * value in its `values` map if no `default` key exists.
 *
 * @example
 * generateRootVariables([
 *   { id: '1', name: '--primary', type: 'color', values: { default: '#007bff' } }
 * ])
 * // → ':root {\n  --primary: #007bff;\n}\n'
 */
export function generateRootVariables(variables: LocalVariable[]): string {
  if (!variables || variables.length === 0) return '';

  const lines: string[] = [':root {'];

  for (const v of variables) {
    const varName = v.name.startsWith('--') ? v.name : `--${v.name}`;
    const defaultValue = v.values['default'];
    const firstKey = Object.keys(v.values)[0];
    const value =
      defaultValue !== undefined
        ? defaultValue
        : firstKey !== undefined
          ? v.values[firstKey]
          : undefined;

    if (value != null && value !== '') {
      lines.push(`  ${varName}: ${String(value)};`);
    }
  }

  lines.push('}', '');
  return lines.join('\n');
}

// ============================================================================
// Per-node CSS rule generation
// ============================================================================

function resolveColor(color: string): string {
  return color.startsWith('$') ? `var(${color.slice(1)})` : color;
}

function stylesForTextNode(node: LocalText): Record<string, string> {
  const styles: Record<string, string> = {};

  if (node.fontSize) styles['font-size'] = `${node.fontSize}px`;
  if (node.fontFamily) styles['font-family'] = node.fontFamily;
  if (node.fontWeight !== undefined) styles['font-weight'] = String(node.fontWeight);
  if (node.textAlign) styles['text-align'] = node.textAlign;
  if (node.opacity !== undefined && node.opacity < 1) {
    styles['opacity'] = String(node.opacity);
  }

  const fill = (node.fills ?? [])[0];
  if (fill?.type === 'solid' && fill.color) {
    styles['color'] = resolveColor(fill.color);
  }

  return styles;
}

function stylesForIconFont(node: LocalIconFont): Record<string, string> {
  const styles: Record<string, string> = {};
  styles['font-size'] = `${node.fontSize}px`;
  styles['font-family'] = node.fontFamily;

  const fill = (node.fills ?? [])[0];
  if (fill?.type === 'solid' && fill.color) {
    styles['color'] = resolveColor(fill.color);
  }

  return styles;
}

function stylesForNode(node: LocalNode): Record<string, string> {
  switch (node.type) {
    case 'frame':
    case 'rectangle':
    case 'ellipse':
      return extractNodeStyles(node as Parameters<typeof extractNodeStyles>[0]);
    case 'text':
      return stylesForTextNode(node);
    case 'icon-font':
      return stylesForIconFont(node);
    case 'group':
    case 'ref':
    case 'path':
      return {};
  }
}

function renderCSSRule(selector: string, styles: Record<string, string>): string[] {
  if (Object.keys(styles).length === 0) return [];
  const lines: string[] = [`${selector} {`];
  for (const [prop, value] of Object.entries(styles)) {
    lines.push(`  ${prop}: ${value};`);
  }
  lines.push('}', '');
  return lines;
}

function collectChildRules(node: LocalNode, parentSelector: string): string[] {
  if (node.visible === false) return [];

  const childName = toCSSClassName(node.name ?? node.id);
  const selector = `${parentSelector}__${childName}`;
  const styles = stylesForNode(node);
  const lines: string[] = [...renderCSSRule(selector, styles)];

  if (node.type === 'frame' || node.type === 'group') {
    for (const child of node.children ?? []) {
      lines.push(...collectChildRules(child, selector));
    }
  }

  return lines;
}

// ============================================================================
// Frame CSS Generator
// ============================================================================

/**
 * Generate a complete CSS file for a single reusable PenFrame.
 *
 * @param frame  The frame node (must have `reusable: true`).
 * @param doc    The parent PenDocument (used for :root variable declarations).
 */
export function generateCSSFromFrame(frame: LocalFrame, doc: LocalDocument): GeneratedCSSFile {
  const className = toCSSClassName(frame.name ?? frame.id);
  const filename = `${className}.css`;

  const lines: string[] = [
    '/* Auto-generated by @design-system/codegen — do not edit manually. */',
    '',
  ];

  // :root block for document-level CSS custom properties
  const rootVars = generateRootVariables(doc.variables ?? []);
  if (rootVars) {
    lines.push(rootVars);
  }

  // Root component selector
  const rootStyles = extractNodeStyles(frame as Parameters<typeof extractNodeStyles>[0]);
  lines.push(...renderCSSRule(`.${className}`, rootStyles));

  // BEM child rules
  for (const child of frame.children ?? []) {
    lines.push(...collectChildRules(child, `.${className}`));
  }

  return { filename, className, content: lines.join('\n') };
}

// ============================================================================
// Document-Level CSS Generator
// ============================================================================

/**
 * Generate CSS files for every reusable component in a PenDocument.
 *
 * @param doc     The parsed PenDocument.
 * @returns       Array of generated files (one per reusable component).
 *
 * @example
 * ```ts
 * import { generateCSSFromDocument } from '@design-system/codegen/css-generator';
 *
 * const files = generateCSSFromDocument(doc);
 * for (const { filename, content } of files) {
 *   fs.writeFileSync(`src/styles/${filename}`, content);
 * }
 * ```
 */
export function generateCSSFromDocument(doc: LocalDocument): GeneratedCSSFile[] {
  const components: LocalFrame[] = [];

  function walk(nodes: LocalNode[]): void {
    for (const node of nodes) {
      if (node.type === 'frame' && node.reusable) {
        components.push(node);
        // Don't recurse — nested reusable frames become separate components.
        continue;
      }
      if (node.type === 'frame' || node.type === 'group') {
        walk(node.children ?? []);
      }
    }
  }

  walk(doc.children);
  return components.map((frame) => generateCSSFromFrame(frame, doc));
}
