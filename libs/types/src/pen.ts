/**
 * PenFile v2.8 Type Definitions
 * Comprehensive types for the .pen vector graphics format
 */

// ============================================================================
// Base Types
// ============================================================================

/**
 * RGBA color representation
 */
export interface PenColor {
  r: number; // 0-255
  g: number; // 0-255
  b: number; // 0-255
  a: number; // 0-1
}

/**
 * 2D point or vector
 */
export interface PenVector {
  x: number;
  y: number;
}

/**
 * Rectangle bounds
 */
export interface PenBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 2D transformation matrix
 */
export interface PenTransform {
  a: number; // Scale X
  b: number; // Skew Y
  c: number; // Skew X
  d: number; // Scale Y
  tx: number; // Translate X
  ty: number; // Translate Y
}

// ============================================================================
// Fill Types
// ============================================================================

/**
 * Solid color fill
 */
export interface PenSolidFill {
  type: 'solid';
  color: string | PenColor; // Hex string or RGBA
  opacity?: number; // 0-1
}

/**
 * Gradient stop
 */
export interface PenGradientStop {
  position: number; // 0-1
  color: string | PenColor;
}

/**
 * Linear or radial gradient fill
 */
export interface PenGradientFill {
  type: 'gradient';
  gradientType: 'linear' | 'radial' | 'angular';
  stops: PenGradientStop[];
  start?: PenVector; // Gradient start point
  end?: PenVector; // Gradient end point
  opacity?: number; // 0-1
}

/**
 * Image fill
 */
export interface PenImageFill {
  type: 'image';
  imageRef: string; // Reference to image asset
  scaleMode?: 'fill' | 'fit' | 'crop' | 'tile';
  opacity?: number; // 0-1
  transform?: PenTransform;
}

/**
 * Fill union type
 */
export type PenFill = PenSolidFill | PenGradientFill | PenImageFill;

// ============================================================================
// Stroke Types
// ============================================================================

/**
 * Stroke configuration
 */
export interface PenStroke {
  color: string | PenColor;
  width: number;
  opacity?: number; // 0-1
  lineJoin?: 'miter' | 'round' | 'bevel';
  lineCap?: 'butt' | 'round' | 'square';
  dashPattern?: number[]; // Array of dash lengths
  dashOffset?: number;
}

// ============================================================================
// Effect Types
// ============================================================================

/**
 * Drop shadow effect
 */
export interface PenDropShadowEffect {
  type: 'drop-shadow';
  color: string | PenColor;
  offset: PenVector;
  blur: number;
  spread?: number;
}

/**
 * Inner shadow effect
 */
export interface PenInnerShadowEffect {
  type: 'inner-shadow';
  color: string | PenColor;
  offset: PenVector;
  blur: number;
  spread?: number;
}

/**
 * Blur effect
 */
export interface PenBlurEffect {
  type: 'blur';
  radius: number;
}

/**
 * Effect union type
 */
export type PenEffect = PenDropShadowEffect | PenInnerShadowEffect | PenBlurEffect;

// ============================================================================
// Variable & Theme Types
// ============================================================================

/**
 * Design variable with theme-dependent values
 */
export interface PenVariable {
  id: string;
  name: string;
  type: 'color' | 'number' | 'string' | 'boolean';
  values: Record<string, unknown>; // Theme ID -> value mapping
  description?: string;
}

/**
 * Design theme
 */
export interface PenTheme {
  id: string;
  name: string;
  description?: string;
  variables?: Record<string, unknown>; // Variable overrides for this theme
}

// ============================================================================
// Node Base
// ============================================================================

/**
 * Base properties shared by all node types
 */
export interface PenNodeBase {
  id: string;
  name?: string;
  visible?: boolean;
  locked?: boolean;
  opacity?: number; // 0-1
  blendMode?: 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten';
  transform?: PenTransform;
  bounds?: PenBounds;
  effects?: PenEffect[];
}

// ============================================================================
// Container Nodes
// ============================================================================

/**
 * Frame node (container with layout)
 */
export interface PenFrame extends PenNodeBase {
  type: 'frame';
  children: PenNode[];
  fills?: PenFill[];
  strokes?: PenStroke[];
  cornerRadius?: number;
  clipsContent?: boolean;
  layoutMode?: 'none' | 'horizontal' | 'vertical';
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  itemSpacing?: number;
}

