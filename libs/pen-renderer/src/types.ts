/**
 * TypeScript types for the .pen v2.8 file format.
 *
 * These types are derived from the Pencil MCP schema and validated
 * against the real shadcn-kit.pen design system file.
 */

// ─── Theme System ────────────────────────────────────────────────

/** A theme axis defines one dimension of the theme matrix (e.g., Mode: Light/Dark) */
export interface PenThemeAxis {
  name: string;
  values: string[];
}

/** Theme selection — maps axis names to their chosen values */
export type PenThemeSelection = Record<string, string>;

/** A single themed value entry — optionally scoped to specific theme axes */
export interface PenThemedValue {
  value: string | number | boolean;
  theme?: PenThemeSelection;
}

/** Variable definition with optional themed values */
export interface PenVariable {
  type: 'color' | 'number' | 'string' | 'boolean';
  value: PenThemedValue[];
}

// ─── Fill & Stroke ───────────────────────────────────────────────

/** Gradient stop */
export interface PenGradientStop {
  color: string;
  position: number;
}

/** Linear gradient */
export interface PenLinearGradient {
  type: 'linear';
  angle: number;
  stops: PenGradientStop[];
}

/** Radial gradient */
export interface PenRadialGradient {
  type: 'radial';
  cx?: number;
  cy?: number;
  stops: PenGradientStop[];
}

/** Angular gradient */
export interface PenAngularGradient {
  type: 'angular';
  angle?: number;
  stops: PenGradientStop[];
}

/** Image fill */
export interface PenImageFill {
  type: 'image';
  url: string;
  fit?: 'cover' | 'contain' | 'fill' | 'none';
}

/** All fill types */
export type PenFill =
  | string
  | PenLinearGradient
  | PenRadialGradient
  | PenAngularGradient
  | PenImageFill;

/** Stroke thickness — can be uniform number or per-side */
export type PenStrokeThickness =
  | number
  | { top?: number; right?: number; bottom?: number; left?: number };

/** Stroke definition */
export interface PenStroke {
  fill?: PenFill;
  align?: 'inside' | 'center' | 'outside';
  thickness?: PenStrokeThickness;
  dash?: number[];
}

// ─── Layout ──────────────────────────────────────────────────────

export type PenLayoutMode = 'none' | 'vertical' | 'horizontal';

export type PenJustifyContent =
  | 'start'
  | 'center'
  | 'end'
  | 'space_between'
  | 'space_around'
  | 'space_evenly';

export type PenAlignItems = 'start' | 'center' | 'end' | 'stretch' | 'baseline';

/** Padding: number (uniform), [v, h], or [top, right, bottom, left] */
export type PenPadding = number | [number, number] | [number, number, number, number];

/** Sizing: number (px), "fill_container", "fill_container(min)", "fit_content", or "fit_content(max)" */
export type PenSize = number | string;

// ─── Corner Radius ───────────────────────────────────────────────

/** Corner radius: uniform number or [topLeft, topRight, bottomRight, bottomLeft] */
export type PenCornerRadius = number | [number, number, number, number];

// ─── Text Styles ─────────────────────────────────────────────────

export type PenTextAlign = 'left' | 'center' | 'right' | 'justify';
export type PenVerticalAlign = 'top' | 'middle' | 'bottom';
export type PenTextDecoration = 'none' | 'underline' | 'line-through';
export type PenTextTransform = 'none' | 'uppercase' | 'lowercase' | 'capitalize';

// ─── Node Types ──────────────────────────────────────────────────

/** Base properties shared by all nodes */
export interface PenNodeBase {
  id: string;
  name?: string;
  type: string;
  x?: number;
  y?: number;
  rotation?: number;
  opacity?: number;
  visible?: boolean;
  locked?: boolean;
  /** When true, this node is a reusable component definition */
  reusable?: boolean;
  /** Theme selection for this node and its subtree */
  theme?: PenThemeSelection;
}

/** Frame node — the primary container, maps to CSS flexbox */
export interface PenFrame extends PenNodeBase {
  type: 'frame';
  width?: PenSize;
  height?: PenSize;
  fill?: PenFill;
  stroke?: PenStroke;
  cornerRadius?: PenCornerRadius;
  clip?: boolean;
  layout?: PenLayoutMode;
  gap?: number;
  padding?: PenPadding;
  justifyContent?: PenJustifyContent;
  alignItems?: PenAlignItems;
  /** If true, acts as a placeholder container */
  placeholder?: boolean;
  children?: PenNode[];
}

