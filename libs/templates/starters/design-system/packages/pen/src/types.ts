/**
 * .pen file format types (pencil.dev v2.8)
 *
 * Covers all 15 node types in the .pen scene graph format plus helper types
 * for theme resolution, variable lookup, and style conversion.
 *
 * Zero external dependencies — fully self-contained.
 */

// ============================================================================
// Helper Types
// ============================================================================

/**
 * Theme selection context (e.g. { Mode: "Light", Base: "Zinc" })
 */
export interface Theme {
  Mode?: string;
  Base?: string;
  Accent?: string;
  [key: string]: string | undefined;
}

/**
 * Resolved variable map used during rendering
 */
export interface Variables {
  [key: string]: string | number | undefined;
}

/**
 * Visitor function for depth-first node traversal.
 * Return false to skip descending into children.
 */
export type NodeVisitor = (node: PenNode, parent?: PenNode, depth?: number) => void | boolean;

// ============================================================================
// Document-level Variable Definitions
// ============================================================================

/**
 * A single theme-dependent variable value entry
 */
export interface ThemeDependent {
  value: string | number;
  theme: Record<string, string>;
}

/**
 * Design token variable defined at document level
 */
export interface PenVariable {
  type: 'color' | 'number' | 'string';
  value: string | number | ThemeDependent[];
}

// ============================================================================
// Base Node
// ============================================================================

/**
 * Properties common to all node types
 */
export interface BaseNode {
  id: string;
  type: string;
  name?: string;
  x?: number;
  y?: number;
  width?: number | 'fill_container' | 'fit_content' | { fit_content: number };
  height?: number | 'fill_container' | 'fit_content' | { fit_content: number };
  rotation?: number;
  opacity?: number;
  enabled?: boolean;
}

// ============================================================================
// Stroke Types
// ============================================================================

/**
 * Per-side stroke thickness
 */
