/**
 * react-generator.ts
 *
 * Main pen-to-React pipeline.
 *
 * Takes a PenDocument AST, identifies component boundaries (frames marked
 * reusable: true), and generates React .tsx source files for each one.
 *
 * Usage:
 * ```ts
 * import { generateFromDocument } from './react-generator.js';
 *
 * const files = generateFromDocument(myPenDocument);
 * for (const file of files) {
 *   fs.writeFileSync(file.filename, file.content, 'utf-8');
 * }
 * ```
 */

import { extractNodeStyles, extractCSSVariables, stylesToReactObject } from './css-extractor.js';
import {
  extractProps,
  generatePropInterface,
  generatePropStyleExpression,
} from './prop-extractor.js';
import { collectRequiredImports, generateImportBlock } from './import-generator.js';
import { serializeNode, type PenNodeLocal, type SerializeContext } from './jsx-serializer.js';

// ============================================================================
// Core PenDocument Types (exported for consumers of this package)
// ============================================================================

export interface PenFill {
  type: 'solid' | 'gradient' | 'image';
  color?: string;
  opacity?: number;
  gradientType?: 'linear' | 'radial';
  stops?: Array<{ position: number; color: string }>;
  imageRef?: string;
}

export interface PenStroke {
  color: string;
  width: number;
  opacity?: number;
}

export interface PenNodeBase {
  id: string;
  name?: string;
  visible?: boolean;
  opacity?: number;
  reusable?: boolean;
}

export interface PenFrame extends PenNodeBase {
  type: 'frame';
  children: PenNode[];
  fills?: PenFill[];
  strokes?: PenStroke[];
  cornerRadius?: number;
  layoutMode?: 'none' | 'horizontal' | 'vertical';
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  itemSpacing?: number;
  clipsContent?: boolean;
}

export interface PenGroup extends PenNodeBase {
  type: 'group';
  children: PenNode[];
}

export interface PenText extends PenNodeBase {
  type: 'text';
  content: string;
  fontSize: number;
  fontFamily: string;
  fontWeight?: number | string;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  fills?: PenFill[];
}

export interface PenIconFont extends PenNodeBase {
  type: 'icon-font';
  character: string;
  fontFamily: string;
  fontSize: number;
  fills?: PenFill[];
}

export interface PenRectangle extends PenNodeBase {
  type: 'rectangle';
  width: number;
  height: number;
  fills?: PenFill[];
  strokes?: PenStroke[];
  cornerRadius?: number;
}

export interface PenEllipse extends PenNodeBase {
  type: 'ellipse';
  width: number;
  height: number;
  fills?: PenFill[];
  strokes?: PenStroke[];
}

export interface PenRef extends PenNodeBase {
  type: 'ref';
  refId: string;
  overrides?: Record<string, unknown>;
}

export interface PenPath extends PenNodeBase {
  type: 'path';
  pathData: string;
  fills?: PenFill[];
  strokes?: PenStroke[];
}

export type PenNode =
  | PenFrame
  | PenGroup
  | PenText
  | PenIconFont
  | PenRectangle
  | PenEllipse
  | PenRef
  | PenPath;

export interface PenVariable {
  id: string;
  name: string;
  type: 'color' | 'number' | 'string' | 'boolean';
  values: Record<string, unknown>;
}

export interface PenTheme {
  id: string;
  name: string;
}

/** Root design document. */
export interface PenDocument {
  version: string;
  name?: string;
  themes?: PenTheme[];
  variables?: PenVariable[];
  children: PenNode[];
}

// ============================================================================
// Generator Configuration
// ============================================================================

export interface GeneratorOptions {
  /** CSS output strategy. Defaults to 'inline'. */
  cssStrategy?: 'inline' | 'css-modules' | 'tailwind';
  /** Export style. Defaults to 'named'. */
  exportStyle?: 'named' | 'default';
}

// ============================================================================
// Generator Output
// ============================================================================

