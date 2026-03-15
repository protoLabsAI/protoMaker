/**
 * jsx-serializer.ts
 *
 * Converts PenNode layout trees into JSX source code strings.
 *
 *  - Frames   → <div> with inline CSS flexbox styles
 *  - Groups   → <div> container (no layout)
 *  - Text     → <span> with typography styles
 *  - IconFont → Lucide React component (e.g. <Home size={24} />)
 *  - Rectangle/Ellipse → <div> / <div style={{ borderRadius: '50%' }}>
 *  - Ref      → placeholder comment
 *  - Others   → skipped (null)
 */

import { extractNodeStyles, stylesToReactObject } from './css-extractor.js';
import { toLucideIconName } from './import-generator.js';

// ============================================================================
// Minimal local types (structural match to pen.ts PenNode family)
// ============================================================================

interface FillLocal {
  type: string;
  color?: string;
  opacity?: number;
  gradientType?: string;
  stops?: Array<{ position: number; color: string }>;
  imageRef?: string;
}

interface StrokeLocal {
  color: string;
  width: number;
  opacity?: number;
}

interface NodeBase {
  id: string;
  name?: string;
  visible?: boolean;
  opacity?: number;
}

export interface FrameNode extends NodeBase {
  type: 'frame';
  children: PenNodeLocal[];
  fills?: FillLocal[];
  strokes?: StrokeLocal[];
  cornerRadius?: number;
  layoutMode?: 'none' | 'horizontal' | 'vertical';
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  itemSpacing?: number;
  clipsContent?: boolean;
  reusable?: boolean;
}

export interface GroupNode extends NodeBase {
  type: 'group';
  children: PenNodeLocal[];
}

export interface TextNode extends NodeBase {
  type: 'text';
  content: string;
  fontSize: number;
  fontFamily: string;
  fontWeight?: number | string;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  fills?: FillLocal[];
}

export interface IconFontNode extends NodeBase {
  type: 'icon-font';
  character: string;
  fontFamily: string;
  fontSize: number;
  fills?: FillLocal[];
}

export interface RectangleNode extends NodeBase {
  type: 'rectangle';
  width: number;
  height: number;
  fills?: FillLocal[];
  strokes?: StrokeLocal[];
  cornerRadius?: number;
}

export interface EllipseNode extends NodeBase {
  type: 'ellipse';
  width: number;
  height: number;
  fills?: FillLocal[];
  strokes?: StrokeLocal[];
}

export interface RefNode extends NodeBase {
  type: 'ref';
  refId: string;
}

export interface PathNode extends NodeBase {
  type: 'path';
  pathData: string;
  fills?: FillLocal[];
  strokes?: StrokeLocal[];
}

export type PenNodeLocal =
  | FrameNode
  | GroupNode
  | TextNode
  | IconFontNode
  | RectangleNode
  | EllipseNode
  | RefNode
  | PathNode;

// ============================================================================
// Serialization Context
// ============================================================================

export interface SerializeContext {
  /** Current indentation depth. */
  depth: number;
  /** CSS strategy in use. */
  cssStrategy?: 'inline' | 'css-modules' | 'tailwind';
  /** Component name (for aria-label fallbacks). */
  componentName?: string;
}

// ============================================================================
// Utilities
// ============================================================================

function indent(depth: number): string {
  return '  '.repeat(depth);
}

function sanitizeText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;');
}

// ============================================================================
// Node Serializers
// ============================================================================

function serializeFrame(node: FrameNode, ctx: SerializeContext): string {
  const ind = indent(ctx.depth);

  // Skip invisible nodes
  if (node.visible === false) return `${ind}{/* hidden: ${node.name ?? node.id} */}`;

  const styles = extractNodeStyles(node as Parameters<typeof extractNodeStyles>[0]);
  const styleAttr = stylesToReactObject(styles);
  const label = node.name ? ` aria-label="${node.name}"` : '';
  const childCtx: SerializeContext = { ...ctx, depth: ctx.depth + 1 };

  const children = (node.children ?? [])
    .map((c) => serializeNode(c, childCtx))
    .filter(Boolean)
    .join('\n');

  if (!children) {
    return `${ind}<div style={${styleAttr}}${label} />`;
  }

  return [`${ind}<div style={${styleAttr}}${label}>`, children, `${ind}</div>`].join('\n');
}

function serializeGroup(node: GroupNode, ctx: SerializeContext): string {
  const ind = indent(ctx.depth);
  if (node.visible === false) return `${ind}{/* hidden: ${node.name ?? node.id} */}`;

  const childCtx: SerializeContext = { ...ctx, depth: ctx.depth + 1 };
  const children = (node.children ?? [])
    .map((c) => serializeNode(c, childCtx))
    .filter(Boolean)
    .join('\n');

  if (!children) return `${ind}<div />`;

  return [`${ind}<div>`, children, `${ind}</div>`].join('\n');
}