export interface StrokeThickness {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

/**
 * Stroke descriptor (simple .pen wire format)
 */
export interface Stroke {
  fill?: string;
  thickness?: number | StrokeThickness;
  align?: 'inside' | 'outside' | 'center';
}

// ============================================================================
// Text Style
// ============================================================================

/**
 * Inline text style run
 */
export interface TextStyle {
  text: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string | number;
  fill?: string;
}

// ============================================================================
// Node Types (15 total)
// ============================================================================

/**
 * 1. frame — container with optional flexbox layout
 */
export interface FrameNode extends BaseNode {
  type: 'frame';
  children?: PenNode[];
  layout?: 'none' | 'vertical' | 'horizontal';
  gap?: number;
  padding?: number | [number, number] | [number, number, number, number];
  justifyContent?: 'start' | 'center' | 'end' | 'space_between' | 'space_around';
  alignItems?: 'start' | 'center' | 'end';
  fill?: string;
  stroke?: Stroke | string;
  cornerRadius?: number;
  clip?: boolean;
  reusable?: boolean;
  theme?: Theme;
  slot?: string[];
}

/**
 * 2. group — container without layout
 */
export interface GroupNode extends BaseNode {
  type: 'group';
  children?: PenNode[];
  layout?: 'none' | 'vertical' | 'horizontal';
}

/**
 * 3. text — text content node
 */
export interface TextNode extends BaseNode {
  type: 'text';
  content: string | TextStyle[];
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string | number;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  fill?: string;
  lineHeight?: number;
  textAlignVertical?: 'top' | 'middle' | 'bottom';
}

/**
 * 4. icon_font — icon from an icon font (e.g. Lucide)
 */
export interface IconFontNode extends BaseNode {
  type: 'icon_font';
  iconFontName: string;
  iconFontFamily: string;
  fill?: string;
}

/**
 * 5. ref — component instance reference
 */
export interface RefNode extends BaseNode {
  type: 'ref';
  ref: string;
  descendants?: Record<string, Record<string, unknown>>;
}

/**
 * 6. rectangle — filled rectangle shape
 */
export interface RectangleNode extends BaseNode {
  type: 'rectangle';
  fill?: string;
  stroke?: Stroke | string;
  cornerRadius?: number;
}

/**
 * 7. ellipse — ellipse / arc shape
 */
export interface EllipseNode extends BaseNode {
  type: 'ellipse';
  fill?: string;
  stroke?: Stroke | string;
  startAngle?: number;
  endAngle?: number;
}

/**
 * 8. line — straight line
 */
export interface LineNode extends BaseNode {
  type: 'line';
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  stroke?: Stroke | string;
}

/**
 * 9. polygon — regular polygon
 */
export interface PolygonNode extends BaseNode {
  type: 'polygon';
  sides?: number;
  fill?: string;
  stroke?: Stroke | string;
}

/**
 * 10. path — SVG-compatible path
 */
export interface PathNode extends BaseNode {
  type: 'path';
  d?: string;
  path?: string;
  fill?: string;
  stroke?: Stroke | string;
}

/**
 * 11. note — design annotation (not rendered)
 */
export interface NoteNode extends BaseNode {
  type: 'note';
  content: string;
}

/**
 * 12. prompt — AI prompt annotation (not rendered)
 */
export interface PromptNode extends BaseNode {
  type: 'prompt';
  content: string;
  model?: string;
}

/**
 * 13. context — context information annotation (not rendered)
 */
export interface ContextNode extends BaseNode {
  type: 'context';
  content: string;
}

/**
 * 14. vector — imported vector graphic
 */
export interface VectorNode extends BaseNode {
  type: 'vector';
  fill?: string;
  stroke?: Stroke | string;
}

/**
 * 15. instance — component instance with overrides
 */
export interface InstanceNode extends BaseNode {
  type: 'instance';
  ref: string;
  overrides?: Record<string, unknown>;
}

/**
 * Discriminated union of all 15 PenNode types
 */
export type PenNode =
  | FrameNode
  | GroupNode
  | TextNode
  | IconFontNode
  | RefNode
  | RectangleNode
  | EllipseNode
  | LineNode
  | PolygonNode
  | PathNode
  | NoteNode
  | PromptNode
  | ContextNode
  | VectorNode
  | InstanceNode;

// ============================================================================
// Document Root
// ============================================================================

/**
 * Root .pen document structure
 */
export interface PenDocument {
  version: string;
  /** Theme dimensions e.g. { "Mode": ["Light","Dark"], "Base": ["Zinc",...] } */
  themes?: Record<string, string[]>;
  /** Design token variables keyed by CSS-var-style name */
  variables?: Record<string, PenVariable>;
  children: PenNode[];
}

// ============================================================================
// Complex Fill / Stroke Types (used by style-utils)
// ============================================================================

/**
 * RGBA color object
 */
export interface PenColor {
  r: number; // 0–255
  g: number; // 0–255
  b: number; // 0–255
  a: number; // 0–1
}

/**
 * 2D point / vector
 */
export interface PenVector {
  x: number;
  y: number;
}

/**
 * Gradient color stop
 */
export interface PenGradientStop {
  position: number; // 0–1
  color: string | PenColor;
}

/**
 * Solid color fill
 */
export interface PenSolidFill {
  type: 'solid';
  color: string | PenColor;
  opacity?: number;
}

/**
 * Linear / radial / angular gradient fill
 */
export interface PenGradientFill {
  type: 'gradient';
  gradientType: 'linear' | 'radial' | 'angular';
  stops: PenGradientStop[];
  start?: PenVector;
  end?: PenVector;
  opacity?: number;
}

/**
 * Image fill
 */
export interface PenImageFill {
  type: 'image';
  imageRef: string;
  scaleMode?: 'fill' | 'fit' | 'crop' | 'tile';
  opacity?: number;
}

/**
 * Fill discriminated union
 */
export type PenFill = PenSolidFill | PenGradientFill | PenImageFill;

/**
 * Complex stroke descriptor (used by style-utils)
 */
export interface PenStroke {
  color: string | PenColor;
  width: number;
  opacity?: number;
  lineJoin?: 'miter' | 'round' | 'bevel';
  lineCap?: 'butt' | 'round' | 'square';
  dashPattern?: number[];
  dashOffset?: number;
}