/** A single generated React component file. */
export interface GeneratedFile {
  /** Filename, e.g. 'Button.tsx'. */
  filename: string;
  /** PascalCase component name, e.g. 'Button'. */
  componentName: string;
  /** Complete .tsx source code ready to write to disk. */
  content: string;
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Convert an arbitrary design name to a valid PascalCase React component name.
 *
 * Examples:
 *   'my button'   → 'MyButton'
 *   'card-header' → 'CardHeader'
 *   'Icon/Close'  → 'IconClose'
 */
export function toComponentName(name: string): string {
  return (
    name
      .replace(/[^a-zA-Z0-9\s_/-]/g, '')
      .split(/[\s_/-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join('') || 'Component'
  );
}

function isPenFrame(node: PenNode): node is PenFrame {
  return node.type === 'frame';
}

function isPenGroup(node: PenNode): node is PenGroup {
  return node.type === 'group';
}

// ============================================================================
// Component Discovery
// ============================================================================

/**
 * Recursively find all frame nodes with `reusable: true` in the document tree.
 * These are the component boundaries — each becomes a separate .tsx file.
 */
export function findReusableComponents(doc: PenDocument): PenFrame[] {
  const components: PenFrame[] = [];

  function walk(nodes: PenNode[]): void {
    for (const node of nodes) {
      if (isPenFrame(node) && node.reusable) {
        components.push(node);
        // Don't recurse further — nested reusable frames become separate components.
        continue;
      }
      // Recurse into non-reusable containers.
      if (isPenFrame(node) || isPenGroup(node)) {
        walk(node.children ?? []);
      }
    }
  }

  walk(doc.children);
  return components;
}

// ============================================================================
// Component File Assembly
// ============================================================================

function buildComponentSource(
  componentName: string,
  importBlock: string,
  propInterface: string,
  propsType: string,
  propStyleExpr: string,
  jsxBody: string,
  frameStyles: Record<string, string>,
  options: GeneratorOptions
): string {
  const hasInlineStyle =
    options.cssStrategy !== 'css-modules' && Object.keys(frameStyles).length > 0;

  // Merge frame base styles with prop-driven CSS variable overrides.
  // `stylesToReactObject` returns `{ key: 'value', ... }` (JS object literal).
  // `generatePropStyleExpression` returns `{ '--var': props.x, ... }`.
  // We spread both into a single object and cast once for React.
  const baseStyleExpr = stylesToReactObject(frameStyles);

  // Build the final style expression string (what goes inside style={...})
  let styleExprContents: string;
  if (hasInlineStyle && propStyleExpr !== '{}') {
    styleExprContents = `{ ...${baseStyleExpr}, ...${propStyleExpr} } as React.CSSProperties`;
  } else if (hasInlineStyle) {
    styleExprContents = `${baseStyleExpr} as React.CSSProperties`;
  } else if (propStyleExpr !== '{}') {
    styleExprContents = `${propStyleExpr} as React.CSSProperties`;
  } else {
    styleExprContents = '{}';
  }

  const isDefault = options.exportStyle === 'default';
  const fnDecl = isDefault
    ? `const ${componentName}: React.FC<${propsType}>`
    : `export const ${componentName}: React.FC<${propsType}>`;

  const lines: string[] = [
    '// Auto-generated by @design-system/codegen — do not edit manually.',
    importBlock,
    '',
    propInterface,
    '',
    `${fnDecl} = (props) => {`,
    `  return (`,
  ];

  // Wrap serialised JSX with a top-level div that carries style + children slot.
  lines.push(`    <div style={${styleExprContents}}>`);
  for (const line of jsxBody.split('\n')) {
    lines.push(`      ${line}`);
  }
  lines.push(`      {props.children}`, `    </div>`, `  );`, `};`, ``);

  if (isDefault) {
    lines.push(`export default ${componentName};`, '');
  }

  return lines.join('\n');
}

// ============================================================================
// Single Component Generator
// ============================================================================

/**
 * Generate a complete React .tsx source file from a reusable PenFrame.
 *
 * @param frame    The frame node (must have `reusable: true`).
 * @param doc      The parent PenDocument (used for variable resolution).
 * @param options  Generator configuration.
 */
export function generateComponent(
  frame: PenFrame,
  doc: PenDocument,
  options: GeneratorOptions = {}
): GeneratedFile {
  const componentName = toComponentName(frame.name ?? frame.id);
  const filename = `${componentName}.tsx`;

  // --- CSS / Styles ---
  const frameStyles = extractNodeStyles(frame as Parameters<typeof extractNodeStyles>[0]);
  const cssVars = extractCSSVariables(frame as Parameters<typeof extractCSSVariables>[0]);

  // --- Props ---
  const props = extractProps(
    frame as Parameters<typeof extractProps>[0],
    doc as Parameters<typeof extractProps>[1]
  );
  const propInterface = generatePropInterface(componentName, props, cssVars);
  const propStyleExpr = generatePropStyleExpression(props);
  const propsType = `${componentName}Props`;

  // --- Imports ---
  const importSpec = collectRequiredImports(
    frame as Parameters<typeof collectRequiredImports>[0],
    doc,
    options.cssStrategy ?? 'inline',
    componentName
  );
  const importBlock = generateImportBlock(importSpec);

  // --- JSX Body (children of the frame, not the frame itself) ---
  const ctx: SerializeContext = {
    depth: 0,
    cssStrategy: options.cssStrategy ?? 'inline',
    componentName,
  };
  const childrenJSX = (frame.children ?? [])
    .map((child) => serializeNode(child as PenNodeLocal, { ...ctx, depth: 1 }))
    .filter(Boolean)
    .join('\n');

  // --- Assemble source ---
  const content = buildComponentSource(
    componentName,
    importBlock,
    propInterface,
    propsType,
    propStyleExpr,
    childrenJSX,
    frameStyles,
    options
  );

  return { filename, componentName, content };
}

// ============================================================================
// Document-Level Generator
// ============================================================================

/**
 * Generate React .tsx files for every reusable component in a PenDocument.
 *
 * @param doc     The parsed PenDocument.
 * @param options Generator configuration.
 * @returns       Array of generated files (one per reusable component).
 *
 * @example
 * ```ts
 * import { parsePenFile } from '@design-system/pen';
 * import { generateFromDocument } from '@design-system/codegen';
 * import fs from 'node:fs';
 *
 * const doc = parsePenFile(fs.readFileSync('design.pen', 'utf-8'));
 * const files = generateFromDocument(doc);
 * for (const { filename, content } of files) {
 *   fs.writeFileSync(`src/components/${filename}`, content);
 * }
 * ```
 */
export function generateFromDocument(
  doc: PenDocument,
  options: GeneratorOptions = {}
): GeneratedFile[] {
  const components = findReusableComponents(doc);
  return components.map((frame) => generateComponent(frame, doc, options));
}