/**
 * Group node (container without layout)
 */
export interface PenGroup extends PenNodeBase {
  type: 'group';
  children: PenNode[];
}

// ============================================================================
// Shape Nodes
// ============================================================================

/**
 * Rectangle shape
 */
export interface PenRectangle extends PenNodeBase {
  type: 'rectangle';
  width: number;
  height: number;
  fills?: PenFill[];
  strokes?: PenStroke[];
  cornerRadius?: number | [number, number, number, number]; // Uniform or per-corner
}

/**
 * Ellipse shape
 */
export interface PenEllipse extends PenNodeBase {
  type: 'ellipse';
  width: number;
  height: number;
  fills?: PenFill[];
  strokes?: PenStroke[];
  startAngle?: number; // For arcs
  endAngle?: number; // For arcs
}

/**
 * Line shape
 */
export interface PenLine extends PenNodeBase {
  type: 'line';
  start: PenVector;
  end: PenVector;
  stroke?: PenStroke;
}

/**
 * Polygon shape
 */
export interface PenPolygon extends PenNodeBase {
  type: 'polygon';
  points: PenVector[];
  fills?: PenFill[];
  strokes?: PenStroke[];
  closed?: boolean;
}

/**
 * Path shape (SVG-like paths)
 */
export interface PenPath extends PenNodeBase {
  type: 'path';
  pathData: string; // SVG path data format
  fills?: PenFill[];
  strokes?: PenStroke[];
}

// ============================================================================
// Text Nodes
// ============================================================================

/**
 * Text node
 */
export interface PenText extends PenNodeBase {
  type: 'text';
  content: string;
  fontSize: number;
  fontFamily: string;
  fontWeight?: number | 'normal' | 'bold' | 'lighter' | 'bolder';
  fontStyle?: 'normal' | 'italic' | 'oblique';
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  textDecoration?: 'none' | 'underline' | 'overline' | 'line-through';
  lineHeight?: number | string;
  letterSpacing?: number;
  fills?: PenFill[];
  strokes?: PenStroke[];
}

/**
 * Icon font node (icon/emoji from font)
 */
export interface PenIconFont extends PenNodeBase {
  type: 'icon-font';
  character: string; // Unicode character
  fontFamily: string;
  fontSize: number;
  fills?: PenFill[];
  strokes?: PenStroke[];
}

// ============================================================================
// Reference & Instance Nodes
// ============================================================================

/**
 * Reference to external asset or component
 */
export interface PenRef extends PenNodeBase {
  type: 'ref';
  refId: string; // Reference to another node or external asset
  overrides?: Record<string, unknown>; // Property overrides
}

/**
 * Image node
 */
export interface PenImage extends PenNodeBase {
  type: 'image';
  imageRef: string; // Reference to image asset
  width: number;
  height: number;
  preserveAspectRatio?: boolean;
}

/**
 * Vector graphic node (imported vector graphic)
 */
export interface PenVectorGraphic extends PenNodeBase {
  type: 'vector';
  vectorData: string; // SVG or other vector format
  fills?: PenFill[];
  strokes?: PenStroke[];
}

/**
 * Component instance
 */
export interface PenInstance extends PenNodeBase {
  type: 'instance';
  componentId: string; // Reference to component definition
  overrides?: Record<string, unknown>; // Property overrides
}

// ============================================================================
// Node Union Type
// ============================================================================

/**
 * Discriminated union of all node types
 */
export type PenNode =
  | PenFrame
  | PenGroup
  | PenRectangle
  | PenEllipse
  | PenLine
  | PenPolygon
  | PenPath
  | PenText
  | PenIconFont
  | PenRef
  | PenImage
  | PenVectorGraphic
  | PenInstance;

// ============================================================================
// Document Root
// ============================================================================

/**
 * Root document structure
 */
export interface PenDocument {
  version: string; // Format version (e.g., "2.8")
  name?: string;
  width?: number;
  height?: number;
  themes: PenTheme[];
  variables: PenVariable[];
  children: PenNode[];
  assets?: Record<string, string>; // Asset ID -> URL/data mapping
  metadata?: Record<string, unknown>;
}