function serializeText(node: TextNode, ctx: SerializeContext): string {
  const ind = indent(ctx.depth);
  if (node.visible === false) return `${ind}{/* hidden: ${node.name ?? node.id} */}`;

  const styles: Record<string, string> = {};
  if (node.fontSize) styles['fontSize'] = `${node.fontSize}px`;
  if (node.fontFamily) styles['fontFamily'] = node.fontFamily;
  if (node.fontWeight) styles['fontWeight'] = String(node.fontWeight);
  if (node.textAlign) styles['textAlign'] = node.textAlign;
  if (node.opacity !== undefined && node.opacity < 1) {
    styles['opacity'] = String(node.opacity);
  }

  // Text color from first fill
  const firstFill = (node.fills ?? [])[0];
  if (firstFill?.type === 'solid' && firstFill.color) {
    const color = firstFill.color.startsWith('$')
      ? `var(${firstFill.color.slice(1)})`
      : firstFill.color;
    styles['color'] = color;
  }

  const styleEntries = Object.entries(styles)
    .map(([k, v]) => `${k}: '${v}'`)
    .join(', ');
  // style={} takes a JS expression — so `{ key: 'val' }` (single braces as object literal)
  const styleAttr = styleEntries ? `{ ${styleEntries} }` : '{}';

  const content = sanitizeText(node.content ?? '');
  return `${ind}<span style={${styleAttr}}>${content}</span>`;
}

function serializeIconFont(node: IconFontNode, ctx: SerializeContext): string {
  const ind = indent(ctx.depth);
  if (node.visible === false) return `${ind}{/* hidden: ${node.name ?? node.id} */}`;

  const iconName = toLucideIconName(node as Parameters<typeof toLucideIconName>[0]);
  const size = node.fontSize ?? 24;

  const colorFill = (node.fills ?? [])[0];
  let colorAttr = '';
  if (colorFill?.type === 'solid' && colorFill.color) {
    const color = colorFill.color.startsWith('$')
      ? `var(${colorFill.color.slice(1)})`
      : colorFill.color;
    colorAttr = ` color="${color}"`;
  }

  return `${ind}<${iconName} size={${size}}${colorAttr} aria-hidden="true" />`;
}

function serializeRectangle(node: RectangleNode, ctx: SerializeContext): string {
  const ind = indent(ctx.depth);
  if (node.visible === false) return `${ind}{/* hidden: ${node.name ?? node.id} */}`;

  const styles = extractNodeStyles(node as Parameters<typeof extractNodeStyles>[0]);
  if (node.width) styles['width'] = `${node.width}px`;
  if (node.height) styles['height'] = `${node.height}px`;

  const styleAttr = stylesToReactObject(styles);
  const label = node.name ? ` aria-label="${node.name}"` : '';
  return `${ind}<div role="presentation" style={${styleAttr}}${label} />`;
}

function serializeEllipse(node: EllipseNode, ctx: SerializeContext): string {
  const ind = indent(ctx.depth);
  if (node.visible === false) return `${ind}{/* hidden: ${node.name ?? node.id} */}`;

  const styles = extractNodeStyles(node as Parameters<typeof extractNodeStyles>[0]);
  styles['borderRadius'] = '50%';
  if (node.width) styles['width'] = `${node.width}px`;
  if (node.height) styles['height'] = `${node.height}px`;

  const styleAttr = stylesToReactObject(styles);
  const label = node.name ? ` aria-label="${node.name}"` : '';
  return `${ind}<div role="presentation" style={${styleAttr}}${label} />`;
}

function serializeRef(node: RefNode, ctx: SerializeContext): string {
  const ind = indent(ctx.depth);
  return `${ind}{/* ref: ${node.refId} — resolve and import manually */}`;
}

function serializePath(node: PathNode, ctx: SerializeContext): string {
  const ind = indent(ctx.depth);
  if (node.visible === false) return `${ind}{/* hidden path */}`;

  const fill = (node.fills ?? [])[0];
  const fillAttr =
    fill?.type === 'solid' && fill.color
      ? fill.color.startsWith('$')
        ? `var(${fill.color.slice(1)})`
        : fill.color
      : 'currentColor';

  return [
    `${ind}<svg aria-hidden="true">`,
    `${indent(ctx.depth + 1)}<path d="${node.pathData}" fill="${fillAttr}" />`,
    `${ind}</svg>`,
  ].join('\n');
}

// ============================================================================
// Main Dispatch
// ============================================================================

/**
 * Convert a PenNode to its JSX string representation.
 * Returns an empty string for unsupported or hidden nodes.
 */
export function serializeNode(node: PenNodeLocal, ctx: SerializeContext): string {
  switch (node.type) {
    case 'frame':
      return serializeFrame(node, ctx);
    case 'group':
      return serializeGroup(node, ctx);
    case 'text':
      return serializeText(node, ctx);
    case 'icon-font':
      return serializeIconFont(node, ctx);
    case 'rectangle':
      return serializeRectangle(node, ctx);
    case 'ellipse':
      return serializeEllipse(node, ctx);
    case 'ref':
      return serializeRef(node, ctx);
    case 'path':
      return serializePath(node, ctx);
    default:
      return '';
  }
}