/** Text node */
export interface PenText extends PenNodeBase {
  type: 'text';
  content: string;
  width?: PenSize;
  height?: PenSize;
  /** Text color — uses `fill` property in .pen format */
  fill?: PenFill;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  fontStyle?: string;
  lineHeight?: number | string;
  letterSpacing?: number;
  textAlign?: PenTextAlign;
  verticalAlign?: PenVerticalAlign;
  textDecoration?: PenTextDecoration;
  textTransform?: PenTextTransform;
}

/** Rectangle node */
export interface PenRectangle extends PenNodeBase {
  type: 'rectangle';
  width?: PenSize;
  height?: PenSize;
  fill?: PenFill;
  stroke?: PenStroke;
  cornerRadius?: PenCornerRadius;
}

/** Ellipse node */
export interface PenEllipse extends PenNodeBase {
  type: 'ellipse';
  width?: PenSize;
  height?: PenSize;
  fill?: PenFill;
  stroke?: PenStroke;
}

/** Line node */
export interface PenLine extends PenNodeBase {
  type: 'line';
  x2?: number;
  y2?: number;
  stroke?: PenStroke;
}

/** Icon font node (e.g., Lucide icons) */
export interface PenIconFont extends PenNodeBase {
  type: 'icon_font';
  width?: PenSize;
  height?: PenSize;
  fill?: PenFill;
  iconFontFamily?: string;
  iconFontName?: string;
}

/** Group node — transparent container */
export interface PenGroup extends PenNodeBase {
  type: 'group';
  width?: PenSize;
  height?: PenSize;
  children?: PenNode[];
}

/** Path node */
export interface PenPath extends PenNodeBase {
  type: 'path';
  width?: PenSize;
  height?: PenSize;
  fill?: PenFill;
  stroke?: PenStroke;
  geometry?: string;
}

/** Polygon node */
export interface PenPolygon extends PenNodeBase {
  type: 'polygon';
  width?: PenSize;
  height?: PenSize;
  fill?: PenFill;
  stroke?: PenStroke;
  sides?: number;
}

/** Ref node — instance of a reusable component */
export interface PenRef extends PenNodeBase {
  type: 'ref';
  /** ID of the referenced reusable component */
  ref: string;
  width?: PenSize;
  height?: PenSize;
  fill?: PenFill;
  stroke?: PenStroke;
  /** Override properties on descendant nodes, keyed by node ID or slash-separated path */
  descendants?: Record<string, Partial<PenNode>>;
  children?: PenNode[];
}

/** Note node (design annotations) */
export interface PenNote extends PenNodeBase {
  type: 'note';
  content?: string;
  width?: PenSize;
  height?: PenSize;
}

/** Union of all node types */
export type PenNode =
  | PenFrame
  | PenText
  | PenRectangle
  | PenEllipse
  | PenLine
  | PenIconFont
  | PenGroup
  | PenPath
  | PenPolygon
  | PenRef
  | PenNote;

// ─── Document ────────────────────────────────────────────────────

/** Theme axes as stored in .pen files — maps axis name to array of values */
export type PenThemeAxes = Record<string, string[]>;

/** Top-level .pen document */
export interface PenDocument {
  version: string;
  /** Theme axes: e.g., { Mode: ["Light", "Dark"], Base: ["Zinc", "Slate", ...] } */
  themes?: PenThemeAxes;
  variables?: Record<string, PenVariable>;
  children: PenNode[];
}

// ─── Resolved Types (output of processing pipeline) ──────────────

/** CSS styles computed from a PEN node */
export interface ResolvedStyles {
  display?: string;
  flexDirection?: string;
  justifyContent?: string;
  alignItems?: string;
  gap?: string;
  padding?: string;
  width?: string;
  height?: string;
  minWidth?: string;
  minHeight?: string;
  maxWidth?: string;
  maxHeight?: string;
  flex?: string;
  backgroundColor?: string;
  color?: string;
  borderRadius?: string;
  border?: string;
  borderTop?: string;
  borderRight?: string;
  borderBottom?: string;
  borderLeft?: string;
  overflow?: string;
  position?: string;
  left?: string;
  top?: string;
  opacity?: string;
  transform?: string;
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  fontStyle?: string;
  lineHeight?: string;
  letterSpacing?: string;
  textAlign?: string;
  textDecoration?: string;
  textTransform?: string;
  boxSizing?: string;
  [key: string]: string | undefined;
}

/** A fully resolved node ready for rendering */
export interface ResolvedNode {
  id: string;
  type: string;
  name?: string;
  styles: ResolvedStyles;
  /** For text nodes */
  content?: string;
  /** For icon_font nodes */
  iconFamily?: string;
  iconName?: string;
  /** Whether this is a reusable component definition */
  reusable?: boolean;
  children?: ResolvedNode[];
}
